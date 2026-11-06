// PanelForge — deterministic scene extraction (S3.4).
//
// Scene-break rules over normalized text, scoped inside chapters
// (S3.3), never altering source text:
//
// 1. Horizontal rules: `***`, `___`, `---` on their own line.
// 2. Level 2–3 ATX headings (`##` / `###`; level 1 is chapters).
// 3. Location/time cue lines (INT./EXT./LATER/MEANWHILE/BACK TO/CUT TO).
//
// A manual-override data model sits on top: re-segmentation from
// explicit split points (`recutScenes`) marks rows `source="override"`,
// and titles can be corrected without touching spans. Storyboard
// panels stay Stage 6.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getNormalization } from "./text-normalize";
import { listChapters } from "./chapters";

export type SceneSource = "auto" | "override";

export type SceneSpan = {
  title: string;
  normStart: number;
  normEnd: number;
  sortOrder: number;
  source: SceneSource;
};

export type SceneRecord = SceneSpan & {
  sceneId: string;
  manuscriptId: string;
  chapterId: string;
  createdAt: string;
};

export class SceneError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SceneError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new SceneError(identified.code, identified.message);
  }
}

const RULE_BREAK = /^(\*\*\*|___|---)\s*$/;
const SCENE_ATX = /^#{2,3}\s+(.+?)\s*$/;
const LOCATION_CUE = /^(INT\.|EXT\.|LATER|MEANWHILE|BACK TO|CUT TO)(?:\s|$)/i;

/** Scene title for a line, or null when the line is not a break. */
export function matchSceneHeading(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  if (RULE_BREAK.test(trimmed)) return "(Scene break)";
  const atx = SCENE_ATX.exec(trimmed);
  if (atx) return atx[1].trim();
  if (LOCATION_CUE.test(trimmed) && trimmed.length <= 80) return trimmed;
  return null;
}

/**
 * Segment one chapter's normalized span into scenes with exact tiling
 * spans (joining the scenes reconstructs the chapter slice).
 */
export function splitChapterIntoScenes(normalized: string, normStart: number, normEnd: number): SceneSpan[] {
  if (normStart >= normEnd) return [];
  const slice = normalized.slice(normStart, normEnd);
  const lines = slice.split("\n");
  const breaks: Array<{ title: string; offset: number }> = [];
  let pos = normStart;
  for (const line of lines) {
    const title = matchSceneHeading(line);
    if (title !== null) breaks.push({ title, offset: pos });
    pos += line.length + 1;
  }
  if (breaks.length === 0) {
    return [{ title: "(Scene 1)", normStart, normEnd, sortOrder: 0, source: "auto" }];
  }
  // A bare `***` break directly followed by a headed scene is absorbed
  // into that scene (the break line belongs to what it opens); only an
  // isolated trailing break opens its own scene. Effective starts are
  // computed first so spans tile contiguously.
  const headed = breaks.filter((b, i) => b.title !== "(Scene break)" || i === breaks.length - 1);
  const effectiveStarts = headed.map((b, idx) => {
    // Only absorb a bare break since the previous headed break.
    const prevHeadedOffset = idx > 0 ? headed[idx - 1].offset : -1;
    const absorbed = breaks.filter(
      (x) => x.title === "(Scene break)" && x.offset < b.offset && x.offset > prevHeadedOffset
    );
    return absorbed.length > 0 ? absorbed[absorbed.length - 1].offset : b.offset;
  });
  // Boundaries: [normStart?, ...effectiveStarts, normEnd] — contiguous tiling.
  const starts = effectiveStarts[0] > normStart ? [normStart, ...effectiveStarts] : [...effectiveStarts];
  const offsets = [...starts, normEnd];
  const spans: SceneSpan[] = [];
  for (let i = 0; i < offsets.length - 1; i++) {
    const start = offsets[i];
    const end = offsets[i + 1];
    if (end <= start) continue;
    // Title: the headed break whose effective start is this span's
    // start, or generated for pre-roll prose.
    const idx = effectiveStarts.indexOf(start);
    const raw = idx >= 0 ? headed[idx].title : null;
    spans.push({
      title: raw && raw !== "(Scene break)" ? raw : `(Scene ${spans.length + 1})`,
      normStart: start,
      normEnd: end,
      sortOrder: spans.length,
      source: "auto",
    });
  }
  return spans;
}

