// PanelForge — DOCX import (S3.8).
//
// MS Word manuscripts → normalized text with an offset map (S3.2
// contract); the original `.docx` is preserved via S3.1.
//
// Parser decision (owner, 2026-11-05): zero-new-dependency reader is
// the smallest pure-JS surface — Node `zlib` ZIP inflate + an XML
// tokenizer for `word/document.xml`. No new dependency is installed.
//
// Extracted structure:
// - paragraphs (w:p) → blocks separated by blank lines
// - Heading1..Heading3 styles → `#`/`##`/`###` markdown markers
// - tabs (w:tab) → tab; breaks (w:br) → newline; text runs (w:t) → text
//
// Tracked changes, comments, and revision semantics are out of scope:
// only the current accepted text is extracted.

import * as zlib from "zlib";
import * as fs from "fs";
import * as path from "path";
import { identifyProject } from "./service";
import { importManuscript, ManuscriptRecord, ManuscriptError } from "./manuscripts";
import { normalizeManuscriptBytes } from "./text-normalize";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export class DocxError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DocxError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new DocxError(identified.code, identified.message);
  }
}

// ---- Minimal ZIP reader (stored + deflated entries) ----

type ZipEntry = { name: string; data: Buffer };

function findEocd(buf: Buffer): number {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

export function readZipEntries(buf: Buffer): ZipEntry[] {
  if (!Buffer.isBuffer(buf) || buf.length < 22) {
    throw new DocxError("INVALID_FORMAT", "not a ZIP/DOCX archive (too small)");
  }
  const eocd = findEocd(buf);
  if (eocd < 0) throw new DocxError("INVALID_FORMAT", "not a ZIP/DOCX archive (no end record)");
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let pos = cdOffset;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new DocxError("INVALID_FORMAT", "corrupt central directory");
    }
    const method = buf.readUInt16LE(pos + 10);
    const size = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    // Local header → data start.
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new DocxError("INVALID_FORMAT", `corrupt local header for ${name}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + size);
    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(compressed);
      } catch {
        throw new DocxError("INVALID_FORMAT", `deflate failed for ${name}`);
      }
    } else {
      throw new DocxError("INVALID_FORMAT", `unsupported compression ${method} for ${name}`);
    }
    entries.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ---- document.xml extraction ----

function decodeXmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

const HEADING_STYLE = /^Heading([1-6])$/;

/** Extract markdown-shaped text (paragraphs + heading markers) from document.xml. */
export function extractDocumentXml(xml: string): string {
  const blocks: string[] = [];
  // Tokenize tags; text between tags at paragraph depth is collected.
  const tagRe = /<([^>]+)>/g;
  let lastIndex = 0;
  let current: string[] = [];
  let currentPrefix = "";
  let inParagraph = false;
  let currentHeadingLevel = 0;
  let textRun = false;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml)) !== null) {
    const textBefore = xml.slice(lastIndex, match.index);
    lastIndex = tagRe.lastIndex;
    if (inParagraph && textRun && textBefore !== "") {
      current.push(decodeXmlText(textBefore));
    }
    const tag = match[1].trim();
    const isClose = tag.startsWith("/");
    const name = tag.replace(/^\//, "").replace(/\s.*$/, "").replace(/\/$/, "");
    const selfClose = tag.endsWith("/");
    if (name === "w:p" && !isClose) {
      inParagraph = true;
      current = [];
      currentPrefix = "";
      currentHeadingLevel = 0;
    } else if (name === "w:p" && isClose) {
      if (inParagraph) {
        const joined = (currentPrefix + current.join("")).trim();
        if (joined !== "") blocks.push(joined);
      }
      inParagraph = false;
      textRun = false;
    } else if (inParagraph && name === "w:pStyle" && !isClose) {
      const valMatch = /w:val="([^"]+)"/.exec(tag);
      const style = valMatch?.[1] ?? "";
      const level = HEADING_STYLE.exec(style)?.[1];
      if (level) {
        currentHeadingLevel = Number(level);
        currentPrefix = "#".repeat(Math.min(3, currentHeadingLevel)) + " ";
      }
    } else if (inParagraph && name === "w:t" && !isClose) {
      textRun = true;
    } else if (inParagraph && name === "w:t" && isClose) {
      textRun = false;
    } else if (inParagraph && (name === "w:tab" || name === "w:br") && !isClose) {
      current.push(name === "w:tab" ? "\t" : "\n");
    }
  }
  return blocks.join("\n\n") + (blocks.length > 0 ? "\n" : "");
}

function invalidDocx(message: string): DocxError {
  return new DocxError("INVALID_FORMAT", message);
}

/**
 * Import a .docx: preserve the original (S3.1), extract text, normalize
 * (S3.2), and persist both. Returns the manuscript record.
 */
export async function importDocxManuscript(
  root: string,
  input: { sourceAbsolutePath: string; title?: string }
): Promise<ManuscriptRecord> {
  requireProject(root);
  if (typeof input.sourceAbsolutePath !== "string" || !path.isAbsolute(input.sourceAbsolutePath)) {
    throw new DocxError("INVALID_ARGUMENTS", "sourceAbsolutePath must be an absolute path");
  }
  if (!fs.existsSync(input.sourceAbsolutePath) || !fs.statSync(input.sourceAbsolutePath).isFile()) {
    throw new ManuscriptError("SOURCE_NOT_FOUND", `Source file does not exist: ${input.sourceAbsolutePath}`);
  }
  const bytes = fs.readFileSync(input.sourceAbsolutePath);
  const entries = readZipEntries(bytes);
  const document = entries.find((e) => e.name === "word/document.xml");
  if (!document) throw invalidDocx("archive has no word/document.xml (not a DOCX document)");
  const extracted = extractDocumentXml(document.data.toString("utf8"));
  if (extracted.trim() === "") throw invalidDocx("no extractable text in document.xml");
  const { normalized } = normalizeManuscriptBytes(Buffer.from(extracted, "utf8"));
  const manuscript = await importManuscript(root, {
    sourceAbsolutePath: input.sourceAbsolutePath,
    title: input.title,
    format: "docx",
  });
  // Persist normalization rows (S3.2 contract) against the new record.
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const { offsetMap } = normalizeManuscriptBytes(Buffer.from(extracted, "utf8"));
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
