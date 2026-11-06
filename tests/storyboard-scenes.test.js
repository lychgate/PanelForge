// S6.1 Storyboard scene records tests.
//
// Proves the spec acceptance: scenes create, read back, update,
// and delete with typed errors; every scene resolves its source
// chain; extraction rows are never rewritten.
//
// - create wraps manuscript + chapter + extraction scene; purpose
//   defaults to "".
// - unknown manuscript/chapter/extraction links reject.
// - update merges partially; identity/createdAt stable.
// - extraction scenes unchanged by storyboard CRUD.
// - list filters per manuscript; delete removes; migration v29.
//
// Imported from the built `out/node/core/project/storyboard-scenes.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const storyboardPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
if (!fs.existsSync(storyboardPath)) {
  throw new Error("Missing out/node/core/project/storyboard-scenes.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");
const scenesPath = path.join(root, "out/node/core/project/scenes.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { storeNormalization } = require(normalizePath);
const { storeChapters } = require(chaptersPath);
const { storeScenes, listScenes: listExtractionScenes } = require(scenesPath);
const { createScene, getScene, listScenes, updateScene, deleteScene } = require(storyboardPath);

let projectRoot;
let scratch;
let manuscriptId;
let chapterId;
let extractionSceneId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nRobby met ARKNAD.\n\nINT. TAVERN - NIGHT\n\nRobby ordered cider.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  manuscriptId = record.manuscriptId;
  await storeNormalization(projectRoot, manuscriptId);
  const chapters = await storeChapters(projectRoot, manuscriptId);
  chapterId = chapters[0].chapterId;
  const scenes = await storeScenes(projectRoot, manuscriptId);
  extractionSceneId = scenes[0].sceneId;
});

describe("S6.1 storyboard scene records", () => {
  it("creates a storyboard scene wrapping its source chain", async () => {
    const scene = await createScene(projectRoot, {
      manuscriptId,
      chapterId,
      extractionSceneId,
      narrativePurpose: "Establish the tavern meeting",
    });
    expect(scene.manuscriptId).toBe(manuscriptId);
    expect(scene.chapterId).toBe(chapterId);
    expect(scene.extractionSceneId).toBe(extractionSceneId);
    expect(scene.narrativePurpose).toBe("Establish the tavern meeting");
    expect(scene.sceneId).toBeTruthy();
    expect(await getScene(projectRoot, scene.sceneId)).toMatchObject({ narrativePurpose: "Establish the tavern meeting" });
    expect(await getScene(projectRoot, "missing")).toBeNull();
  });

  it("purpose defaults to empty; source links optional", async () => {
    const scene = await createScene(projectRoot, { manuscriptId });
    expect(scene.narrativePurpose).toBe("");
    expect(scene.chapterId).toBeNull();
    expect(scene.extractionSceneId).toBeNull();
  });

  it("unknown manuscript, chapter, or extraction links reject", async () => {
    await expect(createScene(projectRoot, { manuscriptId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createScene(projectRoot, { manuscriptId, chapterId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createScene(projectRoot, { manuscriptId, extractionSceneId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createScene(projectRoot, { manuscriptId: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("update merges partially; identity and createdAt stable; extraction untouched", async () => {
    const scene = await createScene(projectRoot, { manuscriptId, chapterId, extractionSceneId, narrativePurpose: "Draft purpose" });
    const before = await listExtractionScenes(projectRoot, manuscriptId);
    const updated = await updateScene(projectRoot, scene.sceneId, { narrativePurpose: "Final purpose" });
    expect(updated.sceneId).toBe(scene.sceneId);
    expect(updated.createdAt).toBe(scene.createdAt);
    expect(updated.narrativePurpose).toBe("Final purpose");
    expect(updated.extractionSceneId).toBe(extractionSceneId);
    expect(updated.updatedAt >= scene.updatedAt).toBe(true);
    const after = await listExtractionScenes(projectRoot, manuscriptId);
    expect(after).toEqual(before);
    await expect(updateScene(projectRoot, "missing", { narrativePurpose: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("list filters per manuscript; delete removes; migration v29 present", async () => {
    const scene = await createScene(projectRoot, { manuscriptId, extractionSceneId });
    expect((await listScenes(projectRoot, manuscriptId)).map((s) => s.sceneId)).toEqual([scene.sceneId]);
    await expect(deleteScene(projectRoot, scene.sceneId)).resolves.toBeUndefined();
    expect(await getScene(projectRoot, scene.sceneId)).toBeNull();
    expect(await listScenes(projectRoot, manuscriptId)).toHaveLength(0);
    await expect(deleteScene(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(29);
    } finally {
      db.close();
    }
  });
});
