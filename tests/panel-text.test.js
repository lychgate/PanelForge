// S6.7 Dialogue, captions, actions, expressions tests.
//
// Proves the spec acceptance: panels carry editable dialogue/
// captions; empty panels remain valid.
//
// - setText records all four blocks; empty input yields "" fields.
// - get round-trips; null when unset; setting again replaces.
// - unknown panels reject typed; non-string blocks reject.
//
// Imported from the built `out/node/core/project/panel-text.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const textPath = path.join(root, "out/node/core/project/panel-text.js");
if (!fs.existsSync(textPath)) {
  throw new Error("Missing out/node/core/project/panel-text.js — run 'npm run build' first");
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
const { setText, getText } = require(textPath);

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

describe("S6.7 dialogue, captions, actions, expressions", () => {
  it("records all four blocks; empty panels stay valid", async () => {
    const text = await setText(projectRoot, panelId, {
      dialogue: "Robby: We go now.\nARKNAD: Not yet.",
      captions: "The tavern falls quiet.",
      actions: "Robby stands.",
      expressions: "Robby fearless; ARKNAD wary",
    });
    expect(text.dialogue).toContain("Robby: We go now.");
    expect(text.captions).toBe("The tavern falls quiet.");
    expect(text.actions).toBe("Robby stands.");
    expect(text.expressions).toBe("Robby fearless; ARKNAD wary");
    expect(await getText(projectRoot, panelId)).toMatchObject({ captions: "The tavern falls quiet." });
    expect(await getText(projectRoot, emptyPanelId)).toBeNull();
  });

  it("setting again replaces the whole block", async () => {
    const first = await setText(projectRoot, panelId, { dialogue: "old" });
    const second = await setText(projectRoot, panelId, { dialogue: "new" });
    expect(second.textId).not.toBe(first.textId);
    expect((await getText(projectRoot, panelId)).dialogue).toBe("new");
    expect((await getText(projectRoot, panelId)).captions).toBe("");
  });

  it("unknown panels and non-string blocks reject with typed errors", async () => {
    await expect(setText(projectRoot, "missing", { dialogue: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setText(projectRoot, panelId, { dialogue: 5 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("migration v35 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(35);
    } finally {
      db.close();
    }
  });
});
