// S1.3 Basic Project Operations tests.
//
// Proves the spec acceptance:
// - Each operation (create/list/open/close/rename/archive) works
//   independently
// - Invalid project operations return useful errors (typed codes)
//
// Imported from the built `out/node/core/project/operations.js` with a fresh
// temp parent dir per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const opsPath = path.join(root, "out/node/core/project/operations.js");
if (!fs.existsSync(opsPath)) {
  throw new Error("Missing out/node/core/project/operations.js — run 'npm run build' first");
}

const {
  createProjectAt,
  listProjects,
  openProject,
  closeProject,
  renameProject,
  archiveProject,
  createProjectManager,
  validateProjectName,
} = require(opsPath);

let parentDir;
beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-projects-"));
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S1.3 project operations", () => {
  it("create makes a real project (marker + metadata) and list finds it", async () => {
    const { root: projRoot, projectId } = await createProjectAt(parentDir, "My Comic", {
      description: "first",
    });
    expect(fs.existsSync(path.join(projRoot, "project.json"))).toBe(true);
    const list = await listProjects(parentDir);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ root: projRoot, projectId, name: "My Comic" });
  });

  it("create rejects duplicates, invalid names, and empty parents", async () => {
    await createProjectAt(parentDir, "Twin");
    await expect(createProjectAt(parentDir, "Twin")).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    await expect(createProjectAt(parentDir, "..")).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(createProjectAt(parentDir, "a/b")).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(createProjectAt(parentDir, "")).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(createProjectAt("", "x")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    expect(validateProjectName(" ok ")).toBe("ok");
  });

  it("list on a missing directory is NOT_FOUND; non-project dirs are skipped", async () => {
    await expect(listProjects(path.join(parentDir, "missing"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    fs.mkdirSync(path.join(parentDir, "junk"));
    await createProjectAt(parentDir, "Real");
    const list = await listProjects(parentDir);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Real");
  });

  it("open/close exclusivity: second open and double close are rejected", async () => {
    const { root: projRoot } = await createProjectAt(parentDir, "Exclusive");
    const manager = createProjectManager();
    const summary = await openProject(projRoot, manager);
    expect(summary.name).toBe("Exclusive");
    expect(manager.isOpen(projRoot)).toBe(true);
    await expect(openProject(projRoot, manager)).rejects.toMatchObject({ code: "ALREADY_OPEN" });
    closeProject(projRoot, manager);
    expect(manager.isOpen(projRoot)).toBe(false);
    expect(() => closeProject(projRoot, manager)).toThrow(expect.objectContaining({ code: "ALREADY_CLOSED" }));
  });

  it("open on a non-project is NOT_A_PROJECT", async () => {
    const manager = createProjectManager();
    fs.mkdirSync(path.join(parentDir, "nope"));
    await expect(openProject(path.join(parentDir, "nope"), manager)).rejects.toMatchObject({
      code: "NOT_A_PROJECT",
    });
  });

  it("rename moves the folder + updates metadata; the ID never changes", async () => {
    const { root: oldRoot, projectId } = await createProjectAt(parentDir, "Old Name");
    const manager = createProjectManager();
    const { root: newRoot, projectId: id2 } = await renameProject(oldRoot, "New Name", manager);
    expect(id2).toBe(projectId);
    expect(fs.existsSync(oldRoot)).toBe(false);
    expect(fs.existsSync(path.join(newRoot, "project.json"))).toBe(true);
    const list = await listProjects(parentDir);
    expect(list[0]).toMatchObject({ projectId, name: "New Name" });
    await expect(renameProject(newRoot, "..", manager)).rejects.toMatchObject({ code: "INVALID_NAME" });
  });

  it("rename/archive while open are rejected until closed", async () => {
    const { root: projRoot } = await createProjectAt(parentDir, "Locked");
    const manager = createProjectManager();
    await openProject(projRoot, manager);
    await expect(renameProject(projRoot, "Other", manager)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(archiveProject(projRoot, manager)).rejects.toMatchObject({ code: "INVALID_STATE" });
    closeProject(projRoot, manager);
    await expect(renameProject(projRoot, "Other", manager)).resolves.toBeDefined();
  });

  it("archive moves the project out of the active library", async () => {
    const { root: projRoot } = await createProjectAt(parentDir, "To Archive");
    const manager = createProjectManager();
    const { root: dest } = await archiveProject(projRoot, manager);
    expect(dest).toContain(".archived");
    expect(fs.existsSync(path.join(dest, "project.json"))).toBe(true);
    expect(fs.existsSync(projRoot)).toBe(false);
    expect(await listProjects(parentDir)).toHaveLength(0);
  });

  it("operations source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/operations.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
