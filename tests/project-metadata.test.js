// S1.2 Project Metadata Schema tests.
//
// Proves the spec acceptance:
// - Project metadata persists correctly (database/project.db, the
//   authoritative store per D5 — projectId/createdAt inherited from the
//   S1.1 marker; name/description/timestamps persisted across reopen)
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
  projectDatabasePath,
} = require(metadataPath);

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-project-"));
  createProject(tmpRoot);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S1.2 project metadata schema", () => {
  it("creates the row in database/project.db with marker identity", async () => {
    const dbPath = projectDatabasePath(tmpRoot);
    expect(dbPath).toBe(path.join(tmpRoot, "database", "project.db"));
    const record = await createProjectMetadata(tmpRoot, { name: "My Comic" });
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(record.name).toBe("My Comic");
    expect(record.description).toBeNull();
    expect(typeof record.projectId).toBe("string");
    expect(typeof record.createdAt).toBe("string");
    expect(typeof record.updatedAt).toBe("string");
  });

  it("getProjectMetadata returns the created row", async () => {
    await createProjectMetadata(tmpRoot, { name: "My Comic", description: "desc" });
    const record = await getProjectMetadata(tmpRoot);
    expect(record).toMatchObject({ name: "My Comic", description: "desc" });
  });

  it("persists across reopen (new calls, same files)", async () => {
    await createProjectMetadata(tmpRoot, { name: "Persistent" });
    const record = await getProjectMetadata(tmpRoot);
    expect(record.name).toBe("Persistent");
  });

  it("updateProjectMetadata patches fields and bumps updated_at", async () => {
    const before = await createProjectMetadata(tmpRoot, { name: "Before" });
    await new Promise((r) => setTimeout(r, 5));
    const after = await updateProjectMetadata(tmpRoot, { name: "After", description: "d" });
    expect(after.name).toBe("After");
    expect(after.description).toBe("d");
    expect(Date.parse(after.updatedAt)).toBeGreaterThanOrEqual(Date.parse(before.updatedAt));
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.projectId).toBe(before.projectId);
  });

  it("rejects invalid names", async () => {
    await createProjectMetadata(tmpRoot, { name: "Valid" });
    await expect(createProjectMetadata(tmpRoot, { name: "" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(updateProjectMetadata(tmpRoot, { name: "" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
  });

  it("double-create is rejected, get with no row is null, update with no row is NOT_FOUND", async () => {
    expect(await getProjectMetadata(tmpRoot)).toBeNull();
    await expect(updateProjectMetadata(tmpRoot, { name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await createProjectMetadata(tmpRoot, { name: "once" });
    await expect(createProjectMetadata(tmpRoot, { name: "twice" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
  });

  it("metadata operations require a valid project marker", async () => {
    const bare = path.join(tmpRoot, "bare");
    fs.mkdirSync(bare);
    await expect(getProjectMetadata(bare)).rejects.toMatchObject({ code: "NOT_A_PROJECT" });
    await expect(createProjectMetadata(bare, { name: "x" })).rejects.toMatchObject({
      code: "NOT_A_PROJECT",
    });
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/metadata.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
