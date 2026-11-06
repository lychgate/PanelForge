// PanelForge — Storyboard Studio: panel records (S6.2, spec §8.7).
//
// Editable panel sequences with no artwork attached:
//
// - `createPanel` appends a panel to a storyboard scene at the
//   next sort order; `movePanel` / `reorderScene` persist a new
//   order. Identity (`panelId`, `createdAt`) never changes.
// - `listPanels` returns a scene's panels in sort order.
// - Delete removes the record; bound/assigned guards land with
//   S6.3 assignments (default refuse-when-bound decided there).
//
// Character and version assignment stays S6.3.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type StoryboardPanel = {
  panelId: string;
  sceneId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export class PanelError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PanelError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new PanelError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): StoryboardPanel {
  return {
    panelId: String(row.panel_id),
    sceneId: String(row.scene_id),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Append a panel to a storyboard scene. */
export async function createPanel(root: string, sceneId: string): Promise<StoryboardPanel> {
  requireProject(root);
  if (typeof sceneId !== "string" || sceneId.trim() === "") {
    throw new PanelError("INVALID_ARGUMENTS", "sceneId must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const scene = db.prepare("SELECT * FROM storyboard_scenes WHERE scene_id = ?").get(sceneId) as Record<string, unknown> | undefined;
      if (!scene) throw new PanelError("NOT_FOUND", `No storyboard scene with id: ${sceneId}`);
      return await runWithBusyRetry<StoryboardPanel>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const last = db.prepare("SELECT MAX(sort_order) AS m FROM storyboard_panels WHERE scene_id = ?").get(sceneId) as Record<string, unknown>;
          const sortOrder = Number(last.m ?? -1) + 1;
          const panelId = crypto.randomUUID();
          db.prepare("INSERT INTO storyboard_panels (panel_id, scene_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(panelId, sceneId, sortOrder, now, now);
          const row = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId);
          db.exec("COMMIT");
          return toRecord(row as Record<string, unknown>);
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

/** Retrieve one panel, or null. */
export async function getPanel(root: string, panelId: string): Promise<StoryboardPanel | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All panels of one scene, in sort order. */
export async function listPanels(root: string, sceneId: string): Promise<StoryboardPanel[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM storyboard_panels WHERE scene_id = ? ORDER BY sort_order, panel_id").all(sceneId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Move one panel within its scene (0-based index into the sorted list). */
export async function movePanel(root: string, panelId: string, toIndex: number): Promise<StoryboardPanel[]> {
  requireProject(root);
  if (!Number.isInteger(toIndex) || toIndex < 0) {
    throw new PanelError("INVALID_ARGUMENTS", "toIndex must be a non-negative integer");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
      if (!panel) throw new PanelError("NOT_FOUND", `No panel with id: ${panelId}`);
      const sceneId = String(panel.scene_id);
      return await runWithBusyRetry<StoryboardPanel[]>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const rows = db.prepare("SELECT panel_id FROM storyboard_panels WHERE scene_id = ? ORDER BY sort_order, panel_id").all(sceneId) as Array<Record<string, unknown>>;
          const ids = rows.map((r) => String(r.panel_id));
          const from = ids.indexOf(panelId);
          ids.splice(from, 1);
          ids.splice(Math.min(toIndex, ids.length), 0, panelId);
          ids.forEach((id, i) => db.prepare("UPDATE storyboard_panels SET sort_order = ?, updated_at = ? WHERE panel_id = ?").run(i, now, id));
          const updated = db.prepare("SELECT * FROM storyboard_panels WHERE scene_id = ? ORDER BY sort_order, panel_id").all(sceneId) as Array<Record<string, unknown>>;
          db.exec("COMMIT");
          return updated.map(toRecord);
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

/** Delete a panel record. */
export async function deletePanel(root: string, panelId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId);
        if (!current) throw new PanelError("NOT_FOUND", `No panel with id: ${panelId}`);
        db.prepare("DELETE FROM storyboard_panels WHERE panel_id = ?").run(panelId);
      });
    } finally {
      db.close();
    }
  });
}
