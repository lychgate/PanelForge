// PanelForge — Storyboard Studio: character and version assignment (S6.3, spec §8.7).
//
// Panels stop using opaque IDs:
//
// - `assignCharacter` pins one approved version to one
//   (panel, character) pair against the REAL `storyboard_panels`
//   row — the S4.7 opaque panel_id becomes a foreign key.
// - One assignment per (panel, character); reassigning replaces.
// - `unassignCharacter` removes one assignment.
// - `deletePanel` (S6.2) now refuses to delete a panel that
//   still has assignments (`BOUND_PANEL`).
//
// Multi-character placement hints stay S6.6.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type PanelAssignment = {
  assignmentId: string;
  panelId: string;
  characterId: string;
  versionId: string;
  createdAt: string;
  updatedAt: string;
};

export class AssignmentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AssignmentError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new AssignmentError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): PanelAssignment {
  return {
    assignmentId: String(row.assignment_id),
    panelId: String(row.panel_id),
    characterId: String(row.character_id),
    versionId: String(row.version_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Assign one approved version to a (panel, character) pair (replaces). */
export async function assignCharacter(root: string, panelId: string, characterId: string, versionId: string): Promise<PanelAssignment> {
  requireProject(root);
  for (const [key, value] of [["panelId", panelId], ["characterId", characterId], ["versionId", versionId]] as const) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new AssignmentError("INVALID_ARGUMENTS", `${key} must not be empty`);
    }
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
      if (!panel) throw new AssignmentError("NOT_FOUND", `No panel with id: ${panelId}`);
      const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
      if (!version) throw new AssignmentError("NOT_FOUND", `No version with id: ${versionId}`);
      if (String(version.character_id) !== characterId) {
        throw new AssignmentError("INVALID_ARGUMENTS", `Version ${versionId} does not belong to character ${characterId}`);
      }
      const status = String(version.approval_status ?? "pending");
      if (status !== "approved") {
        throw new AssignmentError("NOT_APPROVED", `Version ${versionId} is ${status}; only approved versions can bind`);
      }
      return await runWithBusyRetry<PanelAssignment>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_assignments WHERE panel_id = ? AND character_id = ?").run(panelId, characterId);
          const assignmentId = crypto.randomUUID();
          db.prepare(
            "INSERT INTO panel_assignments (assignment_id, panel_id, character_id, version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
          ).run(assignmentId, panelId, characterId, versionId, now, now);
          const row = db.prepare("SELECT * FROM panel_assignments WHERE assignment_id = ?").get(assignmentId);
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

/** The assignment for one (panel, character) pair, or null. */
export async function getAssignment(root: string, panelId: string, characterId: string): Promise<PanelAssignment | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_assignments WHERE panel_id = ? AND character_id = ?").get(panelId, characterId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All assignments for one panel (every character on it). */
export async function listAssignmentsByPanel(root: string, panelId: string): Promise<PanelAssignment[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM panel_assignments WHERE panel_id = ? ORDER BY character_id").all(panelId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Remove one assignment. */
export async function unassignCharacter(root: string, assignmentId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM panel_assignments WHERE assignment_id = ?").get(assignmentId);
        if (!current) throw new AssignmentError("NOT_FOUND", `No assignment with id: ${assignmentId}`);
        db.prepare("DELETE FROM panel_assignments WHERE assignment_id = ?").run(assignmentId);
      });
    } finally {
      db.close();
    }
  });
}
