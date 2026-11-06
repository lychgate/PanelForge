// PanelForge — Storyboard Studio: character positioning (S6.6, spec §8.7).
//
// Composition guidance per assignment:
//
// - `setPosition` records placement for one assignment: depth
//   (foreground / midground / background) + horizontal
//   (left / center / right) + a free-text note. Closed vocabularies
//   reject typed.
// - `getPosition` reads it back; `listPositionsByPanel` returns
//   every positioned assignment on a panel.
// - The system explicitly does not promise perfect placement
//   (§8.7): this is guidance for generation + manual correction.
// - One position per assignment; setting again replaces.
//
// Dialogue and captions stay S6.7.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type Depth = "foreground" | "midground" | "background";
export type Horizontal = "left" | "center" | "right";

export type PanelPosition = {
  positionId: string;
  assignmentId: string;
  depth: Depth;
  horizontal: Horizontal;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export class PositionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PositionError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new PositionError(identified.code, identified.message);
  }
}

export function isDepth(value: unknown): value is Depth {
  return value === "foreground" || value === "midground" || value === "background";
}

export function isHorizontal(value: unknown): value is Horizontal {
  return value === "left" || value === "center" || value === "right";
}

function toRecord(row: Record<string, unknown>): PanelPosition {
  return {
    positionId: String(row.position_id),
    assignmentId: String(row.assignment_id),
    depth: String(row.depth) as Depth,
    horizontal: String(row.horizontal) as Horizontal,
    note: String(row.note ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Set (or replace) the placement guidance for one assignment. */
export async function setPosition(root: string, assignmentId: string, depth: Depth, horizontal: Horizontal, note?: string): Promise<PanelPosition> {
  requireProject(root);
  if (typeof assignmentId !== "string" || assignmentId.trim() === "") throw new PositionError("INVALID_ARGUMENTS", "assignmentId must not be empty");
  if (!isDepth(depth)) throw new PositionError("INVALID_ARGUMENTS", `Unknown depth: ${String(depth)}`);
  if (!isHorizontal(horizontal)) throw new PositionError("INVALID_ARGUMENTS", `Unknown horizontal: ${String(horizontal)}`);
  if (note !== undefined && typeof note !== "string") throw new PositionError("INVALID_ARGUMENTS", "note must be a string");
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const assignment = db.prepare("SELECT * FROM panel_assignments WHERE assignment_id = ?").get(assignmentId) as Record<string, unknown> | undefined;
      if (!assignment) throw new PositionError("NOT_FOUND", `No assignment with id: ${assignmentId}`);
      return await runWithBusyRetry<PanelPosition>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_positions WHERE assignment_id = ?").run(assignmentId);
          const positionId = cryptoRandom();
          db.prepare("INSERT INTO panel_positions (position_id, assignment_id, depth, horizontal, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            positionId,
            assignmentId,
            depth,
            horizontal,
            note ?? "",
            now,
            now
          );
          const row = db.prepare("SELECT * FROM panel_positions WHERE position_id = ?").get(positionId);
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

import * as crypto from "crypto";
function cryptoRandom(): string {
  return crypto.randomUUID();
}

/** The placement guidance for one assignment, or null. */
export async function getPosition(root: string, assignmentId: string): Promise<PanelPosition | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_positions WHERE assignment_id = ?").get(assignmentId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All positioned assignments on one panel, in assignment order. */
export async function listPositionsByPanel(root: string, panelId: string): Promise<PanelPosition[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare(
        "SELECT p.* FROM panel_positions p JOIN panel_assignments a ON a.assignment_id = p.assignment_id WHERE a.panel_id = ? ORDER BY a.character_id"
      )
      .all(panelId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}
