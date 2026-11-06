// S6.8 Scene style overrides tests.
//
// Proves the spec acceptance: a contested scene resolves to the
// same winner every time; no match falls back to default.
//
// - resolveSceneStyle with no scene variant falls back to the
//   canonical default (variantId null, guidance-only).
// - A scene override wins over a project variant for that scene.
// - Two competing scene overrides resolve deterministically
//   (lower priority wins; resolve twice, same winner).
// - set/list/clear round-trips; clearing a non-scene variant
//   rejects; unknown scene/style ids reject with typed errors.
//
// Imported from the built `out/node/core/project/scene-style.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const stylePath = path.join(root, "out/node/core/project/scene-style.js");
if (!fs.existsSync(stylePath)) {
  throw new Error("Missing out/node/core/project/scene-style.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
const variantsPath = path.join(root, "out/node/core/project/style-variants.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createStyle } = require(stylesPath);
const { createVariant } = require(variantsPath);
const { setSceneStyleOverride, listSceneOverrides, clearSceneStyleOverride, resolveSceneStyle } = require(stylePath);

let projectRoot;
let sceneId;
let defaultStyleId;
let moodyStyleId;
let brightStyleId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  sceneId = (await createScene(projectRoot, { manuscriptId: record.manuscriptId })).sceneId;
  // First style becomes the canonical project default.
  defaultStyleId = (await createStyle(projectRoot, { name: "Default", lighting: "soft daylight" })).styleId;
  moodyStyleId = (await createStyle(projectRoot, { name: "Moody", lighting: "harsh moonlight" })).styleId;
  brightStyleId = (await createStyle(projectRoot, { name: "Bright", lighting: "warm noon" })).styleId;
});

describe("S6.8 scene style overrides", () => {
  it("no scene variant falls back to the canonical default", async () => {
    const resolution = await resolveSceneStyle(projectRoot, { sceneId });
    expect(resolution).not.toBeNull();
    expect(resolution.variantId).toBeNull();
    expect(resolution.styleId).toBe(defaultStyleId);
    expect(resolution.guidance).toBe("guidance-only");
  });

  it("a scene override wins over a project variant", async () => {
    await createVariant(projectRoot, { styleId: brightStyleId, scope: "project" });
    await setSceneStyleOverride(projectRoot, { sceneId, styleId: moodyStyleId });
    const resolution = await resolveSceneStyle(projectRoot, { sceneId });
    expect(resolution.styleId).toBe(moodyStyleId);
    expect(resolution.scope).toBe("scene");
    expect(resolution.guidance).toBe("guidance-only");
  });

  it("a contested scene resolves to the same winner every time", async () => {
    await setSceneStyleOverride(projectRoot, { sceneId, styleId: brightStyleId, priority: 9 });
    await setSceneStyleOverride(projectRoot, { sceneId, styleId: moodyStyleId, priority: 1 });
    const first = await resolveSceneStyle(projectRoot, { sceneId });
    const second = await resolveSceneStyle(projectRoot, { sceneId });
    expect(first.styleId).toBe(moodyStyleId);
    expect(second.styleId).toBe(first.styleId);
    expect(second.variantId).toBe(first.variantId);
  });

  it("set, list, and clear round-trip; non-scene variants cannot be cleared", async () => {
    const created = await setSceneStyleOverride(projectRoot, { sceneId, styleId: moodyStyleId });
    expect(await listSceneOverrides(projectRoot, sceneId)).toHaveLength(1);
    expect((await listSceneOverrides(projectRoot, sceneId))[0].styleId).toBe(moodyStyleId);
    const projectVariant = await createVariant(projectRoot, { styleId: brightStyleId, scope: "project" });
    await expect(clearSceneStyleOverride(projectRoot, projectVariant.variantId)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await clearSceneStyleOverride(projectRoot, created.variantId);
    expect(await listSceneOverrides(projectRoot, sceneId)).toHaveLength(0);
    // With the scene override gone, the project variant wins again.
    const resolution = await resolveSceneStyle(projectRoot, { sceneId });
    expect(resolution.styleId).toBe(brightStyleId);
  });

  it("unknown scenes and styles reject with typed errors", async () => {
    await expect(resolveSceneStyle(projectRoot, { sceneId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setSceneStyleOverride(projectRoot, { sceneId: "missing", styleId: moodyStyleId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setSceneStyleOverride(projectRoot, { sceneId, styleId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
