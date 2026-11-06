// PanelForge — Storyboard Studio: snapshots + lightweight branching (S6.10, spec §8.7).
//
// Full-copy snapshots (owner decision 2026-11-06):
//
// - `createSnapshot` copies every live panel plus all
//   assignments/details (assignments, location assignments,
//   cameras, positions, text, instructions, character
//   bindings) at one moment into snapshot tables. Snapshots
//   are immutable: no update or delete API exists.
// - Branching is lineage: a snapshot records an optional
//   parent snapshot id; creating with a parent never touches
//   the parent's copy.
// - `restoreSnapshot` replaces the live panels + details with
//   the snapshot's copy in one transaction (restoring is a
//   transactional replace, not a user delete, so it does not
//   go through the deletePanel BOUND_PANEL guard).
// - Snapshot tables never feed Stages 7–10 directly; the
//   only readers are `listSnapshots` and `getSnapshot`.
//
// The minimal storyboard UI stays S6.11.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type Snapshot = {
  snapshotId: string;
  name: string;
  parentSnapshotId: string | null;
  createdAt: string;
  panelCount: number;
};

export type SnapshotContents = {
  snapshot: Snapshot;
  panels: Array<Record<string, unknown>>;
  panelAssignments: Array<Record<string, unknown>>;
  panelLocationAssignments: Array<Record<string, unknown>>;
  panelCameras: Array<Record<string, unknown>>;
  panelPositions: Array<Record<string, unknown>>;
  panelText: Array<Record<string, unknown>>;
  panelInstructions: Array<Record<string, unknown>>;
  panelCharacterBindings: Array<Record<string, unknown>>;
};

export class SnapshotError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SnapshotError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new SnapshotError(identified.code, identified.message);
  }
}

function panelCountBySnapshot(db: { prepare: (s: string) => { get: (p: unknown) => Record<string, unknown> | undefined } }, snapshotId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM snapshot_panels WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown>;
  return Number(row.n);
}

function toSnapshot(db: { prepare: (s: string) => { get: (p: unknown) => Record<string, unknown> | undefined } }, row: Record<string, unknown>): Snapshot {
  return {
    snapshotId: String(row.snapshot_id),
    name: String(row.name ?? ""),
    parentSnapshotId: row.parent_snapshot_id === null || row.parent_snapshot_id === undefined ? null : String(row.parent_snapshot_id),
    createdAt: String(row.created_at),
    panelCount: panelCountBySnapshot(db, String(row.snapshot_id)),
  };
}

const PANEL_TABLES: Array<{ live: string; snap: string; columns: string[]; orderBy: string }> = [
  {
    live: "storyboard_panels",
    snap: "snapshot_panels",
    columns: ["panel_id", "scene_id", "sort_order", "created_at", "updated_at"],
    orderBy: "sort_order, panel_id",
  },
  {
    live: "panel_assignments",
    snap: "snapshot_panel_assignments",
    columns: ["assignment_id", "panel_id", "character_id", "version_id", "created_at", "updated_at"],
    orderBy: "assignment_id",
  },
  {
    live: "panel_location_assignments",
    snap: "snapshot_panel_location_assignments",
    columns: ["assignment_id", "panel_id", "location_id", "variation_id", "created_at", "updated_at"],
    orderBy: "assignment_id",
  },
  {
    live: "panel_cameras",
    snap: "snapshot_panel_cameras",
    columns: ["camera_id", "panel_id", "shot_type", "angle", "created_at", "updated_at"],
    orderBy: "camera_id",
  },
  {
    live: "panel_positions",
    snap: "snapshot_panel_positions",
    columns: ["position_id", "assignment_id", "depth", "horizontal", "note", "created_at", "updated_at"],
    orderBy: "position_id",
  },
  {
    live: "panel_text",
    snap: "snapshot_panel_text",
    columns: ["text_id", "panel_id", "dialogue", "captions", "actions", "expressions", "created_at", "updated_at"],
    orderBy: "text_id",
  },
  {
    live: "panel_instructions",
    snap: "snapshot_panel_instructions",
    columns: ["instruction_id", "panel_id", "composition_prompt", "background_detail", "art_direction_notes", "created_at", "updated_at"],
    orderBy: "instruction_id",
  },
  {
    live: "panel_character_bindings",
    snap: "snapshot_panel_character_bindings",
    columns: ["binding_id", "panel_id", "character_id", "version_id", "created_at", "updated_at"],
    orderBy: "binding_id",
  },
];

