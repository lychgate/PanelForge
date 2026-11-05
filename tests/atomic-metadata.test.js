// S1.7 Atomic Metadata Operations tests.
//
// Proves the spec acceptance:
// - Safe metadata writes (serialized transactions: a throwing batch rolls
//   back entirely, previous metadata untouched)
// - Recovery from interrupted writes (corrupted database is preserved
//   as .bak-<timestamp>, a fresh database starts and works)
// - Basic autosave (write-through commit semantics + WAL checkpoint)
//
// Imported from the built `out/node/core/project/metadata.js` with a fresh
// temp project root per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/project/service.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");
if (!fs.existsSync(servicePath) || !fs.existsSync(metadataPath)) {
  throw new Error("Missing built project modules — run 'npm run build' first");
}

const { createProject } = require(servicePath);
const {
  createProjectMetadata,
  getProjectMetadata,
  updateProjectMetadata,
  withMetadataTransaction,
  checkpointProjectDatabase,
  openProjectDatabase,
  projectDatabasePath,
} = require(metadataPath);

let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-atomic-"));
  createProject(tmpRoot);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S1.7 atomic metadata operations", () => {
  it("a committed transaction persists all of its writes", async () => {
    await createProjectMetadata(tmpRoot, { name: "Atomic" });
    const result = await withMetadataTransaction(tmpRoot, (db) => {
      db.prepare("UPDATE projects SET description = ? WHERE project_id = (SELECT project_id FROM projects LIMIT 1)")
        .run("tx-desc");
      return db.prepare("SELECT description FROM projects").get().description;
    });
    expect(result).toBe("tx-desc");
    expect((await getProjectMetadata(tmpRoot)).description).toBe("tx-desc");
  });

  it("an interrupted transaction rolls back completely (no partial corruption)", async () => {
    await createProjectMetadata(tmpRoot, { name: "Before", description: "old" });
    await expect(
      withMetadataTransaction(tmpRoot, (db) => {
        db.prepare("UPDATE projects SET name = ?, description = ? WHERE (SELECT COUNT(*) FROM projects) = 1")
          .run("After", "new");
        throw new Error("simulated interruption");
      })
    ).rejects.toThrow("simulated interruption");
    const record = await getProjectMetadata(tmpRoot);
    expect(record.name).toBe("Before");
    expect(record.description).toBe("old");
  });

  it("serial writes queue correctly under concurrency", async () => {
    await createProjectMetadata(tmpRoot, { name: "start" });
    const writes = [];
    for (let i = 0; i < 10; i++) {
      writes.push(updateProjectMetadata(tmpRoot, { name: `name-${i}` }));
    }
    await Promise.all(writes);
    expect((await getProjectMetadata(tmpRoot)).name).toBe("name-9");
  });

  it("a corrupted database is preserved as .bak and a fresh one starts", async () => {
    await createProjectMetadata(tmpRoot, { name: "Survivor" });
    const dbPath = projectDatabasePath(tmpRoot);
    fs.writeFileSync(dbPath, "this is not a sqlite database", "utf8");
    const opened = openProjectDatabase(tmpRoot);
    expect(opened.recovered).toBe(true);
    expect(opened.backupPath.endsWith(".bak-") || opened.backupPath.includes(".bak-")).toBe(true);
    expect(fs.readFileSync(opened.backupPath, "utf8")).toBe("this is not a sqlite database");
    opened.db.close();
    // The fresh database works: row was re-created empty, create succeeds.
    expect(await getProjectMetadata(tmpRoot)).toBeNull();
    const record = await createProjectMetadata(tmpRoot, { name: "Recovered" });
    expect(record.name).toBe("Recovered");
  });

  it("a healthy database does not report recovery", () => {
    const opened = openProjectDatabase(tmpRoot);
    expect(opened.recovered).toBe(false);
    expect(opened.backupPath).toBeNull();
    opened.db.close();
  });

  it("checkpoint folds WAL and data stays readable (basic autosave)", async () => {
    await createProjectMetadata(tmpRoot, { name: "Flushable" });
    const busy = await checkpointProjectDatabase(tmpRoot);
    expect(busy).toBe(0);
    expect((await getProjectMetadata(tmpRoot)).name).toBe("Flushable");
  });

  it("marker write is fsync-backed (source check)", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/service.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).toContain("fsyncSync");
    expect(code).toContain("renameSync");
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/metadata.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
