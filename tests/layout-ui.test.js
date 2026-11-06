// S8.12 Layout UI tests.
//
// Proves the spec acceptance: a page edits fully without opening
// the filesystem; artwork hashes unchanged.
//
// - listLayoutBoard aggregates pages across manuscripts.
// - getLayoutPage returns reading order + borders +
//   balloons/lettering + SFX + deterministic SVG.
// - IPC dispatch: layout channels validate args, preserve
//   core typed codes, and round-trip edits end-to-end.
// - The built renderer contains the layout view and its
//   shortcut, with no export UI.
//
// Imported from the built `out/node/core/project/layout-board.js`
// plus the IPC registry with a mocked electron module.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const boardPath = path.join(root, "out/node/core/project/layout-board.js");
const registryPath = path.join(root, "out/node/core/ipc/registry.js");
const rendererPath = path.join(root, "out/web/renderer/index.js");
if (!fs.existsSync(boardPath)) {
  throw new Error("Missing out/node/core/project/layout-board.js — run 'npm run build' first");
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
const pagesPath = path.join(root, "out/node/core/project/pages.js");
const placementsPath = path.join(root, "out/node/core/project/placements.js");
const balloonsPath = path.join(root, "out/node/core/project/balloons.js");
const sfxPath = path.join(root, "out/node/core/project/sfx.js");
const approvalPath = path.join(root, "out/node/core/project/artwork-approval.js");
const registryCorePath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createPage } = require(pagesPath);
const { placePanel } = require(placementsPath);
const { createBalloon } = require(balloonsPath);
const { createSfx } = require(sfxPath);
const { setArtworkApproval } = require(approvalPath);
const { importAsset } = require(registryCorePath);
const { listLayoutBoard, getLayoutPage } = require(boardPath);

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

function makeArtwork(projectRoot, panelId, assetId, versionNo) {
  const { openProjectDatabase } = require(metadataPath);
  const { db } = openProjectDatabase(projectRoot);
  try {
    const generationId = `gen-${versionNo}-${Math.random()}`;
    const artworkId = `art-${versionNo}-${Math.random()}`;
    db.prepare("INSERT INTO panel_generations (generation_id, panel_id, template_name, prompt, negative_prompt, conditioning, status, stage, error_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      generationId,
      panelId,
      "fixture",
      "p",
      "",
      "",
      "completed",
      "done",
      null,
      new Date().toISOString(),
      new Date().toISOString()
    );
    db.prepare("INSERT INTO panel_artwork (artwork_id, panel_id, generation_id, version_no, asset_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      artworkId,
      panelId,
      generationId,
      versionNo,
      assetId,
      new Date().toISOString()
    );
    return artworkId;
  } finally {
    db.close();
  }
}

function hashFile(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

let projectRoot;
let pageId;
let panelId;
let placementId;
let balloonId;
let artworkAbs;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  pageId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  fs.writeFileSync(path.join(assetScratch, "art.png"), "approved-artwork-bytes");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: path.join(assetScratch, "art.png"),
    assetType: "artwork",
    destinationRelative: "artwork/generated/ui.png",
  });
  const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
  artworkAbs = path.join(projectRoot, "artwork/generated/ui.png");
  placementId = (await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 })).placementId;
  balloonId = (await createBalloon(projectRoot, {
    placementId,
    kind: "speech",
    shape: "ellipse",
    x: 30,
    y: 30,
    width: 60,
    height: 25,
    tail: { x: 80, y: 90, visible: true },
  })).balloonId;
  await createSfx(projectRoot, { placementId, text: "BOOM", weight: "heavy", angle: -12, x: 80, y: 80, scale: 2 });
});

describe("S8.12 layout view model + IPC", () => {
  it("listLayoutBoard aggregates pages across manuscripts", async () => {
    const board = await listLayoutBoard(projectRoot);
    expect(board.pages).toHaveLength(1);
    expect(board.pages[0].pageId).toBe(pageId);
    expect(board.pages[0].title).toBe("Page 1");
  });

  it("getLayoutPage shows reading order, balloons, SFX, and SVG", async () => {
    const details = await getLayoutPage(projectRoot, pageId);
    expect(details.page.pageId).toBe(pageId);
    expect(details.placements).toHaveLength(1);
    expect(details.placements[0].placementId).toBe(placementId);
    expect(details.placements[0].readingIndex).toBe(0);
    expect(details.placements[0].balloons).toHaveLength(1);
    expect(details.placements[0].balloons[0].balloonId).toBe(balloonId);
    expect(details.placements[0].sfx).toHaveLength(1);
    expect(details.svg).toContain('href="artwork/generated/ui.png"');
    expect(details.svg).toContain("BOOM");
  });

  it("IPC: layout channels registered and validate args", async () => {
    handleCalls.length = 0;
    registerIpcHandlers();
    const layoutChannels = handleCalls.filter((c) => c.channel.startsWith("panelforge:layout."));
    expect(layoutChannels).toHaveLength(11);
    const listCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.layoutPages);
    expect(listCall).toBeDefined();
    expect((await listCall.handler({}, { args: {} })).code).toBe("INVALID_ARGUMENTS");
    const placeCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.layoutPlace);
    expect((await placeCall.handler({}, { args: { root: projectRoot, pageId, panelId, x: "20", y: 20, width: 40, height: 40 } })).code).toBe("INVALID_ARGUMENTS");
    const borderCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.layoutSetBorder);
    expect((await borderCall.handler({}, { args: { root: projectRoot, placementId, style: "wavy" } })).code).toBe("INVALID_ARGUMENTS");
  });

  it("IPC: full edit round-trip without touching artwork files", async () => {
    const before = hashFile(artworkAbs);
    handleCalls.length = 0;
    registerIpcHandlers();
    const updateCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.layoutUpdatePlacement);
    const moved = await updateCall.handler({}, { args: { root: projectRoot, placementId, x: 25, y: 25, width: 150, height: 90 } });
    expect(moved.ok).toBe(true);
    expect(moved.data.x).toBe(25);
    const letterCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.layoutSetLettering);
    const saved = await letterCall.handler({}, { args: { root: projectRoot, balloonId, text: "edited via IPC" } });
    expect(saved.ok).toBe(true);
    const detailsCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.layoutPage);
    const details = await detailsCall.handler({}, { args: { root: projectRoot, pageId } });
    expect(details.ok).toBe(true);
    expect(details.data.placements[0].x).toBe(25);
    expect(details.data.placements[0].balloons[0].text).toBe("edited via IPC");
    expect(details.data.svg).toContain("edited via IPC");
    const missing = await detailsCall.handler({}, { args: { root: projectRoot, pageId: "missing" } });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe("NOT_FOUND");
    expect(hashFile(artworkAbs)).toBe(before);
  });

  it("built renderer carries the layout view and no export UI", () => {
    const renderer = fs.readFileSync(rendererPath, "utf8");
    expect(renderer).toContain("layout");
    expect(renderer).toContain("Alt+5");
    expect(renderer).toContain("Load pages");
    expect(renderer).toContain("Save placement");
    expect(renderer).toContain("Save border");
    expect(renderer).toContain("Create balloon");
    expect(renderer).toContain("Save text");
    expect(renderer).toContain("Save SFX");
    expect(renderer).toContain("Move up");
    expect(renderer).toContain("Move down");
    // No export controls: no Export/Download buttons or labels.
    expect(renderer).not.toContain(">Export<");
    expect(renderer).not.toContain(">Download<");
    expect(renderer).not.toContain("Save SVG");
  });
});
