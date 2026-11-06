// S7.7 Variations tests.
//
// Proves the spec acceptance: one job yields N distinct
// preserved versions; each varies provenance independently.
//
// - generateVariations runs N sequential dispatches with
//   distinct seeds, each its own generation + artwork row,
//   sharing one job_id (listVariants order).
// - Count outside 1..8 rejects typed; nothing dispatched.
// - Migration v44 present.
//
// Imported from the built `out/node/core/project/variations.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const variationsPath = path.join(root, "out/node/core/project/variations.js");
const generationPath = path.join(root, "out/node/core/project/panel-generation.js");
const adapterPath = path.join(root, "out/node/engines/provider/comfyui.js");
if (!fs.existsSync(variationsPath)) {
  throw new Error("Missing out/node/core/project/variations.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const templatesPath = path.join(root, "out/node/core/project/workflow-templates.js");
const assemblyPath = path.join(root, "out/node/core/project/prompt-assembly.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { setInstructions } = require(instructionsPath);
const { saveTemplate } = require(templatesPath);
const { assemblePanelPrompt, savePanelPrompt } = require(assemblyPath);
const { generateVariations, listVariants, MAX_VARIANTS } = require(variationsPath);
const { listGenerations } = require(generationPath);
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
let submittedSeeds;

function startFixture() {
  submittedSeeds = [];
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
        submittedSeeds.push(body.prompt["3"].inputs.seed);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ prompt_id: `p${submittedSeeds.length}`, node_errors: {} }));
      });
    } else if (url.pathname.startsWith("/history/")) {
      const promptId = decodeURIComponent(url.pathname.slice("/history/".length));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          [promptId]: { status: { completed: true }, outputs: { 4: { images: [{ filename: "panel.png", subfolder: "", type: "output" }] } } },
        })
      );
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

describe("S7.7 variations", () => {
  it("one job yields N distinct preserved versions with independent provenance", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    const result = await generateVariations(projectRoot, { panelId, templateName: "panel-ink", count: 3, adapter, seed: 10 });
    expect(result.variants).toHaveLength(3);
    expect(result.variants.map((v) => v.versionNo)).toEqual([1, 2, 3]);
    expect(new Set(result.variants.map((v) => v.assetId)).size).toBe(3);
    expect(new Set(result.variants.map((v) => v.generationId)).size).toBe(3);
    expect(submittedSeeds).toEqual([10, 11, 12]);
    const listed = await listVariants(projectRoot, result.jobId);
    expect(listed.map((v) => v.artworkId)).toEqual(result.variants.map((v) => v.artworkId));
    expect((await listGenerations(projectRoot, panelId)).every((g) => g.status === "completed")).toBe(true);
  });

  it("out-of-range counts reject typed and dispatch nothing", async () => {
    await startFixture();
    const adapter = createComfyUiAdapter({ baseUrl });
    await expect(generateVariations(projectRoot, { panelId, templateName: "panel-ink", count: 0, adapter })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(generateVariations(projectRoot, { panelId, templateName: "panel-ink", count: MAX_VARIANTS + 1, adapter })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    expect(submittedSeeds).toEqual([]);
  });

  it("migration v44 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(44);
    } finally {
      db.close();
    }
  });
});
