// PanelForge — source relationships (S3.5).
//
// Every extracted span links back to source (spec §15 Stage 3): the
// manuscript → chapter → scene joins are FK-driven (S3.1/S3.3/S3.4),
// and this module proves the chain by traversal + re-verification:
//
// - `traverseFromScene`: manuscript → chapter → scene → normalized
//   slice → original bytes. A full traversal from any extraction
//   lands on exact source text.
// - `verifySourceChain`: recomputes segmentation from the normalized
//   text and compares to stored rows; checks tiling contiguity,
//   scene-within-chapter containment, and that every stored span
//   resolves through the S3.2 map to its normalized slice. Broken
//   offsets fail with precise locations — they cannot pass silently.
//
// Entity linkage stays S3.6.

import { identifyProject } from "./service";
import { openProjectDatabase } from "./metadata";
import { getManuscript, readManuscriptOriginal, ManuscriptRecord } from "./manuscripts";
import { getNormalization, sourceSpanFor, Normalization } from "./text-normalize";
import { extractChapters, listChapters, ChapterRecord } from "./chapters";
import { listScenes, SceneRecord } from "./scenes";

export type SourceTraversal = {
  manuscript: ManuscriptRecord;
  chapter: ChapterRecord;
  scene: SceneRecord;
  normalizedText: string;
  originalBytes: Buffer;
  originalText: string;
};

export class RelationshipError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RelationshipError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new RelationshipError(identified.code, identified.message);
  }
}

/** Full traversal: scene → chapter → manuscript → source bytes. */
export async function traverseFromScene(root: string, sceneId: string): Promise<SourceTraversal> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const sceneRow = db.prepare("SELECT * FROM scenes WHERE scene_id = ?").get(sceneId) as Record<string, unknown> | undefined;
    if (!sceneRow) throw new RelationshipError("NOT_FOUND", `No scene with id: ${sceneId}`);
    const chapterRow = db.prepare("SELECT * FROM chapters WHERE chapter_id = ?").get(String(sceneRow.chapter_id)) as Record<string, unknown> | undefined;
    if (!chapterRow) throw new RelationshipError("NOT_FOUND", `Scene links to missing chapter: ${String(sceneRow.chapter_id)}`);
    const scene: SceneRecord = {
      sceneId: String(sceneRow.scene_id),
      manuscriptId: String(sceneRow.manuscript_id),
      chapterId: String(sceneRow.chapter_id),
      title: String(sceneRow.title),
      normStart: Number(sceneRow.norm_start),
      normEnd: Number(sceneRow.norm_end),
      sortOrder: Number(sceneRow.sort_order),
      source: String(sceneRow.source) as SceneRecord["source"],
      createdAt: String(sceneRow.created_at),
    };
    const chapter: ChapterRecord = {
      chapterId: String(chapterRow.chapter_id),
      manuscriptId: String(chapterRow.manuscript_id),
      title: String(chapterRow.title),
      normStart: Number(chapterRow.norm_start),
      normEnd: Number(chapterRow.norm_end),
      sortOrder: Number(chapterRow.sort_order),
      createdAt: String(chapterRow.created_at),
    };
    if (scene.manuscriptId !== chapter.manuscriptId) {
      throw new RelationshipError("INVALID_ARGUMENTS", "Scene links to a chapter of another manuscript");
    }
    const manuscript = await getManuscript(root, scene.manuscriptId);
    if (!manuscript) throw new RelationshipError("NOT_FOUND", `Scene links to missing manuscript: ${scene.manuscriptId}`);
    const normalization = await getNormalization(root, scene.manuscriptId);
    if (!normalization) throw new RelationshipError("NOT_FOUND", `No normalization for manuscript: ${scene.manuscriptId}`);
    if (
      scene.normStart < chapter.normStart ||
      scene.normEnd > chapter.normEnd ||
      scene.normEnd <= scene.normStart
    ) {
      throw new RelationshipError("INVALID_ARGUMENTS", "Scene span escapes its chapter");
    }
    const normalizedText = normalization.normalizedText.slice(scene.normStart, scene.normEnd);
    const originalBytes = sourceSpanFor(
      readManuscriptOriginal(root, manuscript),
      normalization.offsetMap,
      scene.normStart,
      scene.normEnd
    );
    return {
      manuscript,
      chapter,
      scene,
      normalizedText,
      originalBytes,
      originalText: originalBytes.toString("utf8"),
    };
  } finally {
    db.close();
  }
}

