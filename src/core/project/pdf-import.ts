// PanelForge — PDF import (S3.10, text layer only).
//
// Extractable-text PDFs → normalized text with an offset map (S3.2
// contract); the original `.pdf` is preserved via S3.1. Scanned-only
// PDFs report text as Unknown (extraction status "scanned") — OCR is
// deferred by design and never silent.
//
// Parser decision (owner, 2026-11-05): zero-new-dependency reader —
// Node `zlib` FlateDecode + PDF content-stream operators (Tj/TJ) +
// ToUnicode CMap subset (WinAnsi fallback). No new dependency.
//
// Reading order is object order (stream concatenation); page-tree
// sorting is a later refinement.

import * as zlib from "zlib";
import * as fs from "fs";
import * as path from "path";
import { identifyProject } from "./service";
import { importManuscript, ManuscriptRecord, ManuscriptError } from "./manuscripts";
import { normalizeManuscriptBytes } from "./text-normalize";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type PdfExtractionStatus = "extracted" | "scanned";

export class PdfError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PdfError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new PdfError(identified.code, identified.message);
  }
}

function invalid(message: string): PdfError {
  return new PdfError("INVALID_FORMAT", message);
}

/** All stream payloads (inflated when FlateDecode), in object order. */
export function extractPdfStreams(buf: Buffer): Buffer[] {
  if (!buf.subarray(0, 8).toString("latin1").startsWith("%PDF-")) {
    throw invalid("not a PDF (missing %PDF header)");
  }
  const streams: Buffer[] = [];
  const streamRe = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(buf.toString("latin1"))) !== null) {
    // Skip "endstream" continuations (the regex also matches inside it).
    if (match.index > 0 && buf[match.index - 1] === 100) continue;
    const start = match.index + match[0].length;
    const endIdx = buf.indexOf("endstream", start);
    if (endIdx < 0) throw invalid("unterminated stream");
    let raw = buf.subarray(start, endIdx);
    // Strip a single trailing EOL before endstream (not payload).
    if (raw.length >= 2 && raw[raw.length - 2] === 13 && raw[raw.length - 1] === 10) raw = raw.subarray(0, raw.length - 2);
    else if (raw.length >= 1 && (raw[raw.length - 1] === 10 || raw[raw.length - 1] === 13)) raw = raw.subarray(0, raw.length - 1);
    // Decide inflate from the dictionary window just before "stream".
    const dictWindow = buf.subarray(Math.max(0, match.index - 300), match.index).toString("latin1");
    if (/\/FlateDecode/.test(dictWindow)) {
      try {
        raw = zlib.inflateSync(raw);
      } catch {
        throw invalid("FlateDecode inflate failed");
      }
    }
    streams.push(Buffer.from(raw));
  }
  return streams;
}

// ---- ToUnicode CMap subset ----

type CMap = Map<number, string>;

function parseToUnicodeCMap(cmapText: string): CMap {
  const map: CMap = new Map();
  for (const section of cmapText.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of section[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(m[1], 16), String.fromCodePoint(parseInt(m[2], 16)));
    }
  }
  for (const section of cmapText.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const line of section[1].split(/\r?\n/)) {
      const m = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/.exec(line.trim());
      if (m) {
        const lo = parseInt(m[1], 16);
        const hi = parseInt(m[2], 16);
        const uni = parseInt(m[3], 16);
        for (let code = lo; code <= hi && code - lo <= 256; code++) {
          map.set(code, String.fromCodePoint(uni + (code - lo)));
        }
      }
    }
  }
  return map;
}

function decodePdfBytes(bytes: Buffer, cmap: CMap | null): string {
  let out = "";
  for (const byte of bytes) {
    if (cmap && cmap.has(byte)) {
      out += cmap.get(byte) as string;
    } else if (byte >= 32 && byte <= 126) {
      out += String.fromCharCode(byte);
    } else if (byte === 10 || byte === 13) {
      out += "\n";
    }
    // Unmapped non-printables are dropped (never guessed).
  }
  return out;
}

// ---- Content-stream text extraction ----

