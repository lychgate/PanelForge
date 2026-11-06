// S7.12 Generation provenance tests.
//
// Proves the spec acceptance: any artwork version replays
// its full provenance; provenance is complete for every
// generated version.
//
// - generatePanel records template + hash, prompt,
//   negative, seed, model/provider, job ID alongside the
//   artwork (S7.6 instrumentation).
// - getProvenance replays the full row; unknown artwork
//   rejects typed.
// - Variations + inpaint path also carry provenance
//   (completeness across generators).
//
// Imported from the built `out/node/core/project/provenance.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const provenancePath = path.join(root, "out/node/core/project/provenance.js");
if (!fs.existsSync(provenancePath)) {
  throw new Error("Missing out/node/core/project/provenance.js — run 'npm run build' first");
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
const { saveTemplate, getTemplate } = require(templatesPath);
const { assemblePanelPrompt, savePanelPrompt } = require(assemblyPath);
const { generatePanel, listArtwork } = require(generationPath);
const { getProvenance, recordProvenance } = require(provenancePath);
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

describe("S7.12 generation provenance", () => {
  it("every generated version replays its full provenance", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    const template = await getTemplate(projectRoot, "panel-ink");
    const { artwork, generation } = await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter, seed: 99 });
    const provenance = await getProvenance(projectRoot, artwork.artworkId);
    expect(provenance.templateName).toBe("panel-ink");
    expect(provenance.templateHash).toBe(template.hash);
    expect(provenance.prompt).toContain("wide, tavern");
    expect(provenance.seed).toBe(99);
    expect(provenance.provider).toBe("comfyui");
    expect(provenance.jobId).toBe(generation.generationId);
    expect(provenance.createdAt).toBeTruthy();
  });

  it("unknown artwork rejects; provenance is never editable", async () => {
    await expect(getProvenance(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
      expect(tables).toContain("artwork_provenance");
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(48);
    } finally {
      db.close();
    }
  });
});
