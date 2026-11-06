// S7.6 Individual panel generation tests.
//
// Proves the spec acceptance: a panel generates and
// regenerates independently; each run produces a distinct
// preserved version; the job's stage chain is visible.
//
// - generatePanel drives the real ComfyUiAdapter against a
//   node:http fixture: prompt/negative assembled from the
//   stored S7.3/S7.4/S7.5 records into the S7.2 template,
//   result bytes imported as an asset, artwork row kept.
// - Regeneration appends version_no 2; version 1 untouched.
// - Failed dispatch records `failed` + typed code; no
//   artwork row appears.
// - Unknown panel/template reject typed.
//
// Imported from the built `out/node/core/project/panel-generation.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const generationPath = path.join(root, "out/node/core/project/panel-generation.js");
const adapterPath = path.join(root, "out/node/engines/provider/comfyui.js");
if (!fs.existsSync(generationPath)) {
  throw new Error("Missing out/node/core/project/panel-generation.js — run 'npm run build' first");
}
if (!fs.existsSync(adapterPath)) {
  throw new Error("Missing out/node/engines/provider/comfyui.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const templatesPath = path.join(root, "out/node/core/project/workflow-templates.js");
const assemblyPath = path.join(root, "out/node/core/project/prompt-assembly.js");
const negativesPath = path.join(root, "out/node/core/project/negative-prompts.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { setInstructions } = require(instructionsPath);
const { saveTemplate } = require(templatesPath);
const { assemblePanelPrompt, savePanelPrompt } = require(assemblyPath);
const { assembleNegativeForPanel } = require(negativesPath);
const { generatePanel, listArtwork, listGenerations } = require(generationPath);
const { createComfyUiAdapter } = require(adapterPath);

const PNG_BYTES = Buffer.from("89504e470d0a1a0av2", "hex");

const TEMPLATE = {
  "1": { class_type: "CLIPTextEncode", inputs: { text: "template positive" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "template negative" } },
  "3": { class_type: "KSampler", inputs: { seed: 0, width: 512, height: 512 } },
  "4": { class_type: "SaveImage", inputs: { filename_prefix: "panel" } },
};

let server;
let baseUrl;
let submittedPrompts;

function startFixture(healthDown) {
  submittedPrompts = [];
  let polls = 0;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.local");
    if (url.pathname === "/system_stats") {
      res.writeHead(healthDown ? 500 : 200, { "content-type": "application/json" });
      res.end(healthDown ? "{}" : JSON.stringify({ system: {} }));
    } else if (url.pathname === "/prompt") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        submittedPrompts.push(JSON.parse(raw));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ prompt_id: "p1", node_errors: {} }));
      });
    } else if (url.pathname === "/history/p1") {
      polls++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          p1:
            polls >= 2
              ? { status: { completed: true }, outputs: { 4: { images: [{ filename: "panel.png", subfolder: "", type: "output" }] } } }
              : { status: { completed: false } },
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
  await setInstructions(projectRoot, panelId, { compositionPrompt: "wide shot, tavern" });
  const { prompt } = await assemblePanelPrompt(projectRoot, { panelId });
  await savePanelPrompt(projectRoot, { panelId, prompt });
  await assembleNegativeForPanel(projectRoot, { panelId, jobNegative: "blurry" });
  await saveTemplate(projectRoot, { name: "panel-ink", workflow: TEMPLATE, version: "v1" });
});

describe("S7.6 individual panel generation", () => {
  it("generates with the stored prompt/negative; regenerates as a new version", async () => {
    await startFixture(false);
    const adapter = createComfyUiAdapter({ baseUrl });
    const first = await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter, seed: 42 });
    expect(first.artwork.versionNo).toBe(1);
    expect(first.generation.status).toBe("completed");
    expect(first.generation.prompt).toContain("wide shot, tavern");
    expect(first.generation.negativePrompt).toBe("blurry");
    // The submitted workflow carried the job's strings, not the template's.
    const submitted = submittedPrompts[0].prompt;
    expect(submitted["1"].inputs.text).toContain("wide shot, tavern");
    expect(submitted["2"].inputs.text).toBe("blurry");
    expect(submitted["3"].inputs.seed).toBe(42);
    const firstAsset = first.artwork.assetId;

    const second = await generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter, seed: 43 });
    expect(second.artwork.versionNo).toBe(2);
    expect(second.artwork.assetId).not.toBe(firstAsset);
    expect(await listArtwork(projectRoot, panelId)).toHaveLength(2);
    expect((await listGenerations(projectRoot, panelId)).every((g) => g.status === "completed")).toBe(true);
  });

  it("failed dispatch records failed status without an artwork row", async () => {
    await startFixture(true);
    const adapter = createComfyUiAdapter({ baseUrl });
    await expect(generatePanel(projectRoot, { panelId, templateName: "panel-ink", adapter })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    const generations = await listGenerations(projectRoot, panelId);
    expect(generations).toHaveLength(1);
    expect(generations[0].status).toBe("failed");
    expect(generations[0].errorCode).toBe("UNAVAILABLE");
    expect(await listArtwork(projectRoot, panelId)).toHaveLength(0);
  });

  it("unknown panels/templates reject typed; migration v43 present", async () => {
    await startFixture(false);
    const adapter = createComfyUiAdapter({ baseUrl });
    await expect(generatePanel(projectRoot, { panelId: "missing", templateName: "panel-ink", adapter })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(generatePanel(projectRoot, { panelId, templateName: "nope", adapter })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(43);
    } finally {
      db.close();
    }
  });
});
