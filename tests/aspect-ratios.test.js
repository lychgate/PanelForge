// S7.10 Aspect ratio adjustment tests.
//
// Proves the spec acceptance: ratios validate against the
// style vocabulary; ratio changes produce new versions.
//
// - resolveAspect accepts vocabulary ratios and derives
//   area-preserving dims; outside-vocabulary and malformed
//   ratios reject typed.
// - adjustPanelAspect dispatches with the new dims into
//   the workflow and lands a NEW artwork version (the
//   previous version's asset is never resized).
// - Stored per panel; migration v47.
//
// Imported from the built `out/node/core/project/aspect-ratios.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const aspectPath = path.join(root, "out/node/core/project/aspect-ratios.js");
if (!fs.existsSync(aspectPath)) {
  throw new Error("Missing out/node/core/project/aspect-ratios.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const templatesPath = path.join(root, "out/node/core/project/workflow-templates.js");
const assemblyPath = path.join(root, "out/node/core/project/prompt-assembly.js");
const generationPath = path.join(root, "out/node/core/project/panel-generation.js");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
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
const { createStyle } = require(stylesPath);
const { resolveAspect, adjustPanelAspect, getPanelAspect } = require(aspectPath);
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
let submittedDims;

function startFixture() {
  submittedDims = [];
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.local");
    if (url.pathname === "/system_stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ system: {} }));
    } else if (url.pathname === "/prompt") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        const body = JSON.parse(raw);
        submittedDims.push({ width: body.prompt["3"].inputs.width, height: body.prompt["3"].inputs.height });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ prompt_id: "p1", node_errors: {} }));
      });
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
let styleId;

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
  styleId = (await createStyle(projectRoot, { name: "Ink", aspectRatios: ["1:1", "4:3", "3:4"] })).styleId;
});

describe("S7.10 aspect ratio adjustment", () => {
  it("vocabulary ratios resolve to area-preserving dims; others reject", async () => {
    const resolved = await resolveAspect(projectRoot, { styleId, aspect: "3:4", baseDims: { width: 512, height: 512 } });
    expect(resolved.dims).toEqual({ width: 443, height: 591 });
    await expect(resolveAspect(projectRoot, { styleId, aspect: "16:9" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(resolveAspect(projectRoot, { styleId, aspect: "not-a-ratio" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(resolveAspect(projectRoot, { styleId: "missing", aspect: "1:1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ratio changes dispatch new dims into a new version (no resize of approved work)", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    const first = await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter });
    const adjusted = await adjustPanelAspect(projectRoot, { panelId, aspect: "4:3", styleId, templateName: "panel-ink", adapter });
    expect(adjusted.aspect).toBe("4:3");
    expect(adjusted.artwork.versionNo).toBe(2);
    expect(adjusted.artwork.artworkId).not.toBe(first.artwork.artworkId);
    expect(submittedDims[1]).toEqual({ width: 591, height: 443 });
    expect(await getPanelAspect(projectRoot, panelId)).toBe("4:3");
    expect(await listArtwork(projectRoot, panelId)).toHaveLength(2);
  });

  it("migration v47 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(47);
    } finally {
      db.close();
    }
  });
});
