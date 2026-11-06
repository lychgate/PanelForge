// S6.2 Storyboard panel records tests.
//
// Proves the spec acceptance: a storyboard creates/edits/
// deletes/reorders panels with no artwork attached; order persists.
//
// - create appends in sort order; unknown scenes reject.
// - list returns sort order; get round-trips; unknown → null.
// - movePanel reorders and persists; requires non-negative index.
// - delete removes; unknown IDs reject.
//
// Imported from the built `out/node/core/project/storyboard-panels.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
if (!fs.existsSync(panelsPath)) {
  throw new Error("Missing out/node/core/project/storyboard-panels.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel, getPanel, listPanels, movePanel, deletePanel } = require(panelsPath);

let projectRoot;
let scratch;
let sceneId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  sceneId = scene.sceneId;
});

describe("S6.2 storyboard panel records", () => {
  it("creates panels in sort order with stable identity", async () => {
    const a = await createPanel(projectRoot, sceneId);
    const b = await createPanel(projectRoot, sceneId);
    const c = await createPanel(projectRoot, sceneId);
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 2]);
    expect(a.sceneId).toBe(sceneId);
    expect(a.panelId).not.toBe(b.panelId);
    expect(await getPanel(projectRoot, b.panelId)).toMatchObject({ sortOrder: 1 });
    expect(await getPanel(projectRoot, "missing")).toBeNull();
    expect((await listPanels(projectRoot, sceneId)).map((p) => p.panelId)).toEqual([a.panelId, b.panelId, c.panelId]);
  });

  it("unknown scenes reject with typed errors", async () => {
    await expect(createPanel(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createPanel(projectRoot, "")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("movePanel reorders and persists; invalid moves reject", async () => {
    const a = await createPanel(projectRoot, sceneId);
    const b = await createPanel(projectRoot, sceneId);
    const c = await createPanel(projectRoot, sceneId);
    const moved = await movePanel(projectRoot, c.panelId, 0);
    expect(moved.map((p) => p.panelId)).toEqual([c.panelId, a.panelId, b.panelId]);
    expect((await listPanels(projectRoot, sceneId)).map((p) => p.panelId)).toEqual([c.panelId, a.panelId, b.panelId]);
    expect((await getPanel(projectRoot, c.panelId)).sortOrder).toBe(0);
    await expect(movePanel(projectRoot, "missing", 0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(movePanel(projectRoot, a.panelId, -1)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("delete removes; unknown IDs reject; migration v30 present", async () => {
    const a = await createPanel(projectRoot, sceneId);
    const b = await createPanel(projectRoot, sceneId);
    await expect(deletePanel(projectRoot, a.panelId)).resolves.toBeUndefined();
    expect(await getPanel(projectRoot, a.panelId)).toBeNull();
    expect((await listPanels(projectRoot, sceneId)).map((p) => p.panelId)).toEqual([b.panelId]);
    await expect(deletePanel(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(30);
    } finally {
      db.close();
    }
  });
});
