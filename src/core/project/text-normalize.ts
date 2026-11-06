// PanelForge — TXT/Markdown normalization with offset maps (S3.2).
//
// Ingests a preserved original (S3.1) and stores normalized text plus a
// char-offset map back to the original bytes (spec §15 Stage 3):
//
// - The ONLY transformation is line-ending folding (CRLF/CR → LF),
//   which is exactly reversible through the map: every normalized
//   character records the byte offset where its source sequence starts
//   in the original bytes, so splitting and joining normalized spans
//   reconstructs source offsets exactly.
// - Originals are never touched; the normalized copy is a derived,
//   regenerable artifact (manuscripts/processed/<id>.txt mirror).
//
// DOCX/EPUB/PDF parsers stay S3.8–S3.10 (no new deps here).

import * as fs from "fs";
import * as path from "path";
import { identifyProject } from "./service";
import { normalizeRelative, resolveInProject } from "./paths";
import {
  openProjectDatabase,
  enqueueWrite,
  runWithBusyRetry,
} from "./metadata";
import { getManuscript, readManuscriptOriginal, type ManuscriptError, ManuscriptRecord } from "./manuscripts";

export type Normalization = {
  manuscriptId: string;
  normalizedText: string;
  /** offsetMap[i] = byte offset in the original where normalized char i's source starts. Terminal entry holds the end offset. */
  offsetMap: number[];
  byteLength: number;
  createdAt: string;
};

export class NormalizationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "NormalizationError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new NormalizationError(identified.code, identified.message);
  }
}

/**
 * Fold line endings to LF, recording the source byte offset for every
 * normalized character. offsetMap has normalized.length + 1 entries;
 * the extra terminal entry is the end offset (original byteLength).
 */
export function normalizeManuscriptBytes(original: Buffer): { normalized: string; offsetMap: number[] } {
  const text = original.toString("utf8");
  // Map chars to byte offsets: walk code points, tracking UTF-8 bytes.
  const charByteOffsets: number[] = [];
  let bytePos = 0;
  for (const ch of text) {
    charByteOffsets.push(bytePos);
    bytePos += Buffer.byteLength(ch, "utf8");
  }
  charByteOffsets.push(bytePos);
  const normalizedChars: string[] = [];
  const offsetMap: number[] = [];
  let i = 0;
  const chars = Array.from(text);
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === "\r") {
      normalizedChars.push("\n");
      offsetMap.push(charByteOffsets[i]);
      // CRLF consumes the LF too (both bytes belong to this sequence).
      i += i + 1 < chars.length && chars[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    normalizedChars.push(ch);
    offsetMap.push(charByteOffsets[i]);
    i++;
  }
  offsetMap.push(bytePos);
  return { normalized: normalizedChars.join(""), offsetMap };
}

/**
 * Map a normalized span [normStart, normEnd) onto the original bytes.
 * The result is the exact original slice (folded sequences expand back
 * to their original CRLF/CR bytes).
 */
export function sourceSpanFor(
  original: Buffer,
  offsetMap: number[],
  normStart: number,
  normEnd: number
): Buffer {
  if (normStart < 0 || normEnd < normStart || normEnd > offsetMap.length - 1) {
    throw new NormalizationError("INVALID_ARGUMENTS", `Span out of range: [${normStart}, ${normEnd})`);
  }
  const start = offsetMap[normStart];
  const end = offsetMap[normEnd];
  return original.subarray(start, end);
}

/** Verify split/join round-trip: spans tile the normalized text and map back exactly. */
export function spansReconstructOriginal(
  original: Buffer,
  normalized: string,
  offsetMap: number[],
  normStart: number,
  normEnd: number
): boolean {
  if (normEnd > offsetMap.length - 1 || normEnd > normalized.length) return false;
  const joined = sourceSpanFor(original, offsetMap, normStart, normEnd).toString("utf8");
  // Fold CRLF/CR back — the span must equal normalized after folding.
  const folded = joined.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return folded === normalized.slice(normStart, normEnd);
}

function processedRelativePath(manuscriptId: string): string {
  return normalizeRelative(`manuscripts/processed/${manuscriptId}.txt`);
}

export type StoreNormalizationResult = Normalization & { processedRelativePath: string };

/** Normalize + persist a manuscript's original (DB row + processed mirror). */
export async function storeNormalization(
  root: string,
  manuscriptId: string
): Promise<StoreNormalizationResult> {
  requireProject(root);
  const manuscript = await getManuscript(root, manuscriptId);
  if (!manuscript) {
    throw new NormalizationError("NOT_FOUND", `No manuscript with id: ${manuscriptId}`);
  }
  if (manuscript.format !== "txt" && manuscript.format !== "md") {
    throw new NormalizationError("INVALID_FORMAT", `Normalization supports txt/md (got ${manuscript.format})`);
  }
  const original = readManuscriptOriginal(root, manuscript);
  const { normalized, offsetMap } = normalizeManuscriptBytes(original);
  const now = new Date().toISOString();
  const processed = processedRelativePath(manuscriptId);
  const processedAbs = resolveInProject(root, processed);
  fs.mkdirSync(path.dirname(processedAbs), { recursive: true });
  const tmp = `${processedAbs}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, normalized, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, processedAbs);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<StoreNormalizationResult>(() => {
        db.prepare("INSERT OR REPLACE INTO normalization (manuscript_id, normalized_text, offset_map, created_at) VALUES (?, ?, ?, ?)")
          .run(manuscriptId, normalized, JSON.stringify(offsetMap), now);
        return { manuscriptId, normalizedText: normalized, offsetMap, byteLength: original.length, createdAt: now, processedRelativePath: processed };
      });
    } finally {
      db.close();
    }
  });
}

/** Read a stored normalization back. */
export async function getNormalization(root: string, manuscriptId: string): Promise<Normalization | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM normalization WHERE manuscript_id = ?").get(manuscriptId) as Record<string, unknown> | undefined;
    if (!row) return null;
    let offsetMap: number[] = [];
    try {
      offsetMap = JSON.parse(String(row.offset_map)) as number[];
    } catch {
      offsetMap = [];
    }
    return {
      manuscriptId: String(row.manuscript_id),
      normalizedText: String(row.normalized_text),
      offsetMap,
      byteLength: offsetMap.length > 0 ? offsetMap[offsetMap.length - 1] : 0,
      createdAt: String(row.created_at),
    };
  } finally {
    db.close();
  }
}
