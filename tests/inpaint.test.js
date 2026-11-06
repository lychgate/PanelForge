// S7.8 Inpainting tests.
//
// Proves the spec acceptance: coordinate regions validate
// (in-bounds, non-empty); repaints preserve pixels outside
// regions' versions via new rows.
//
// - set/get regions round-trips; empty/negative/zero-size
//   and out-of-canvas regions reject typed.
// - inpaintPanel repaints the latest version into a NEW
//   version row (base row untouched), recording the
//   repaint (base + regions + prompt).
// - Missing regions/artwork reject typed; migration v45.
//
// Imported from the built `out/node/core/project/inpaint.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const inpaintPath = path.join(root, "out/node/core/project/inpaint.js");
if (!fs.existsSync(inpaintPath)) {
  throw new Error("Missing out/node/core/project/inpaint.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const templatesPath = path.join(root, "out/node/core/project/workflow-templates.js");
const assemblyPath = path.join(root, "out/node/core/project/prompt-assembly.js");
const generationPath = path.join(root, "out/node/core/project/panel-generation.js");
const adapterPath = path.join(root, "out/node/engines/provider/comfyui.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { setInstructions } = require(instructionsPath);
const { saveTemplate } = require(templatesPath);
const { assemblePanelPrompt, savePanelPrompt } = require(assemblyPath);
const { generatePanel, listArtwork } = require(generationPath);
const { setInpaintRegions, getInpaintRegions, inpaintPanel } = require(inpaintPath);
const { createComfyUiAdapter } = require(adapterPath);

const PNG_BYTES = Buffer.from("89504e470d0a1a0av2", "hex");

const TEMPLATE = {
  "1": { class_type: "CLIPTextEncode", inputs: { text: "positive" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "negative" } },
  "3": { class_type: "KSampler", inputs: { seed: 0, width: 512, height: 512 } },
  "4": { class_type: "SaveImage", inputs: { filename_prefix: "panel" } },
};

let server;
let baseUrl;

function startFixture() {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.local");
    if (url.pathname === "/system_stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ system: {} }));
    } else if (url.pathname === "/prompt") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ prompt_id: "p1", node_errors: {} }));
    } else if (url.pathname === "/history/p1") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ p1: { status: { completed: true }, outputs: { 4: { images: [{ filename: "panel.png", subfolder: "", type: "output" }] } } } }));
    } else if (url.pathname === "/view") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG_BYTES);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
});

let projectRoot;
let panelId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  await setInstructions(projectRoot, panelId, { compositionPrompt: "wide, tavern" });
  const { prompt } = await assemblePanelPrompt(projectRoot, { panelId });
  await savePanelPrompt(projectRoot, { panelId, prompt });
  await saveTemplate(projectRoot, { name: "panel-ink", workflow: TEMPLATE, version: "v1" });
});

describe("S7.8 inpainting", () => {
  it("regions validate and round-trip; empty/negative reject; canvas bounds checked at repaint time", async () => {
    await setInpaintRegions(projectRoot, { panelId, regions: [{ x: 10, y: 10, width: 100, height: 80 }] });
    expect(await getInpaintRegions(projectRoot, panelId)).toEqual([{ x: 10, y: 10, width: 100, height: 80 }]);
    await expect(setInpaintRegions(projectRoot, { panelId, regions: [] })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setInpaintRegions(projectRoot, { panelId, regions: [{ x: 0, y: 0, width: 0, height: 10 }] })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setInpaintRegions(projectRoot, { panelId, regions: [{ x: -5, y: 0, width: 10, height: 10 }] })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setInpaintRegions(projectRoot, { panelId: "missing", regions: [{ x: 0, y: 0, width: 10, height: 10 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("repaint adds a new version; the base version row is untouched", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    const base = await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
    await setInpaintRegions(projectRoot, { panelId, regions: [{ x: 10, y: 10, width: 100, height: 80 }] });
    const result = await inpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
    expect(result.artwork.versionNo).toBe(2);
    expect(result.artwork.artworkId).not.toBe(base.artwork.artworkId);
    const versions = await listArtwork(projectRoot, panelId);
    expect(versions).toHaveLength(2);
    expect(versions[0].assetId).toBe(base.artwork.assetId);
  });

  it("out-of-canvas regions reject at repaint time", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
    await setInpaintRegions(projectRoot, { panelId, regions: [{ x: 400, y: 0, width: 200, height: 10 }] });
    await expect(inpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("missing regions or artwork reject typed; migration v45 present", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    await expect(inpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await setInpaintRegions(projectRoot, { panelId, regions: [{ x: 0, y: 0, width: 10, height: 10 }] });
    await expect(inpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(45);
    } finally {
      db.close();
    }
  });
});
