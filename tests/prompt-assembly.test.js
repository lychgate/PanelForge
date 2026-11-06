// S7.3 Prompt assembly tests.
//
// Proves the spec acceptance: same brief + same template =
// same prompt; LLM hook off → byte-identical template
// output; prompted jobs store the exact string.
//
// - Assembled prompt contains instructions + style fields +
//   reference tags in deterministic order; two calls give
//   byte-identical output.
// - No adapter → deterministic (polished false); adapter
//   success → polished text; adapter failure/empty →
//   deterministic fallback (never a failure).
// - save/get stores the exact string per panel; unknown
//   panels/instructions/styles reject typed.
//
// Imported from the built `out/node/core/project/prompt-assembly.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const assemblyPath = path.join(root, "out/node/core/project/prompt-assembly.js");
if (!fs.existsSync(assemblyPath)) {
  throw new Error("Missing out/node/core/project/prompt-assembly.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createStyle } = require(stylesPath);
const { setInstructions } = require(instructionsPath);
const { assemblePanelPrompt, savePanelPrompt, getPanelPrompt } = require(assemblyPath);

function fakeLlmAdapter(behavior) {
  return {
    id: "mock",
    displayName: "Mock LLM",
    async health() {
      return { status: "ready", checkedAt: new Date().toISOString() };
    },
    interrupt() {},
    async execute(request) {
      if (behavior === "fail") return { ok: false, code: "UNAVAILABLE", message: "down" };
      if (behavior === "empty") return { ok: true, output: { content: "   " } };
      const user = request.params.messages[1].content;
      return { ok: true, output: { content: `polished: ${user}` } };
    },
  };
}

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
  await setInstructions(projectRoot, panelId, {
    compositionPrompt: "wide shot, tavern",
    backgroundDetail: "rain on windows",
    artDirectionNotes: "ink wash",
  });
  styleId = (await createStyle(projectRoot, { name: "Ink", lighting: "soft daylight", palette: undefined })).styleId;
});

describe("S7.3 prompt assembly", () => {
  it("deterministic: same brief + same inputs = byte-identical prompt", async () => {
    const first = await assemblePanelPrompt(projectRoot, { panelId, styleId, referenceTags: ["ref:char:abc"] });
    const second = await assemblePanelPrompt(projectRoot, { panelId, styleId, referenceTags: ["ref:char:abc"] });
    expect(first.prompt).toBe(second.prompt);
    expect(first.prompt).toContain("wide shot, tavern");
    expect(first.prompt).toContain("rain on windows");
    expect(first.prompt).toContain("ink wash");
    expect(first.prompt).toContain("lighting: soft daylight");
    expect(first.prompt).toContain("reference: ref:char:abc");
    expect(first.polished).toBe(false);
  });

  it("LLM polish assists; failures fall back to deterministic", async () => {
    const deterministic = await assemblePanelPrompt(projectRoot, { panelId });
    const polished = await assemblePanelPrompt(projectRoot, { panelId, llmAdapter: fakeLlmAdapter("ok") });
    expect(polished.polished).toBe(true);
    expect(polished.prompt.startsWith("polished: ")).toBe(true);

    const failed = await assemblePanelPrompt(projectRoot, { panelId, llmAdapter: fakeLlmAdapter("fail") });
    expect(failed.prompt).toBe(deterministic.prompt);
    expect(failed.polished).toBe(false);

    const empty = await assemblePanelPrompt(projectRoot, { panelId, llmAdapter: fakeLlmAdapter("empty") });
    expect(empty.prompt).toBe(deterministic.prompt);
  });

  it("stored prompts are exact strings per panel", async () => {
    const { prompt } = await assemblePanelPrompt(projectRoot, { panelId, styleId });
    const saved = await savePanelPrompt(projectRoot, { panelId, prompt, styleId });
    expect(saved.prompt).toBe(prompt);
    expect((await getPanelPrompt(projectRoot, panelId)).prompt).toBe(prompt);
    await expect(savePanelPrompt(projectRoot, { panelId: "missing", prompt: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assemblePanelPrompt(projectRoot, { panelId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assemblePanelPrompt(projectRoot, { panelId, styleId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("migration v40 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(40);
    } finally {
      db.close();
    }
  });
});