export type ChainVerification = {
  ok: boolean;
  manuscriptId: string;
  problems: Array<{ kind: string; detail: string }>;
};

/** Re-derive segmentation and compare against stored rows; verify tiling + containment. */
export async function verifySourceChain(root: string, manuscriptId: string): Promise<ChainVerification> {
  requireProject(root);
  const problems: Array<{ kind: string; detail: string }> = [];
  const normalization = await getNormalization(root, manuscriptId);
  if (!normalization) {
    return { ok: false, manuscriptId, problems: [{ kind: "no-normalization", detail: "normalization missing" }] };
  }
  const manuscript = await getManuscript(root, manuscriptId);
  if (!manuscript) {
    return { ok: false, manuscriptId, problems: [{ kind: "no-manuscript", detail: "manuscript missing" }] };
  }
  const originalBytes = readManuscriptOriginal(root, manuscript);
  // Re-derive chapters from normalized text and compare tiling.
  const expected = extractChapters(normalization.normalizedText);
  const chapters = await listChapters(root, manuscriptId);
  if (chapters.length !== expected.length) {
    problems.push({
      kind: "chapter-count",
      detail: `stored ${chapters.length} vs derived ${expected.length}`,
    });
  } else {
    expected.forEach((span, i) => {
      if (
        chapters[i].title !== span.title ||
        chapters[i].normStart !== span.normStart ||
        chapters[i].normEnd !== span.normEnd
      ) {
        problems.push({ kind: "chapter-span", detail: `chapter ${i}: ${JSON.stringify(span)} vs ${JSON.stringify(chapters[i])}` });
      }
    });
  }
  // Tiling contiguity over stored chapters.
  for (let i = 1; i < chapters.length; i++) {
    if (chapters[i].normStart !== chapters[i - 1].normEnd) {
      problems.push({ kind: "chapter-gap", detail: `chapter ${i} starts at ${chapters[i].normStart}, previous ends at ${chapters[i - 1].normEnd}` });
    }
  }
  // Stored scenes: containment within chapters + resolution through the map.
  const scenes = await listScenes(root, manuscriptId);
  const chapterById = new Map(chapters.map((c) => [c.chapterId, c]));
  for (const scene of scenes) {
    const chapter = chapterById.get(scene.chapterId);
    if (!chapter) {
      problems.push({ kind: "scene-chapter", detail: `scene ${scene.sceneId} links to missing chapter` });
      continue;
    }
    if (scene.manuscriptId !== manuscriptId) {
      problems.push({ kind: "scene-manuscript", detail: `scene ${scene.sceneId} manuscript mismatch` });
    }
    if (scene.normStart < chapter.normStart || scene.normEnd > chapter.normEnd || scene.normEnd <= scene.normStart) {
      problems.push({ kind: "scene-span", detail: `scene ${scene.sceneId} escapes chapter ${chapter.chapterId}` });
      continue;
    }
    // Resolves exactly: original slice folds back to the normalized slice.
    if (scene.normEnd > normalization.offsetMap.length - 1) {
      problems.push({ kind: "scene-span", detail: `scene ${scene.sceneId} beyond offset map` });
      continue;
    }
    const originalSlice = sourceSpanFor(originalBytes, normalization.offsetMap, scene.normStart, scene.normEnd).toString("utf8");
    const folded = originalSlice.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (folded !== normalization.normalizedText.slice(scene.normStart, scene.normEnd)) {
      problems.push({ kind: "scene-resolution", detail: `scene ${scene.sceneId} does not resolve to its normalized span` });
    }
  }
  return { ok: problems.length === 0, manuscriptId, problems };
}