/** Segment every chapter of a manuscript into scenes (requires S3.2 + S3.3). */
export async function storeScenes(root: string, manuscriptId: string): Promise<SceneRecord[]> {
  requireProject(root);
  const normalization = await getNormalization(root, manuscriptId);
  if (!normalization) {
    throw new SceneError("NOT_FOUND", `No normalization for manuscript: ${manuscriptId}`);
  }
  const chapters = await listChapters(root, manuscriptId);
  if (chapters.length === 0) {
    throw new SceneError("NOT_FOUND", `No chapters for manuscript: ${manuscriptId}`);
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const records: SceneRecord[] = [];
      return await runWithBusyRetry<SceneRecord[]>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM scenes WHERE manuscript_id = ?").run(manuscriptId);
          for (const chapter of chapters) {
            const spans = splitChapterIntoScenes(normalization.normalizedText, chapter.normStart, chapter.normEnd);
            for (const span of spans) {
              const sceneId = crypto.randomUUID();
              db.prepare(
                "INSERT INTO scenes (scene_id, manuscript_id, chapter_id, title, norm_start, norm_end, sort_order, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
              ).run(sceneId, manuscriptId, chapter.chapterId, span.title, span.normStart, span.normEnd, span.sortOrder, span.source, now);
              records.push({ ...span, sceneId, manuscriptId, chapterId: chapter.chapterId, createdAt: now });
            }
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

/**
 * Re-segment one chapter from explicit normalized split offsets;
 * rows are marked as manual overrides. Offsets must be strictly
 * increasing and lie inside the chapter.
 */
export async function recutScenes(
  root: string,
  manuscriptId: string,
  chapterId: string,
  splits: number[],
  titles?: string[]
): Promise<SceneRecord[]> {
  requireProject(root);
  const normalization = await getNormalization(root, manuscriptId);
  if (!normalization) {
    throw new SceneError("NOT_FOUND", `No normalization for manuscript: ${manuscriptId}`);
  }
  const chapters = await listChapters(root, manuscriptId);
  const chapter = chapters.find((c) => c.chapterId === chapterId);
  if (!chapter) throw new SceneError("NOT_FOUND", `No chapter with id: ${chapterId}`);
  const sorted = [...splits].sort((a, b) => a - b);
  for (const point of sorted) {
    if (!Number.isInteger(point) || point <= chapter.normStart || point >= chapter.normEnd) {
      throw new SceneError("INVALID_ARGUMENTS", `Split point out of range: ${point}`);
    }
  }
  const boundaries = [chapter.normStart, ...sorted, chapter.normEnd];
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const records: SceneRecord[] = [];
      return await runWithBusyRetry<SceneRecord[]>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM scenes WHERE manuscript_id = ? AND chapter_id = ?").run(manuscriptId, chapterId);
          for (let i = 0; i < boundaries.length - 1; i++) {
            const sceneId = crypto.randomUUID();
            const title = titles?.[i] ?? `(Scene ${i + 1})`;
            db.prepare(
              "INSERT INTO scenes (scene_id, manuscript_id, chapter_id, title, norm_start, norm_end, sort_order, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).run(sceneId, manuscriptId, chapterId, title, boundaries[i], boundaries[i + 1], i, "override", now);
            records.push({
              title,
              normStart: boundaries[i],
              normEnd: boundaries[i + 1],
              sortOrder: i,
              source: "override",
              sceneId,
              manuscriptId,
              chapterId,
              createdAt: now,
            });
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

/** List a manuscript's scenes in reading order (chapter order, then scene order). */
export async function listScenes(root: string, manuscriptId: string): Promise<SceneRecord[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare(
        "SELECT s.* FROM scenes s JOIN chapters c ON c.chapter_id = s.chapter_id WHERE s.manuscript_id = ? ORDER BY c.sort_order, s.sort_order"
      )
      .all(manuscriptId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      sceneId: String(row.scene_id),
      manuscriptId: String(row.manuscript_id),
      chapterId: String(row.chapter_id),
      title: String(row.title),
      normStart: Number(row.norm_start),
      normEnd: Number(row.norm_end),
      sortOrder: Number(row.sort_order),
      source: String(row.source) as SceneSource,
      createdAt: String(row.created_at),
    }));
  } finally {
    db.close();
  }
}
