// S7.9 Outpainting tests.
//
// Proves the spec acceptance: extension params validate;
// outpaint results are distinct preserved versions.
//
// - Extension params validate (non-negative ints, at least
//   one side extends, envelope cap) and round-trip.
// - outpaintPanel extends the latest version into a NEW
//   version row (base row untouched), recording the
//   outpaint.
// - Missing extension/artwork reject typed; migration v46.
//
// Imported from the built `out/node/core/project/outpaint.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outpaintPath = path.join(root, "out/node/core/project/outpaint.js");
if (!fs.existsSync(outpaintPath)) {
  throw new Error("Missing out/node/core/project/outpaint.js — run 'npm run build' first");
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
const { setOutpaintExtension, getOutpaintExtension, outpaintPanel, OUTPAINT_ENVELOPE } = require(outpaintPath);
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

describe("S7.9 outpainting", () => {
  it("extension params validate and round-trip", async () => {
    await setOutpaintExtension(projectRoot, { panelId, extension: { left: 50, right: 50, top: 0, bottom: 0 } });
    expect(await getOutpaintExtension(projectRoot, panelId)).toEqual({ left: 50, right: 50, top: 0, bottom: 0 });
    await expect(setOutpaintExtension(projectRoot, { panelId, extension: { left: 0, right: 0, top: 0, bottom: 0 } })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(setOutpaintExtension(projectRoot, { panelId, extension: { left: -1, right: 0, top: 0, bottom: 0 } })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(setOutpaintExtension(projectRoot, { panelId: "missing", extension: { left: 1, right: 0, top: 0, bottom: 0 } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("outpaint adds a distinct preserved version; base untouched", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    const base = await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
    await setOutpaintExtension(projectRoot, { panelId, extension: { left: 50, right: 50, top: 25, bottom: 25 } });
    const result = await outpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
    expect(result.artwork.versionNo).toBe(2);
    expect(result.artwork.artworkId).not.toBe(base.artwork.artworkId);
    const versions = await listArtwork(projectRoot, panelId);
    expect(versions).toHaveLength(2);
    expect(versions[0].assetId).toBe(base.artwork.assetId);
  });

  it("envelope breach rejects; missing extension/artwork typed; migration v46", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    await expect(outpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
    await setOutpaintExtension(projectRoot, { panelId, extension: { left: OUTPAINT_ENVELOPE, right: 0, top: 0, bottom: 0 } });
    await expect(outpaintPanel(projectRoot, { panelId, templateName: "panel-ink", adapter })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(46);
    } finally {
      db.close();
    }
  });
});
