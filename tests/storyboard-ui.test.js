// S6.11 Minimal storyboard UI tests.
//
// Proves the spec acceptance: a storyboard edits fully without
// generating artwork; every panel shows source scene +
// character versions.
//
// - listBoard aggregates scenes + panels across manuscripts.
// - getPanelDetails shows source scene, character + version
//   labels, camera, dialogue, and instructions.
// - IPC dispatch: storyboard channels validate args, preserve
//   core typed codes, and round-trip an edit end-to-end.
// - The built renderer contains the storyboard view and its
//   shortcut, with no generation UI.
//
// Imported from the built `out/node/core/project/storyboard-board.js`
// plus the IPC registry with a mocked electron module.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const boardPath = path.join(root, "out/node/core/project/storyboard-board.js");
const registryPath = path.join(root, "out/node/core/ipc/registry.js");
const rendererPath = path.join(root, "out/web/renderer/index.js");
if (!fs.existsSync(boardPath)) {
  throw new Error("Missing out/node/core/project/storyboard-board.js — run 'npm run build' first");
}
if (!fs.existsSync(registryPath)) {
  throw new Error("Missing out/node/core/ipc/registry.js — run 'npm run build' first");
}
if (!fs.existsSync(rendererPath)) {
  throw new Error("Missing out/web/renderer/index.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const camerasPath = path.join(root, "out/node/core/project/panel-cameras.js");
const textPath = path.join(root, "out/node/core/project/panel-text.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { setApproval } = require(approvalPath);
const { assignCharacter } = require(assignmentsPath);
const { setCamera } = require(camerasPath);
const { setText } = require(textPath);
const { setInstructions } = require(instructionsPath);
const { listBoard, getPanelDetails } = require(boardPath);

// Mocked electron for the IPC registry (same pattern as tests/ipc.test.js).
const handleCalls = [];
const fakeElectron = {
  ipcMain: {
    handle: (channel, handler) => {
      handleCalls.push({ channel, handler });
    },
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};
let registry;
try {
  registry = require(registryPath);
} finally {
  Module._load = originalLoad;
}
const { IPC_CHANNELS, registerIpcHandlers } = registry;

let projectRoot;
let sceneId;
let panelId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId, narrativePurpose: "Robby leaves the tavern" });
  sceneId = scene.sceneId;
  panelId = (await createPanel(projectRoot, sceneId)).panelId;
  const character = await createCharacter(projectRoot, { name: "Robby" });
  const version = await createVersion(projectRoot, { characterId: character.characterId, label: "Robert, age 7" });
  await setApproval(projectRoot, version.versionId, "approved", "fixture approval");
  await assignCharacter(projectRoot, panelId, character.characterId, version.versionId);
  await setCamera(projectRoot, panelId, "wide", "low");
  await setText(projectRoot, panelId, { dialogue: "Robby: We go now." });
  await setInstructions(projectRoot, panelId, { compositionPrompt: "wide, tavern" });
});

describe("S6.11 storyboard view model + IPC", () => {
  it("listBoard aggregates scenes with panels", async () => {
    const board = await listBoard(projectRoot);
    expect(board.scenes).toHaveLength(1);
    expect(board.scenes[0].narrativePurpose).toBe("Robby leaves the tavern");
    expect(board.scenes[0].panels).toHaveLength(1);
    expect(board.scenes[0].panels[0].panelId).toBe(panelId);
  });

  it("getPanelDetails shows source scene, character versions, camera, dialogue, instructions", async () => {
    const details = await getPanelDetails(projectRoot, panelId);
    expect(details.scene.narrativePurpose).toBe("Robby leaves the tavern");
    expect(details.assignments).toHaveLength(1);
    expect(details.assignments[0].characterName).toBe("Robby");
    expect(details.assignments[0].versionLabel).toBe("Robert, age 7");
    expect(details.camera.shotType).toBe("wide");
    expect(details.text.dialogue).toBe("Robby: We go now.");
    expect(details.instructions.compositionPrompt).toBe("wide, tavern");
  });

  it("IPC: storyboard channels registered and validate args", async () => {
    handleCalls.length = 0;
    registerIpcHandlers();
    const storyboardChannels = handleCalls.filter((c) => c.channel.startsWith("panelforge:storyboard."));
    expect(storyboardChannels).toHaveLength(9);
    const listCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.storyboardList);
    expect(listCall).toBeDefined();
    expect((await listCall.handler({}, { args: {} })).code).toBe("INVALID_ARGUMENTS");
    const badCamera = handleCalls.find((c) => c.channel === IPC_CHANNELS.storyboardSetCamera);
    const bad = await badCamera.handler({}, { args: { root: projectRoot, panelId, shotType: "panoramic" } });
    expect(bad.code).toBe("INVALID_ARGUMENTS");
  });

  it("IPC: full edit round-trip without generation", async () => {
    handleCalls.length = 0;
    registerIpcHandlers();
    const setTextCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.storyboardSetText);
    const saved = await setTextCall.handler({}, { args: { root: projectRoot, panelId, dialogue: "edited via IPC" } });
    expect(saved.ok).toBe(true);
    const detailsCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.storyboardPanelDetails);
    const details = await detailsCall.handler({}, { args: { root: projectRoot, panelId } });
    expect(details.ok).toBe(true);
    expect(details.data.text.dialogue).toBe("edited via IPC");
    const missing = await detailsCall.handler({}, { args: { root: projectRoot, panelId: "missing" } });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe("NOT_FOUND");
  });

  it("built renderer carries the storyboard view and no generation UI", () => {
    const renderer = fs.readFileSync(rendererPath, "utf8");
    expect(renderer).toContain("storyboard");
    expect(renderer).toContain("Alt+4");
    expect(renderer).toContain("Save text");
    expect(renderer).toContain("Save camera");
    expect(renderer).toContain("Save instructions");
    expect(renderer).toContain("Create snapshot");
    // No generation controls: no Generate/ComfyUI buttons or labels.
    expect(renderer).not.toMatch(/textContent\s*=\s*"[^"]*(generate|comfyui)/i);
    expect(renderer).not.toContain('>Generate<');
  });
});
