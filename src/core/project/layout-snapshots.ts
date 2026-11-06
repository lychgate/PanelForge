// PanelForge — Comic Layout Studio: layout snapshots (S8.10).
//
// Preserve + branch page layouts like S6.10:
//
// - `createLayoutSnapshot` full-copies pages + placements
//   + borders + balloons + SFX + reading order into
//   snapshot tables. Immutable: no update/delete API.
// - Branching is lineage (parent snapshot id); creating
//   with a parent never touches the parent's copy.
// - `restoreLayoutSnapshot` replaces the live layout
//   in one transaction.
// - Layout snapshots never feed Stage 10 directly.
// - SVG rendering stays S8.11.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type LayoutSnapshot = {
  snapshotId: string;
  name: string;
  parentSnapshotId: string | null;
  createdAt: string;
  pageCount: number;
};

export type LayoutSnapshotContents = {
  snapshot: LayoutSnapshot;
  pages: Array<Record<string, unknown>>;
  placements: Array<Record<string, unknown>>;
  borders: Array<Record<string, unknown>>;
  balloons: Array<Record<string, unknown>>;
  sfx: Array<Record<string, unknown>>;
  readingOrders: Array<Record<string, unknown>>;
};

export class LayoutSnapshotError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LayoutSnapshotError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LayoutSnapshotError(identified.code, identified.message);
  }
}

const TABLES: Array<{ live: string; snap: string; columns: string[]; orderBy: string }> = [
  {
    live: "pages",
    snap: "snapshot_pages",
    columns: ["page_id", "manuscript_id", "title", "format", "width", "height", "margin", "created_at", "updated_at"],
    orderBy: "page_id",
  },
  {
    live: "page_panels",
    snap: "snapshot_page_panels",
    columns: ["placement_id", "page_id", "panel_id", "asset_id", "artwork_id", "x", "y", "width", "height", "z_order", "border", "created_at", "updated_at"],
    orderBy: "placement_id",
  },
  {
    live: "placement_borders",
    snap: "snapshot_placement_borders",
    columns: ["placement_id", "style", "width_mm", "rounded", "updated_at"],
    orderBy: "placement_id",
  },
  {
    live: "balloons",
    snap: "snapshot_balloons",
    columns: ["balloon_id", "placement_id", "kind", "shape", "x", "y", "width", "height", "tail_x", "tail_y", "tail_visible", "created_at", "updated_at"],
    orderBy: "balloon_id",
  },
  {
    live: "sfx",
    snap: "snapshot_sfx",
    columns: ["sfx_id", "placement_id", "text", "weight", "angle", "x", "y", "scale", "created_at", "updated_at"],
    orderBy: "sfx_id",
  },
  {
    live: "reading_order",
    snap: "snapshot_reading_order",
    columns: ["page_id", "order_json", "updated_at"],
    orderBy: "page_id",
  },
];
TABLES[3].columns.push("text");

export type CreateLayoutSnapshotInput = {
  name?: string;
  parentSnapshotId?: string;
};

