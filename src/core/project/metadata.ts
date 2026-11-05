// PanelForge — project metadata schema (S1.2).
//
// The project's metadata persists in database/project.db — the
// authoritative operational store per the approved D5 resolution. The
// project.json marker (S1.1) carries the identity (projectId); this
// module owns the row that describes the project:
//
//   projects(project_id TEXT PRIMARY KEY, name TEXT NOT NULL,
//            description TEXT, created_at TEXT NOT NULL,
//            updated_at TEXT NOT NULL)
//
// Connection discipline mirrors the S0.8 app database: WAL + foreign keys
// + busy timeout at open, tracked migrations (schema_migrations table),
// serialized writes with busy retry. Every write goes through one
// in-process queue, so concurrent writers cannot produce uncontrolled
// interleavings.

import * as fs from "fs";
import * as path from "path";
import { identifyProject, PROJECT_DATABASE_DIR, PROJECT_DATABASE_FILE } from "./service";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite = require("node:sqlite") as {
  DatabaseSync: new (p: string) => DatabaseLike;
};

type StatementLike = {
  run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
};

export type DatabaseLike = {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementLike;
  close: () => void;
};

export { StatementLike };

export const PROJECT_METADATA_VERSION = 1;

export type ProjectMetadataRecord = {
  projectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ProjectMetadataError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMetadataError";
    this.code = code;
  }
}

type ProjectDbMigration = { version: number; name: string; statements: readonly string[] };

const PROJECT_DB_MIGRATIONS: readonly ProjectDbMigration[] = [
  {
    version: 1,
    name: "001_initial",
    statements: [
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S1.5: asset registry. Columns are the S1.5 subset of the §7.4 metadata
  // list (UID + relative path + type + dates + hash); version/approval/
  // relationships/provenance arrive with later tasks.
  {
    version: 2,
    name: "002_asset_registry",
    statements: [
      "CREATE TABLE IF NOT EXISTS assets (asset_id TEXT PRIMARY KEY, relative_path TEXT NOT NULL UNIQUE, asset_type TEXT NOT NULL, file_hash TEXT NOT NULL, file_size INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
];

export function projectDatabasePath(root: string): string {
  return path.join(path.resolve(root), PROJECT_DATABASE_DIR, PROJECT_DATABASE_FILE);
}

export function isBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code;
  return code === "SQLITE_BUSY" || /database is locked|busy/i.test(msg);
}

export async function runWithBusyRetry<T>(fn: () => T): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return fn();
    } catch (err) {
      attempt++;
      if (!isBusyError(err) || attempt > 3) throw err;
      await new Promise((r) => setTimeout(r, 10 * attempt));
    }
  }
}

let tail: Promise<unknown> = Promise.resolve();
export function enqueueWrite<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Open (creating if needed) the project database and run migrations. */
export function openProjectDatabase(root: string): { db: DatabaseLike } {
  const dbPath = projectDatabasePath(root);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new sqlite.DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec("PRAGMA busy_timeout=5000");
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
    );
    const applied = new Set(
      db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version))
    );
    for (const migration of PROJECT_DB_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const stmt of migration.statements) db.exec(stmt);
        db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(migration.version, migration.name, new Date().toISOString());
        db.exec("COMMIT");
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Surface the original error.
        }
        throw err;
      }
    }
    return { db };
  } catch (err) {
    try {
      db.close();
    } catch {
      // Best effort cleanup.
    }
    throw err;
  }
}

function toRecord(row: Record<string, unknown>): ProjectMetadataRecord {
  return {
    projectId: String(row.project_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function requireIdentified(root: string): { projectId: string; createdAt: string } {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ProjectMetadataError(identified.code, identified.message);
  }
  return { projectId: identified.metadata.projectId, createdAt: identified.metadata.createdAt };
}

/** Create the project's metadata row (identity and creation come from the marker). */
export async function createProjectMetadata(
  root: string,
  input: { name: string; description?: string | null }
): Promise<ProjectMetadataRecord> {
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new ProjectMetadataError("INVALID_ARGUMENTS", "Project name must not be empty");
  }
  const identity = requireIdentified(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const existing = db.prepare("SELECT project_id FROM projects WHERE project_id = ?").get(identity.projectId);
      if (existing) {
        throw new ProjectMetadataError("ALREADY_EXISTS", "Project metadata already exists");
      }
      const description = input.description ?? null;
      return await runWithBusyRetry<ProjectMetadataRecord>(() => {
        db.prepare("INSERT INTO projects (project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .run(identity.projectId, input.name, description, identity.createdAt, new Date().toISOString());
        const row = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Read the project's metadata row, or null when no row exists yet. */
export async function getProjectMetadata(root: string): Promise<ProjectMetadataRecord | null> {
  const identity = requireIdentified(root);
  const dbPath = projectDatabasePath(root);
  if (!fs.existsSync(dbPath)) return null;
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
    return row ? toRecord(row as Record<string, unknown>) : null;
  } finally {
    db.close();
  }
}

/** Patch the metadata row (name and/or description); bumps updated_at. */
export async function updateProjectMetadata(
  root: string,
  patch: { name?: string; description?: string | null }
): Promise<ProjectMetadataRecord> {
  const identity = requireIdentified(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const row = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
      if (!row) {
        throw new ProjectMetadataError("NOT_FOUND", "Project metadata row does not exist");
      }
      const current = toRecord(row as Record<string, unknown>);
      const nextName = patch.name ?? current.name;
      if (typeof nextName !== "string" || nextName.trim() === "") {
        throw new ProjectMetadataError("INVALID_ARGUMENTS", "Project name must not be empty");
      }
      const nextDescription = patch.description === undefined ? current.description : patch.description;
      const updatedAt = new Date().toISOString();
      return await runWithBusyRetry<ProjectMetadataRecord>(() => {
        db.prepare("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE project_id = ?")
          .run(nextName, nextDescription, updatedAt, identity.projectId);
        const updated = db.prepare("SELECT * FROM projects WHERE project_id = ?").get(identity.projectId);
        return toRecord(updated as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

export function validateRecordShape(raw: unknown): raw is ProjectMetadataRecord {
  if (raw === null || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.projectId === "string" &&
    typeof r.name === "string" &&
    typeof r.createdAt === "string" &&
    typeof r.updatedAt === "string"
  );
}
