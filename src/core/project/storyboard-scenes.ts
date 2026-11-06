// PanelForge — Storyboard Studio: scene records (S6.1, spec §8.7).
//
// Storyboard scenes with a traceable source:
//
// - `createScene` / `updateScene` / `deleteScene` CRUD over a
//   narrative purpose and a source link (manuscript + chapter +
//   extraction-scene span, validated against Stage 3 rows).
// - Storyboard scenes WRAP Stage 3 scenes; they never rewrite
//   them (the extraction rows stay untouched).
// - Identity (`sceneId`, `createdAt`) never changes.
//
// Panel records stay S6.2.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type StoryboardScene = {
  sceneId: string;
  manuscriptId: string;
  chapterId: string | null;
  extractionSceneId: string | null;
  narrativePurpose: string;
  createdAt: string;
  updatedAt: string;
};

export type SceneInput = {
  manuscriptId: string;
  chapterId?: string;
  extractionSceneId?: string;
  narrativePurpose?: string;
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

function toRecord(row: Record<string, unknown>): StoryboardScene {
  return {
    sceneId: String(row.scene_id),
    manuscriptId: String(row.manuscript_id),
    chapterId: row.chapter_id === null || row.chapter_id === undefined ? null : String(row.chapter_id),
    extractionSceneId: row.extraction_scene_id === null || row.extraction_scene_id === undefined ? null : String(row.extraction_scene_id),
    narrativePurpose: String(row.narrative_purpose ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: SceneInput, partial: boolean): void {
  if (!partial && (typeof input.manuscriptId !== "string" || input.manuscriptId.trim() === "")) {
    throw new SceneError("INVALID_ARGUMENTS", "manuscriptId must not be empty");
  }
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && typeof value !== "string") {
      throw new SceneError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
}

function validateSource(db: { prepare: (s: string) => { get: (p: unknown) => Record<string, unknown> | undefined } }, input: { manuscriptId: string; chapterId?: string; extractionSceneId?: string }): void {
  const manuscript = db.prepare("SELECT manuscript_id FROM manuscripts WHERE manuscript_id = ?").get(input.manuscriptId);
  if (!manuscript) throw new SceneError("NOT_FOUND", `No manuscript with id: ${input.manuscriptId}`);
  if (input.chapterId !== undefined) {
    const chapter = db.prepare("SELECT chapter_id FROM chapters WHERE chapter_id = ?").get(input.chapterId);
    if (!chapter) throw new SceneError("NOT_FOUND", `No chapter with id: ${input.chapterId}`);
  }
  if (input.extractionSceneId !== undefined) {
    const scene = db.prepare("SELECT scene_id FROM scenes WHERE scene_id = ?").get(input.extractionSceneId);
    if (!scene) throw new SceneError("NOT_FOUND", `No extraction scene with id: ${input.extractionSceneId}`);
  }
}

/** Create a storyboard scene wrapping a source chain. */
export async function createScene(root: string, input: SceneInput): Promise<StoryboardScene> {
  requireProject(root);
  validateInput(input, false);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      validateSource(db, input);
      const sceneId = crypto.randomUUID();
      return await runWithBusyRetry<StoryboardScene>(() => {
        db.prepare(
          "INSERT INTO storyboard_scenes (scene_id, manuscript_id, chapter_id, extraction_scene_id, narrative_purpose, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(sceneId, input.manuscriptId, input.chapterId ?? null, input.extractionSceneId ?? null, input.narrativePurpose ?? "", now, now);
        const row = db.prepare("SELECT * FROM storyboard_scenes WHERE scene_id = ?").get(sceneId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one storyboard scene, or null. */
export async function getScene(root: string, sceneId: string): Promise<StoryboardScene | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM storyboard_scenes WHERE scene_id = ?").get(sceneId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all storyboard scenes for one manuscript (creation order). */
export async function listScenes(root: string, manuscriptId: string): Promise<StoryboardScene[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM storyboard_scenes WHERE manuscript_id = ? ORDER BY created_at, scene_id").all(manuscriptId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Update a storyboard scene's fields (partial merges; identity never changes). */
export async function updateScene(root: string, sceneId: string, patch: SceneInput): Promise<StoryboardScene> {
  requireProject(root);
  validateInput(patch, true);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM storyboard_scenes WHERE scene_id = ?").get(sceneId) as Record<string, unknown> | undefined;
      if (!current) throw new SceneError("NOT_FOUND", `No storyboard scene with id: ${sceneId}`);
      validateSource(db, {
        manuscriptId: patch.manuscriptId ?? String(current.manuscript_id),
        chapterId: patch.chapterId,
        extractionSceneId: patch.extractionSceneId,
      });
      const merged: SceneInput & Record<string, unknown> = {
        manuscriptId: patch.manuscriptId ?? String(current.manuscript_id),
        chapterId: patch.chapterId ?? (current.chapter_id === null ? undefined : String(current.chapter_id)),
        extractionSceneId: patch.extractionSceneId ?? (current.extraction_scene_id === null ? undefined : String(current.extraction_scene_id)),
        narrativePurpose: patch.narrativePurpose ?? String(current.narrative_purpose ?? ""),
      };
      return await runWithBusyRetry<StoryboardScene>(() => {
        db.prepare(
          "UPDATE storyboard_scenes SET manuscript_id = ?, chapter_id = ?, extraction_scene_id = ?, narrative_purpose = ?, updated_at = ? WHERE scene_id = ?"
        ).run(merged.manuscriptId as string, merged.chapterId ?? null, merged.extractionSceneId ?? null, merged.narrativePurpose as string, now, sceneId);
        const row = db.prepare("SELECT * FROM storyboard_scenes WHERE scene_id = ?").get(sceneId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Delete a storyboard scene (panels stay theirs — S6.2 refuses orphans). */
export async function deleteScene(root: string, sceneId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM storyboard_scenes WHERE scene_id = ?").get(sceneId);
        if (!current) throw new SceneError("NOT_FOUND", `No storyboard scene with id: ${sceneId}`);
        db.prepare("DELETE FROM storyboard_scenes WHERE scene_id = ?").run(sceneId);
      });
    } finally {
      db.close();
    }
  });
}