/** Copy the live layout into a new immutable snapshot. */
export async function createLayoutSnapshot(root: string, input?: CreateLayoutSnapshotInput): Promise<LayoutSnapshot> {
  requireProject(root);
  const name = input?.name ?? "";
  if (typeof name !== "string") throw new LayoutSnapshotError("INVALID_ARGUMENTS", "name must be a string");
  const parentSnapshotId = input?.parentSnapshotId;
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<LayoutSnapshot>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          if (parentSnapshotId !== undefined) {
            if (typeof parentSnapshotId !== "string" || parentSnapshotId.trim() === "") {
              throw new LayoutSnapshotError("INVALID_ARGUMENTS", "parentSnapshotId must not be empty");
            }
            const parent = db.prepare("SELECT snapshot_id FROM layout_snapshots WHERE snapshot_id = ?").get(parentSnapshotId);
            if (!parent) throw new LayoutSnapshotError("NOT_FOUND", `No snapshot with id: ${parentSnapshotId}`);
          }
          const snapshotId = crypto.randomUUID();
          const now = new Date().toISOString();
          db.prepare("INSERT INTO layout_snapshots (snapshot_id, name, parent_snapshot_id, created_at) VALUES (?, ?, ?, ?)").run(
            snapshotId,
            name,
            parentSnapshotId ?? null,
            now
          );
          for (const table of TABLES) {
            const rows = db.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.live}`).all() as Array<Record<string, unknown>>;
            const placeholders = table.columns.map(() => "?").join(", ");
            const insert = db.prepare(`INSERT INTO ${table.snap} (snapshot_id, ${table.columns.join(", ")}) VALUES (?, ${placeholders})`);
            for (const row of rows) {
              insert.run(snapshotId, ...table.columns.map((column) => (row[column] === undefined ? null : row[column])));
            }
          }
          const inserted = db.prepare("SELECT * FROM layout_snapshots WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown>;
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

function pageCount(db: { prepare: (s: string) => { get: (p: unknown) => Record<string, unknown> } }, snapshotId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM snapshot_pages WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown>;
  return Number(row.n);
}

function toSnapshot(db: { prepare: (s: string) => { get: (p: unknown) => Record<string, unknown> } }, row: Record<string, unknown>): LayoutSnapshot {
  return {
    snapshotId: String(row.snapshot_id),
    name: String(row.name ?? ""),
    parentSnapshotId: row.parent_snapshot_id === null || row.parent_snapshot_id === undefined ? null : String(row.parent_snapshot_id),
    createdAt: String(row.created_at),
    pageCount: pageCount(db, String(row.snapshot_id)),
  };
}

/** All layout snapshots, newest first. */
export async function listLayoutSnapshots(root: string): Promise<LayoutSnapshot[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM layout_snapshots ORDER BY created_at DESC, snapshot_id").all() as Array<Record<string, unknown>>;
    return rows.map((row) => toSnapshot(db, row));
  } finally {
    db.close();
  }
}

/** One snapshot with its full copied contents. */
export async function getLayoutSnapshot(root: string, snapshotId: string): Promise<LayoutSnapshotContents> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM layout_snapshots WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown> | undefined;
    if (!row) throw new LayoutSnapshotError("NOT_FOUND", `No snapshot with id: ${snapshotId}`);
    const read = (snap: string): Array<Record<string, unknown>> =>
      db.prepare(`SELECT * FROM ${snap} WHERE snapshot_id = ? ORDER BY rowid`).all(snapshotId) as Array<Record<string, unknown>>;
    return {
      snapshot: toSnapshot(db, row),
      pages: read("snapshot_pages"),
      placements: read("snapshot_page_panels"),
      borders: read("snapshot_placement_borders"),
      balloons: read("snapshot_balloons"),
      sfx: read("snapshot_sfx"),
      readingOrders: read("snapshot_reading_order"),
    };
  } finally {
    db.close();
  }
}

/**
 * Replace the live layout with a snapshot's copy in one
 * transaction (children first, FK-safe).
 */
export async function restoreLayoutSnapshot(root: string, snapshotId: string): Promise<LayoutSnapshot> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<LayoutSnapshot>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const row = db.prepare("SELECT * FROM layout_snapshots WHERE snapshot_id = ?").get(snapshotId) as Record<string, unknown> | undefined;
          if (!row) throw new LayoutSnapshotError("NOT_FOUND", `No snapshot with id: ${snapshotId}`);
          db.prepare("DELETE FROM balloons").run();
          db.prepare("DELETE FROM sfx").run();
          db.prepare("DELETE FROM placement_borders").run();
          db.prepare("DELETE FROM reading_order").run();
          db.prepare("DELETE FROM page_panels").run();
          db.prepare("DELETE FROM pages").run();
          for (const table of TABLES) {
            const rows = db.prepare(`SELECT * FROM ${table.snap} WHERE snapshot_id = ?`).all(snapshotId) as Array<Record<string, unknown>>;
            const placeholders = table.columns.map(() => "?").join(", ");
            const insert = db.prepare(`INSERT INTO ${table.live} (${table.columns.join(", ")}) VALUES (${placeholders})`);
            for (const entry of rows) {
              insert.run(...table.columns.map((column) => (entry[column] === undefined ? null : entry[column])));
            }
          }
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
