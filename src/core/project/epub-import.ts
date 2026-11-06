// PanelForge — EPUB import (S3.9).
//
// EPUB manuscripts → spine-ordered normalized text with an offset map
// (S3.2 contract); the original `.epub` is preserved via S3.1.
//
// Parser decision (owner, 2026-11-05): zero-new-dependency — reuses
// the S3.8 ZIP reader. container.xml locates the OPF; the OPF spine
// orders XHTML documents; each document's text (h1–h6 → `#` markers)
// joins with blank lines.
//
// MathML, footnotes, and SVG fidelity are out of scope: only the
// XHTML text flow is extracted.

import * as fs from "fs";
import * as path from "path";
import { identifyProject } from "./service";
import { importManuscript, ManuscriptRecord, ManuscriptError } from "./manuscripts";
import { normalizeManuscriptBytes } from "./text-normalize";
import { readZipEntries } from "./docx-import";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export class EpubError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EpubError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new EpubError(identified.code, identified.message);
  }
}

function invalid(message: string): EpubError {
  return new EpubError("INVALID_FORMAT", message);
}

/** Rootfile path from META-INF/container.xml, or null. */
export function epubRootfilePath(containerXml: string): string | null {
  const match = /<rootfile[^>]*full-path="([^"]+)"/i.exec(containerXml);
  return match ? match[1] : null;
}

/** Spine-ordered item hrefs from the OPF (manifest id → href, spine order). */
export function epubSpineOrder(opf: string): string[] {
  const manifest = new Map<string, string>();
  for (const match of opf.matchAll(/<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"/gi)) {
    manifest.set(match[1], match[2]);
  }
  const order: string[] = [];
  for (const match of opf.matchAll(/<itemref[^>]*idref="([^"]+)"/gi)) {
    const href = manifest.get(match[1]);
    if (href) order.push(href);
  }
  return order;
}

function decodeHtmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Extract markdown-shaped blocks from one XHTML document. */
export function extractXhtmlText(xhtml: string): string[] {
  const blocks: string[] = [];
  // Strip scripts/styles first (never content).
  const stripped = xhtml.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const blockTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "div", "section", "article"]);
  const tagRe = /<([^>]+)>/g;
  let lastIndex = 0;
  let current: string[] = [];
  let currentPrefix = "";
  let inBlock = false;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(stripped)) !== null) {
    const textBefore = stripped.slice(lastIndex, match.index);
    lastIndex = tagRe.lastIndex;
    if (inBlock && textBefore !== "") {
      current.push(decodeHtmlText(textBefore).replace(/\s+/g, " "));
    }
    const tag = match[1].trim();
    const isClose = tag.startsWith("/");
    const name = tag.replace(/^\//, "").toLowerCase();
    if (blockTags.has(name) && !isClose) {
      if (inBlock) {
        const joined = (currentPrefix + current.join("")).trim();
        if (joined !== "") blocks.push(joined);
      }
      inBlock = true;
      current = [];
      currentPrefix = /^h([1-6])$/.exec(name) ? "#".repeat(Math.min(3, Number(/^h([1-6])$/.exec(name)?.[1] ?? 1))) + " " : "";
    } else if (blockTags.has(name) && isClose) {
      if (inBlock) {
        const joined = (currentPrefix + current.join("")).trim();
        if (joined !== "") blocks.push(joined);
      }
      inBlock = false;
    } else if (inBlock && (name === "br" || name === "br/")) {
      current.push("\n");
    }
  }
  return blocks;
}

/** Join spine documents into one normalized-ready text. */
export function extractEpubText(entries: Array<{ name: string; data: Buffer }>): string {
  const container = entries.find((e) => e.name === "META-INF/container.xml");
  if (!container) throw invalid("no META-INF/container.xml (not an EPUB)");
  const rootfile = epubRootfilePath(container.data.toString("utf8"));
  if (!rootfile) throw invalid("container.xml names no rootfile");
  const opfEntry = entries.find((e) => e.name === rootfile);
  if (!opfEntry) throw invalid(`rootfile ${rootfile} not in archive`);
  const order = epubSpineOrder(opfEntry.data.toString("utf8"));
  if (order.length === 0) throw invalid("OPF spine is empty");
  const baseDir = path.posix.dirname(rootfile);
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const blocks: string[] = [];
  for (const href of order) {
    const fullName = baseDir === "." || baseDir === "" ? href : path.posix.join(baseDir, href);
    const data = byName.get(fullName);
    if (!data) throw invalid(`spine document ${fullName} not in archive`);
    blocks.push(...extractXhtmlText(data.toString("utf8")));
  }
  return blocks.join("\n\n") + (blocks.length > 0 ? "\n" : "");
}

/**
 * Import an .epub: preserve the original (S3.1), extract in spine
 * order, normalize (S3.2), and persist both. Returns the record.
 */
export async function importEpubManuscript(
  root: string,
  input: { sourceAbsolutePath: string; title?: string }
): Promise<ManuscriptRecord> {
  requireProject(root);
  if (typeof input.sourceAbsolutePath !== "string" || !path.isAbsolute(input.sourceAbsolutePath)) {
    throw new EpubError("INVALID_ARGUMENTS", "sourceAbsolutePath must be an absolute path");
  }
  if (!fs.existsSync(input.sourceAbsolutePath) || !fs.statSync(input.sourceAbsolutePath).isFile()) {
    throw new ManuscriptError("SOURCE_NOT_FOUND", `Source file does not exist: ${input.sourceAbsolutePath}`);
  }
  const entries = readZipEntries(fs.readFileSync(input.sourceAbsolutePath));
  const extracted = extractEpubText(entries);
  if (extracted.trim() === "") throw invalid("no extractable text in spine documents");
  const manuscript = await importManuscript(root, {
    sourceAbsolutePath: input.sourceAbsolutePath,
    title: input.title,
    format: "epub",
  });
  const { normalized, offsetMap } = normalizeManuscriptBytes(Buffer.from(extracted, "utf8"));
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<ManuscriptRecord>(() => {
        db.prepare("INSERT OR REPLACE INTO normalization (manuscript_id, normalized_text, offset_map, created_at) VALUES (?, ?, ?, ?)")
          .run(manuscript.manuscriptId, normalized, JSON.stringify(offsetMap), now);
        return manuscript;
      });
    } finally {
      db.close();
    }
  });
}
