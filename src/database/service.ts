// PanelForge — SQLite foundation service (S0.8).
//
// Centralized database access owned by the Core Engine boundary (spec
// §7.3): one shared connection, Serialized writes, and no uncontrolled
// concurrent writes from other modules.
//
// Library choice (spec §14 "Drizzle ORM or equivalent"; resolves D8/Q3):
// Node's built-in `node:sqlite` (DatabaseSync) — verified available in
// both plain Node (tests) and Electron's bundled Node (main process),
// so no native add-on or electron-rebuild is required. Drizzle adoption
// can layer over this driver later without changing the service API.
// Async-mutex/writer-queue stays an implementation detail below.
//
// Required pragmas are applied at open: journal_mode=WAL,
// foreign_keys=ON, busy_timeout=5000. Migrations are tracked in the
// schema_migrations table and auto-run on open (forward-only; D9).
// Busy/locking retries wrap writes; backupDatabase() produces a
// consistent standalone copy (see D10 recovery as a later task).

import * as fs from "fs";
import * as path from "path";

// `node:sqlite` is experimental and has no bundled TypeScript types in
// this repo; require() keeps typecheck + build dependency-free.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite = require("node:sqlite") as {
  DatabaseSync: new (p: string) => DatabaseLike;
  backup: (db: DatabaseLike, dest: string) => void;
  constants: Record<string, unknown>;
};

type StatementLike = {
  run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
};

type DatabaseLike = {
  exec: (sql: string) => void;
  prepare: (sql: string) => StatementLike;
  close: () => void;
};

export const DATABASE_VERSION = 1;
export const DEFAULT_BUSY_TIMEOUT_MS = 5000;
export const MAX_WRITE_RETRIES = 3;
export const DATABASE_FILE_NAME = "panelforge.db";

export type Migration = { version: number; name: string; statements: string[] };

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "001_initial",
    statements: [
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S2.2: persistent generation-task records (12 §11.1 states stored as
  // machine strings; params as JSON). Queue/transition logic is S2.3+.
  {
    version: 2,
    name: "002_tasks",
    statements: [
      "CREATE TABLE IF NOT EXISTS tasks (task_id TEXT PRIMARY KEY, task_type TEXT NOT NULL, state TEXT NOT NULL, params TEXT NOT NULL, project_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    ],
  },
  // S2.7: timing/error fields for progress reporting (§11.2 elapsed,
  // status, logs/errors). started_at: first non-queued state; finished_at:
  // terminal states; error_message: last failure reason (nullable).
  {
    version: 3,
    name: "003_task_progress",
    statements: [
      "ALTER TABLE tasks ADD COLUMN started_at TEXT",
      "ALTER TABLE tasks ADD COLUMN finished_at TEXT",
      "ALTER TABLE tasks ADD COLUMN error_message TEXT",
    ],
  },
];

export type DatabaseInitInfo = {
  journalMode: string;
  foreignKeys: boolean;
  busyTimeout: number;
  databasePath: string;
  appliedMigrations: string[];
};

export type DatabaseService = {
  getDatabaseDir: () => string;
  getDatabasePath: () => string;
  isOpen: () => boolean;
  initialize: () => DatabaseInitInfo;
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
  write: <T = unknown>(sql: string, params?: unknown[]) => Promise<T>;
  transaction: <T = unknown>(fn: (db: DatabaseLike) => T) => Promise<T>;
  getAppliedMigrations: () => string[];
  backupDatabase: () => Promise<string>;
  close: () => void;
};

function resolveUserDataDir(explicitBaseDir?: string): string {
  if (explicitBaseDir) return explicitBaseDir;
  const envOverride = process.env.PANELFORGE_USER_DATA_DIR;
  if (envOverride && envOverride.trim() !== "") return envOverride;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      return app.getPath("userData");
    }
  } catch {
    // Electron unavailable (unit tests) — fall through.
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, ".config", "panelforge");
}

function isBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code;
  return code === "SQLITE_BUSY" || /database is locked|busy/i.test(msg);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createDatabaseService(explicitBaseDir?: string): DatabaseService {
  const userDataDir = resolveUserDataDir(explicitBaseDir);
  const databaseDir = path.join(userDataDir, "database");
  const databasePath = path.join(databaseDir, DATABASE_FILE_NAME);

  let db: DatabaseLike | null = null;
  let initInfo: DatabaseInitInfo | null = null;

  // Serialized write chain: every write/transaction is appended here so
  // writers run one at a time in arrival order (D8 / spec §7.3).
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function runWithBusyRetry<T>(fn: () => T): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return fn();
      } catch (err) {
        attempt++;
        if (!isBusyError(err) || attempt > MAX_WRITE_RETRIES) throw err;
        await delay(10 * attempt);
      }
    }
  }

  function getDatabaseDir(): string {
    return databaseDir;
  }
  function getDatabasePath(): string {
    return databasePath;
  }
  function isOpen(): boolean {
    return db !== null;
  }

  function applyMigrations(handle: DatabaseLike): string[] {
    handle.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
    );
    const applied = new Set(handle.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version)));
    const nowApplied: string[] = [];
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      handle.exec("BEGIN IMMEDIATE");
      try {
        for (const stmt of m.statements) handle.exec(stmt);
        handle
          .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(m.version, m.name, new Date().toISOString());
        handle.exec("COMMIT");
        nowApplied.push(m.name);
      } catch (err) {
        try {
          handle.exec("ROLLBACK");
        } catch {
          // Ignore rollback failure; surface the original error.
        }
        throw err;
      }
    }
    return nowApplied;
  }

  function initialize(): DatabaseInitInfo {
    if (db && initInfo) return initInfo;
    fs.mkdirSync(databaseDir, { recursive: true });
    const handle = new sqlite.DatabaseSync(databasePath);
    try {
      handle.exec("PRAGMA journal_mode=WAL");
      handle.exec("PRAGMA foreign_keys=ON");
      handle.exec(`PRAGMA busy_timeout=${DEFAULT_BUSY_TIMEOUT_MS}`);
      const appliedNow = applyMigrations(handle);
      const journalMode = String(handle.prepare("PRAGMA journal_mode").get()?.journal_mode ?? "");
      const fk = handle.prepare("PRAGMA foreign_keys").get()?.foreign_keys;
      const bt = handle.prepare("PRAGMA busy_timeout").get()?.busy_timeout;
      initInfo = {
        journalMode,
        foreignKeys: fk === 1 || fk === true,
        busyTimeout: Number(bt ?? DEFAULT_BUSY_TIMEOUT_MS),
        databasePath,
        appliedMigrations: getAppliedNames(handle).length > 0 ? getAppliedNames(handle) : appliedNow,
      };
      db = handle;
      return initInfo;
    } catch (err) {
      try {
        handle.close();
      } catch {
        // Best effort cleanup on failed initialization.
      }
      throw err;
    }
  }

  function getAppliedNames(handle: DatabaseLike): string[] {
    try {
      return handle
        .prepare("SELECT name FROM schema_migrations ORDER BY version")
        .all()
        .map((r) => String(r.name));
    } catch {
      return [];
    }
  }

  function requireOpen(): DatabaseLike {
    if (!db) throw new Error("Database not initialized — call initialize() first");
    return db;
  }

  function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const handle = requireOpen();
    return handle.prepare(sql).all(...params).map((row) => ({ ...row }) as T);
  }

  function write<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    return enqueue<T>(() =>
      runWithBusyRetry<T>(() => requireOpen().prepare(sql).run(...params) as unknown as T)
    );
  }

  function transaction<T = unknown>(fn: (db: DatabaseLike) => T): Promise<T> {
    return enqueue<T>(() =>
      runWithBusyRetry<T>(() => {
        const handle = requireOpen();
        handle.exec("BEGIN IMMEDIATE");
        try {
          const result = fn(handle);
          handle.exec("COMMIT");
          return result;
        } catch (err) {
          try {
            handle.exec("ROLLBACK");
          } catch {
            // Ignore rollback failure; surface the original error.
          }
          throw err;
        }
      })
    );
  }

  function getAppliedMigrations(): string[] {
    if (!db) return [];
    return getAppliedNames(db);
  }

  async function backupDatabase(): Promise<string> {
    const handle = requireOpen();
    const backupsDir = path.join(databaseDir, "backups");
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(backupsDir, `panelforge-${stamp}.db`);
    if (fs.existsSync(dest)) throw new Error(`Backup already exists: ${dest}`);
    await enqueue<void>(() => sqlite.backup(handle, dest));
    return dest;
  }

  function close(): void {
    if (db) {
      db.close();
      db = null;
      initInfo = null;
    }
  }

  return {
    getDatabaseDir,
    getDatabasePath,
    isOpen,
    initialize,
    query,
    write,
    transaction,
    getAppliedMigrations,
    backupDatabase,
    close,
  };
}

// Default singleton for the running app. Main initializes it on startup
// and closes it before quit; failures are logged, never blocking launch.
export const defaultDatabaseService = createDatabaseService();
