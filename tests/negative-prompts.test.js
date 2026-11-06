// S7.4 Negative prompt handling tests.
//
// Proves the spec acceptance: jobs store/use the intended
// negative string; overrides beat defaults.
//
// - Style default used when no job negative (source style);
//   canonical default when no explicit style; none → "".
// - Explicit job negative wins (including explicit empty,
//   recorded empty with source job).
// - Stored per panel verbatim; empty stays empty.
// - Unknown style/panel reject typed.
//
// Imported from the built `out/node/core/project/negative-prompts.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const negativesPath = path.join(root, "out/node/core/project/negative-prompts.js");
if (!fs.existsSync(negativesPath)) {
  throw new Error("Missing out/node/core/project/negative-prompts.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createStyle } = require(stylesPath);
const { resolveNegativePrompt, savePanelNegativePrompt, getPanelNegativePrompt, assembleNegativeForPanel } = require(negativesPath);

let projectRoot;
let panelId;
let styledId;
let plainId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  styledId = (await createStyle(projectRoot, { name: "Ink", negativePrompt: "blurry, extra fingers" })).styleId;
  plainId = (await createStyle(projectRoot, { name: "Plain" })).styleId;
});

describe("S7.4 negative prompt handling", () => {
  it("style default used; canonical default when no styleId; none is empty", async () => {
    const styled = await resolveNegativePrompt(projectRoot, { styleId: styledId });
    expect(styled).toEqual({ negative: "blurry, extra fingers", source: "style" });
    // styledId is the first style → canonical default.
    const canonical = await resolveNegativePrompt(projectRoot, {});
    expect(canonical.source).toBe("style");
    const plain = await resolveNegativePrompt(projectRoot, { styleId: plainId });
    expect(plain).toEqual({ negative: "", source: "none" });
  });

  it("job negatives override — including explicit empty", async () => {
    const overridden = await resolveNegativePrompt(projectRoot, { styleId: styledId, jobNegative: "no text overlay" });
    expect(overridden).toEqual({ negative: "no text overlay", source: "job" });
    const emptied = await resolveNegativePrompt(projectRoot, { styleId: styledId, jobNegative: "" });
    expect(emptied).toEqual({ negative: "", source: "job" });
  });

  it("stored verbatim per panel; empty stays empty", async () => {
    const saved = await assembleNegativeForPanel(projectRoot, { panelId, styleId: styledId });
    expect(saved.negative).toBe("blurry, extra fingers");
    expect((await getPanelNegativePrompt(projectRoot, panelId)).negative).toBe("blurry, extra fingers");
    await savePanelNegativePrompt(projectRoot, { panelId, negative: "", source: "job" });
    const stored = await getPanelNegativePrompt(projectRoot, panelId);
    expect(stored.negative).toBe("");
    expect(stored.source).toBe("job");
  });

  it("unknown styles and panels reject typed; migration v41 present", async () => {
    await expect(resolveNegativePrompt(projectRoot, { styleId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(savePanelNegativePrompt(projectRoot, { panelId: "missing", negative: "x", source: "job" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(41);
    } finally {
      db.close();
    }
  });
});
