// S6.5 Camera and shot definitions tests.
//
// Proves the spec acceptance: panels carry camera/shot; unknown
// shot types reject.
//
// - setCamera records shot type + free-text angle; setting again
//   replaces; unknown panels reject.
// - unknown shot types reject typed.
// - get round-trips; null when unset.
// - list-by-shot-type returns scene panels in order.
//
// Imported from the built `out/node/core/project/panel-cameras.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const camerasPath = path.join(root, "out/node/core/project/panel-cameras.js");
if (!fs.existsSync(camerasPath)) {
  throw new Error("Missing out/node/core/project/panel-cameras.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { setCamera, getCamera, listCamerasByShotType } = require(camerasPath);

let projectRoot;
let sceneId;
let p1;
let p2;
let p3;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  sceneId = scene.sceneId;
  p1 = (await createPanel(projectRoot, sceneId)).panelId;
  p2 = (await createPanel(projectRoot, sceneId)).panelId;
  p3 = (await createPanel(projectRoot, sceneId)).panelId;
});

describe("S6.5 camera and shot definitions", () => {
  it("records shot type + free-text angle per panel; setting again replaces", async () => {
    const cam = await setCamera(projectRoot, p1, "close-up", "low");
    expect(cam.shotType).toBe("close-up");
    expect(cam.angle).toBe("low");
    expect(cam.panelId).toBe(p1);
    expect(await getCamera(projectRoot, p1)).toMatchObject({ shotType: "close-up", angle: "low" });
    expect(await getCamera(projectRoot, p2)).toBeNull();
    const replaced = await setCamera(projectRoot, p1, "medium", "over-the-shoulder");
    expect(replaced.shotType).toBe("medium");
    expect(replaced.cameraId).not.toBe(cam.cameraId);
    expect((await getCamera(projectRoot, p1)).shotType).toBe("medium");
  });

  it("unknown shot types and panels reject with typed errors", async () => {
    await expect(setCamera(projectRoot, p1, "selfie")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setCamera(projectRoot, "missing", "wide")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listCamerasByShotType(projectRoot, sceneId, "selfie")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("list-by-shot-type returns scene panels in order", async () => {
    await setCamera(projectRoot, p1, "wide");
    await setCamera(projectRoot, p2, "close-up");
    await setCamera(projectRoot, p3, "wide", "high");
    expect((await listCamerasByShotType(projectRoot, sceneId, "wide")).map((c) => c.panelId)).toEqual([p1, p3]);
    expect((await listCamerasByShotType(projectRoot, sceneId, "close-up")).map((c) => c.panelId)).toEqual([p2]);
  });

  it("migration v33 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(33);
    } finally {
      db.close();
    }
  });
});