/** Extract markdown-shaped text from one content stream. */
export function extractContentStream(text: string, cmap: CMap | null): string {
  // Tj strings: ( ... ) Tj — honor escaped parens.
  const lines: string[] = [];
  let current = "";
  let i = 0;
  const pushLine = () => {
    if (current !== "") {
      lines.push(current);
      current = "";
    }
  };
  while (i < text.length) {
    if (text[i] === "(") {
      // Read literal string.
      let depth = 1;
      let j = i + 1;
      const bytes: number[] = [];
      while (j < text.length && depth > 0) {
        const ch = text[j];
        if (ch === "\\") {
          const next = text[j + 1];
          if (next === "n") bytes.push(10);
          else if (next === "r") bytes.push(13);
          else if (next === "t") bytes.push(9);
          else if (next === "\\" || next === "(" || next === ")") bytes.push(next.charCodeAt(0));
          else bytes.push(next ? next.charCodeAt(0) : 32);
          j += 2;
          continue;
        }
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else bytes.push(ch.charCodeAt(0) & 0xff);
        j++;
      }
      // Followed by Tj or inside TJ array?
      const after = text.slice(j, j + 6);
      if (/^\s*Tj\b/.test(after)) {
        pushLine();
        current += decodePdfBytes(Buffer.from(bytes), cmap);
      }
      i = j;
      continue;
    }
    if (text[i] === "[") {
      // TJ array: extract strings, join with spacing numbers as spaces.
      const end = text.indexOf("]", i);
      const trailer = text.slice(end, end + 8);
      if (/TJ\b/.test(trailer)) {
        pushLine();
        const arrayText = text.slice(i, end);
        for (const s of arrayText.matchAll(/\((?:[^\\()]|\\.)*\)/g)) {
          const inner = s[0].slice(1, -1).replace(/\\(.)/g, "$1");
          current += decodePdfBytes(Buffer.from(inner, "latin1"), cmap);
        }
      }
      i = end + 1;
      continue;
    }
    if (text.slice(i, i + 2) === "Td" || text.slice(i, i + 2) === "TD" || text.slice(i, i + 2) === "T*") {
      pushLine();
      i += 2;
      continue;
    }
    i++;
  }
  pushLine();
  return lines.join("\n");
}

/** Extract readable text from a whole PDF buffer ("scanned" when empty). */
export function extractPdfText(buf: Buffer): { status: PdfExtractionStatus; text: string } {
  const streams = extractPdfStreams(buf);
  const cmap: CMap | null = (() => {
    for (const stream of streams) {
      const text = stream.toString("latin1");
      if (text.includes("beginbfchar") || text.includes("beginbfrange")) {
        return parseToUnicodeCMap(text);
      }
    }
    return null;
  })();
  const pages: string[] = [];
  for (const stream of streams) {
    const text = stream.toString("latin1");
    if (text.includes("BT") && (text.includes("Tj") || text.includes("TJ"))) {
      const extracted = extractContentStream(text, cmap);
      if (extracted.trim() !== "") pages.push(extracted.trim());
    }
  }
  if (pages.length === 0) return { status: "scanned", text: "" };
  return { status: "extracted", text: pages.join("\n\n") + "\n" };
}

/**
 * Import a .pdf: preserve the original (S3.1); persist normalization
 * when text extracts (S3.2). Scanned PDFs get a record with status
 * "scanned" and NO normalization row (callers read Unknown).
 */
export async function importPdfManuscript(
  root: string,
  input: { sourceAbsolutePath: string; title?: string }
): Promise<ManuscriptRecord & { extraction: PdfExtractionStatus }> {
  requireProject(root);
  if (typeof input.sourceAbsolutePath !== "string" || !path.isAbsolute(input.sourceAbsolutePath)) {
    throw new PdfError("INVALID_ARGUMENTS", "sourceAbsolutePath must be an absolute path");
  }
  if (!fs.existsSync(input.sourceAbsolutePath) || !fs.statSync(input.sourceAbsolutePath).isFile()) {
    throw new ManuscriptError("SOURCE_NOT_FOUND", `Source file does not exist: ${input.sourceAbsolutePath}`);
  }
  const { status, text } = extractPdfText(fs.readFileSync(input.sourceAbsolutePath));
  const manuscript = await importManuscript(root, {
    sourceAbsolutePath: input.sourceAbsolutePath,
    title: input.title,
    format: "pdf",
  });
  if (status === "extracted") {
    const { normalized, offsetMap } = normalizeManuscriptBytes(Buffer.from(text, "utf8"));
    const now = new Date().toISOString();
    await enqueueWrite(async () => {
      const { db } = openProjectDatabase(root);
      try {
        return await runWithBusyRetry<void>(() => {
          db.prepare("INSERT OR REPLACE INTO normalization (manuscript_id, normalized_text, offset_map, created_at) VALUES (?, ?, ?, ?)")
            .run(manuscript.manuscriptId, normalized, JSON.stringify(offsetMap), now);
        });
      } finally {
        db.close();
      }
    });
  }
  return { ...manuscript, extraction: status };
}
