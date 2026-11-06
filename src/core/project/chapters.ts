// PanelForge — deterministic chapter extraction (S3.3).
//
// Heading-based segmentation over normalized text (S3.2), never altering
// source text: each chapter records its normalized span + title, and the
// S3.2 offset map resolves the span onto original bytes.
//
// Heading rules (first match wins, in order):
// 1. Markdown ATX (`#` … `######` + whitespace).
// 2. CHAPTER / PART title lines (`CHAPTER 5`, `Part 2: The Fall`, ...).
// 3. All-caps title lines (≥3 chars, letters/digits/spaces only) — the
//    classic text-novel convention.
//
// Text before the first heading becomes "(Front matter)"; with no
// headings at all the whole text is one "(Untitled)" chapter. Free-prose
// lines that merely contain caps never match (rule 3 needs the whole
// line to be title-shaped).

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getNormalization } from "./text-normalize";

export type ChapterSpan = {
  title: string;
  normStart: number;
  normEnd: number;
  sortOrder: number;
};

export type ChapterRecord = ChapterSpan & {
  chapterId: string;
  manuscriptId: string;
  createdAt: string;
};

export class ChapterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ChapterError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ChapterError(identified.code, identified.message);
  }
}

const ATX = /^#{1,6}\s+(.+?)\s*$/;
const CHAPTER_PART = /^(chapter|part|book)\s+([ivx\d]+(?:\s*[-:.]\s*(.+))?|[-:.]\s*(.+))$/i;
const ALL_CAPS = /^[A-Z0-9][A-Z0-9\s:'",.!?()-]*$/;

/** Title for a line, or null when the line is not a heading. */
export function matchChapterHeading(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  const atx = ATX.exec(trimmed);
  if (atx) return atx[1].trim();
  const cp = CHAPTER_PART.exec(trimmed);
  if (cp) return trimmed;
  // All-caps convention: whole line must be title-shaped (no lowercase
  // letters at all) and carry at least one letter.
  if (trimmed.length >= 3 && ALL_CAPS.test(trimmed) && /[A-Z]/.test(trimmed)) {
    // Cheap false-positive guard: headings are short.
    if (trimmed.length <= 80) return trimmed;
  }
  return null;
}

/**
 * Segment normalized text into chapters with exact spans. Spans tile
 * the whole text contiguously (joining them reconstructs it); no text
 * is added, removed, or altered — only sliced.
 */
export function extractChapters(normalized: string): ChapterSpan[] {
  if (normalized === "") return [];
  const headings: Array<{ title: string; normStart: number }> = [];
  const lines = normalized.split("\n");
  let pos = 0;
  for (const line of lines) {
    const title = matchChapterHeading(line);
    if (title !== null) headings.push({ title, normStart: pos });
    pos += line.length + 1;
  }
  const spans: ChapterSpan[] = [];
  if (headings.length === 0) {
    return [{ title: "(Untitled)", normStart: 0, normEnd: normalized.length, sortOrder: 0 }];
  }
  let order = 0;
  if (headings[0].normStart > 0) {
    spans.push({
      title: "(Front matter)",
      normStart: 0,
      normEnd: headings[0].normStart,
      sortOrder: order++,
    });
  }
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].normStart;
    const end = i + 1 < headings.length ? headings[i + 1].normStart : normalized.length;
    spans.push({ title: headings[i].title, normStart: start, normEnd: end, sortOrder: order++ });
  }
  return spans;
}

/** Segment + persist a manuscript's chapters (requires S3.2 normalization). */
export async function storeChapters(root: string, manuscriptId: string): Promise<ChapterRecord[]> {
  requireProject(root);
  const normalization = await getNormalization(root, manuscriptId);
  if (!normalization) {
    throw new ChapterError("NOT_FOUND", `No normalization for manuscript: ${manuscriptId}`);
  }
  const spans = extractChapters(normalization.normalizedText);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const records: ChapterRecord[] = [];
      return await runWithBusyRetry<ChapterRecord[]>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM chapters WHERE manuscript_id = ?").run(manuscriptId);
          for (const span of spans) {
            const chapterId = crypto.randomUUID();
            db.prepare(
              "INSERT INTO chapters (chapter_id, manuscript_id, title, norm_start, norm_end, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
            ).run(chapterId, manuscriptId, span.title, span.normStart, span.normEnd, span.sortOrder, now);
            records.push({ ...span, chapterId, manuscriptId, createdAt: now });
          }
          db.exec("COMMIT");
          return records;
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // Surface the original error.
          }
          throw err;
        }
      });
    } finally {
      db.close();
    }
  });
}

/** List a manuscript's chapters in reading order. */
export async function listChapters(root: string, manuscriptId: string): Promise<ChapterRecord[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM chapters WHERE manuscript_id = ? ORDER BY sort_order")
      .all(manuscriptId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      chapterId: String(row.chapter_id),
      manuscriptId: String(row.manuscript_id),
      title: String(row.title),
      normStart: Number(row.norm_start),
      normEnd: Number(row.norm_end),
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
    }));
  } finally {
    db.close();
  }
}
