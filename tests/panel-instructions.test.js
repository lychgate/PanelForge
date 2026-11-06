// S6.9 Panel instructions tests.
//
// Proves the spec acceptance: panels carry instruction text;
// malformed input rejects with typed errors.
//
// - setInstructions records all three blocks; empty input
//   yields "" fields.
// - get round-trips; null when unset; setting again replaces.
// - unknown panels and non-string blocks reject typed.
//
// Imported from the built `out/node/core/project/panel-instructions.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
if (!fs.existsSync(instructionsPath)) {
  throw new Error("Missing out/node/core/project/panel-instructions.js — run 'npm run build' first");
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
const { setInstructions, getInstructions } = require(instructionsPath);

let projectRoot;
let panelId;
let emptyPanelId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  emptyPanelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
});

describe("S6.9 panel instructions", () => {
  it("records all three blocks; empty panels stay unset", async () => {
    const instructions = await setInstructions(projectRoot, panelId, {
      compositionPrompt: "wide shot, Robby foreground left, tavern behind",
      backgroundDetail: "rain-streaked windows, hearth glow",
      artDirectionNotes: "ink wash, muted palette, rim light",
    });
    expect(instructions.compositionPrompt).toContain("wide shot");
    expect(instructions.backgroundDetail).toBe("rain-streaked windows, hearth glow");
    expect(instructions.artDirectionNotes).toContain("ink wash");
    expect(await getInstructions(projectRoot, panelId)).toMatchObject({ compositionPrompt: "wide shot, Robby foreground left, tavern behind" });
    expect(await getInstructions(projectRoot, emptyPanelId)).toBeNull();
  });

  it("setting again replaces the whole block", async () => {
    const first = await setInstructions(projectRoot, panelId, { compositionPrompt: "old" });
    const second = await setInstructions(projectRoot, panelId, { compositionPrompt: "new" });
    expect(second.instructionId).not.toBe(first.instructionId);
    expect((await getInstructions(projectRoot, panelId)).compositionPrompt).toBe("new");
    expect((await getInstructions(projectRoot, panelId)).backgroundDetail).toBe("");
  });

  it("unknown panels and non-string blocks reject with typed errors", async () => {
    await expect(setInstructions(projectRoot, "missing", { compositionPrompt: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setInstructions(projectRoot, panelId, { compositionPrompt: 5 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("migration v36 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(36);
    } finally {
      db.close();
    }
  });
});