export type CreateSnapshotInput = {
  name?: string;
  parentSnapshotId?: string;
};

/** Copy the live storyboard into a new immutable snapshot. */
export async function createSnapshot(root: string, input?: CreateSnapshotInput): Promise<Snapshot> {
  requireProject(root);
  const name = input?.name ?? "";
  if (typeof name !== "string") throw new SnapshotError("INVALID_ARGUMENTS", "name must be a string");
  const parentSnapshotId = input?.parentSnapshotId;
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<Snapshot>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          if (parentSnapshotId !== undefined) {
            if (typeof parentSnapshotId !== "string" || parentSnapshotId.trim() === "") {
              throw new SnapshotError("INVALID_ARGUMENTS", "parentSnapshotId must not be empty");
            }
            const parent = db.prepare("SELECT snapshot_id FROM storyboard_snapshots WHERE snapshot_id = ?").get(parentSnapshotId);
            if (!parent) throw new SnapshotError("NOT_FOUND", `No snapshot with id: ${parentSnapshotId}`);
          }
          const snapshotId = crypto.randomUUID();
          const now = new Date().toISOString();
          db.prepare("INSERT INTO storyboard_snapshots (snapshot_id, name, parent_snapshot_id, created_at) VALUES (?, ?, ?, ?)").run(
            snapshotId,
            name,
            parentSnapshotId ?? null,
            now
          );
          for (const table of PANEL_TABLES) {
            const rows = db.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.live}`).all() as Array<Record<string, unknown>>;
            const placeholders = table.columns.map(() => "?").join(", ");
            const insert = db.prepare(`INSERT INTO ${table.snap} (snapshot_id, ${table.columns.join(", ")}) VALUES (?, ${placeholders})`);
            for (const row of rows) {
              insert.run(snapshotId, ...table.columns.map((column) => (row[column] === undefined ? null : row[column])));
            }
          }
          const inserted = db.prepare("SELECT * FROM storyboard_snapshots WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown>;
          db.exec("COMMIT");
          return toSnapshot(db, inserted);
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

/** All snapshots, newest first, with panel counts and lineage. */
export async function listSnapshots(root: string): Promise<Snapshot[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM storyboard_snapshots ORDER BY created_at DESC, snapshot_id").all() as Array<Record<string, unknown>>;
    return rows.map((row) => toSnapshot(db, row));
  } finally {
    db.close();
  }
}

/** One snapshot with its full copied contents. */
export async function getSnapshot(root: string, snapshotId: string): Promise<SnapshotContents> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM storyboard_snapshots WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown> | undefined;
    if (!row) throw new SnapshotError("NOT_FOUND", `No snapshot with id: ${snapshotId}`);
    const read = (snap: string): Array<Record<string, unknown>> =>
      db.prepare(`SELECT * FROM ${snap} WHERE snapshot_id = ? ORDER BY rowid`).all(snapshotId) as Array<Record<string, unknown>>;
    return {
      snapshot: toSnapshot(db, row),
      panels: read("snapshot_panels"),
      panelAssignments: read("snapshot_panel_assignments"),
      panelLocationAssignments: read("snapshot_panel_location_assignments"),
      panelCameras: read("snapshot_panel_cameras"),
      panelPositions: read("snapshot_panel_positions"),
      panelText: read("snapshot_panel_text"),
      panelInstructions: read("snapshot_panel_instructions"),
      panelCharacterBindings: read("snapshot_panel_character_bindings"),
    };
  } finally {
    db.close();
  }
}

/**
 * Replace the live panels + details with a snapshot's copy.
 * Transactional: details first, then panels, then re-insert
 * in FK order (panels → assignments → positions → the rest).
 */
export async function restoreSnapshot(root: string, snapshotId: string): Promise<Snapshot> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<Snapshot>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const row = db.prepare("SELECT * FROM storyboard_snapshots WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown> | undefined;
          if (!row) throw new SnapshotError("NOT_FOUND", `No snapshot with id: ${snapshotId}`);
          const livePanels = db.prepare("SELECT panel_id FROM storyboard_panels").all() as Array<Record<string, unknown>>;
          const livePanelIds = livePanels.map((panel) => String(panel.panel_id));
          const inList = livePanelIds.length > 0 ? `(${livePanelIds.map(() => "?").join(", ")})` : "(NULL)";
          const inArgs: string[] = livePanelIds.length > 0 ? livePanelIds : [];
          if (livePanelIds.length > 0) {
            const liveAssignments = db.prepare(`SELECT assignment_id FROM panel_assignments WHERE panel_id IN ${inList}`).all(...inArgs) as Array<Record<string, unknown>>;
            const liveAssignmentIds = liveAssignments.map((assignment) => String(assignment.assignment_id));
            if (liveAssignmentIds.length > 0) {
              const assignmentList = `(${liveAssignmentIds.map(() => "?").join(", ")})`;
              db.prepare(`DELETE FROM panel_positions WHERE assignment_id IN ${assignmentList}`).run(...liveAssignmentIds);
            }
            db.prepare(`DELETE FROM panel_assignments WHERE panel_id IN ${inList}`).run(...inArgs);
            db.prepare(`DELETE FROM panel_location_assignments WHERE panel_id IN ${inList}`).run(...inArgs);
            db.prepare(`DELETE FROM panel_cameras WHERE panel_id IN ${inList}`).run(...inArgs);
            db.prepare(`DELETE FROM panel_text WHERE panel_id IN ${inList}`).run(...inArgs);
            db.prepare(`DELETE FROM panel_instructions WHERE panel_id IN ${inList}`).run(...inArgs);
            db.prepare(`DELETE FROM panel_character_bindings WHERE panel_id IN ${inList}`).run(...inArgs);
            db.prepare(`DELETE FROM storyboard_panels WHERE panel_id IN ${inList}`).run(...inArgs);
          }
          const read = (snap: string): Array<Record<string, unknown>> =>
            db.prepare(`SELECT * FROM ${snap} WHERE snapshot_id = ?`).all(snapshotId) as Array<Record<string, unknown>>;
          const insertRows = (live: string, snap: string, rows: Array<Record<string, unknown>>): void => {
            const table = PANEL_TABLES.find((entry) => entry.live === live)!;
            const placeholders = table.columns.map(() => "?").join(", ");
            const insert = db.prepare(`INSERT INTO ${live} (${table.columns.join(", ")}) VALUES (${placeholders})`);
            for (const entry of rows) {
              insert.run(...table.columns.map((column) => (entry[column] === undefined ? null : entry[column])));
            }
          };
          insertRows("storyboard_panels", "snapshot_panels", read("snapshot_panels"));
          insertRows("panel_assignments", "snapshot_panel_assignments", read("snapshot_panel_assignments"));
          insertRows("panel_positions", "snapshot_panel_positions", read("snapshot_panel_positions"));
          insertRows("panel_location_assignments", "snapshot_panel_location_assignments", read("snapshot_panel_location_assignments"));
          insertRows("panel_cameras", "snapshot_panel_cameras", read("snapshot_panel_cameras"));
          insertRows("panel_text", "snapshot_panel_text", read("snapshot_panel_text"));
          insertRows("panel_instructions", "snapshot_panel_instructions", read("snapshot_panel_instructions"));
          insertRows("panel_character_bindings", "snapshot_panel_character_bindings", read("snapshot_panel_character_bindings"));
          db.exec("COMMIT");
          return toSnapshot(db, row);
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
