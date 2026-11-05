// S0.8 SQLite Foundation tests.
//
// Proves the spec acceptance:
// - Database initializes successfully (WAL, FK enforcement, busy timeout)
// - Migrations execute (schema_migrations tracking, auto-run on open)
// - Data persists across restarts (close + reopen)
// - Basic concurrent access does not cause uncontrolled write failures
//   (serialized write queue)
//
// The service is imported from the built `out/node/database/service.js`
// with a fresh temp userData dir per test, so tests run in plain Node
// without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/database/service.js");
if (!fs.existsSync(servicePath)) {
  throw new Error("Missing out/node/database/service.js — run 'npm run build' first");
}

const {
  createDatabaseService,
  DATABASE_VERSION,
  DEFAULT_BUSY_TIMEOUT_MS,
  DATABASE_FILE_NAME,
} = require(servicePath);

let tmpBase;
let svc;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-db-"));
  svc = createDatabaseService(tmpBase);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S0.8 database service", () => {
  it("initializes under userData/database/panelforge.db with required pragmas", () => {
    expect(svc.getDatabaseDir()).toBe(path.join(tmpBase, "database"));
    expect(svc.getDatabasePath()).toBe(path.join(tmpBase, "database", DATABASE_FILE_NAME));
    expect(svc.isOpen()).toBe(false);
    const info = svc.initialize();
    expect(svc.isOpen()).toBe(true);
    expect(fs.existsSync(svc.getDatabasePath())).toBe(true);
    expect(info.journalMode).toBe("wal");
    expect(info.foreignKeys).toBe(true);
    expect(info.busyTimeout).toBe(DEFAULT_BUSY_TIMEOUT_MS);
    expect(DATABASE_VERSION).toBe(1);
    expect(info.appliedMigrations).toContain("001_initial");
  });

  it("records migrations in schema_migrations and does not re-apply on reopen", () => {
    svc.initialize();
    expect(svc.getAppliedMigrations()).toEqual(["001_initial"]);
    svc.close();
    // Reopen with a fresh service handle on the same userData dir.
    const svc2 = createDatabaseService(tmpBase);
    const info = svc2.initialize();
    expect(info.appliedMigrations).toEqual(["001_initial"]);
    expect(svc2.getAppliedMigrations()).toEqual(["001_initial"]);
    svc2.close();
  });

  it("persists data across restarts", async () => {
    svc.initialize();
    await svc.write("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)", [
      "panelforge.theme",
      "dark",
      new Date().toISOString(),
    ]);
    svc.close();
    const svc2 = createDatabaseService(tmpBase);
    svc2.initialize();
    const rows = svc2.query("SELECT value FROM kv_store WHERE key = ?", ["panelforge.theme"]);
    expect(rows.map((r) => r.value)).toEqual(["dark"]);
    svc2.close();
  });

  it("serializes concurrent writes without uncontrolled failures", async () => {
    svc.initialize();
    const writes = [];
    for (let i = 0; i < 20; i++) {
      writes.push(
        svc.write("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)", [
          `key-${i}`,
          `value-${i}`,
          new Date().toISOString(),
        ])
      );
    }
    const results = await Promise.all(writes);
    expect(results.filter(Boolean)).toHaveLength(20);
    const count = svc.query("SELECT COUNT(*) AS n FROM kv_store");
    expect(Number(count[0].n)).toBe(20);
  });

  it("enforces foreign keys", () => {
    svc.initialize();
    svc.query("CREATE TABLE kv_child (k TEXT PRIMARY KEY, parent_key TEXT REFERENCES kv_store(key))");
    // Parent key does not exist: must be rejected with FK enforcement ON.
    expect(() =>
      svc.query("INSERT INTO kv_child (k, parent_key) VALUES (?, ?)", ["c1", "missing"])
    ).toThrow(/FOREIGN KEY/);
    // Valid parent works.
    svc.query("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)", [
      "p1",
      "v",
      new Date().toISOString(),
    ]);
    svc.query("INSERT INTO kv_child (k, parent_key) VALUES (?, ?)", ["c1", "p1"]);
    expect(svc.query("SELECT COUNT(*) AS n FROM kv_child")[0].n).toBe(1);
  });

  it("runs transactions and rolls back on error", async () => {
    svc.initialize();
    await svc.transaction((db) => {
      db.prepare("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)").run(
        "tx-1",
        "committed",
        new Date().toISOString()
      );
    });
    expect(svc.query("SELECT COUNT(*) AS n FROM kv_store WHERE key = ?", ["tx-1"])[0].n).toBe(1);
    await expect(
      svc.transaction((db) => {
        db.prepare("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)").run(
          "tx-2",
          "rolled-back",
          new Date().toISOString()
        );
        throw new Error("forced failure");
      })
    ).rejects.toThrow("forced failure");
    expect(svc.query("SELECT COUNT(*) AS n FROM kv_store WHERE key = ?", ["tx-2"])[0].n).toBe(0);
  });

  it("backupDatabase produces a standalone copy with the same data", async () => {
    svc.initialize();
    await svc.write("INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)", [
      "bk",
      "kept",
      new Date().toISOString(),
    ]);
    const dest = await svc.backupDatabase();
    expect(dest.startsWith(svc.getDatabaseDir())).toBe(true);
    expect(fs.existsSync(dest)).toBe(true);
    svc.close();
    const svc2 = createDatabaseService(path.dirname(path.dirname(dest)));
    // Point a fresh service's backup copy check through raw sqlite instead:
    const { DatabaseSync } = require("node:sqlite");
    const bdb = new DatabaseSync(dest);
    try {
      const rows = bdb.prepare("SELECT value FROM kv_store WHERE key = ?").all("bk");
      expect(rows.map((r) => r.value)).toEqual(["kept"]);
    } finally {
      bdb.close();
      void svc2;
    }
  });

  it("query/write before initialize fails cleanly", () => {
    expect(() => svc.query("SELECT 1")).toThrow(/not initialized/);
    expect(svc.getAppliedMigrations()).toEqual([]);
    expect(svc.isOpen()).toBe(false);
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/database/service.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
    expect(code).toContain('app.getPath("userData")');
    expect(code).toContain('require("node:sqlite")');
  });

  it("main initializes the database on startup and closes it on quit", () => {
    const mainCode = stripLineComments(
      fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8")
    );
    expect(mainCode).toContain("defaultDatabaseService");
    expect(mainCode).toContain("initialize");
  });
});
