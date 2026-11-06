// S8.13 Traceability tests.
//
// Proves the spec acceptance: each placed panel identifies its
// source scene + versions; pages with no artwork slot are
// flagged, never broken.
//
// - getPlacementTrace resolves a placement to its source
//   panel, scene purpose, and character versions.
// - getPageTrace groups traces in reading order; empty
//   pages flag EMPTY_PAGE and still render SVG.
// - Layout details carry trace links; typed rejections
//   for unknown ids.
//
// Imported from the built `out/node/core/project/traceability.js`
// and `out/node/core/project/layout-board.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const tracePath = path.join(root, "out/node/core/project/traceability.js");
const boardPath = path.join(root, "out/node/core/project/layout-board.js");
if (!fs.existsSync(tracePath)) {
  throw new Error("Missing out/node/core/project/traceability.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const pagesPath = path.join(root, "out/node/core/project/pages.js");
const placementsPath = path.join(root, "out/node/core/project/placements.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const artworkApprovalPath = path.join(root, "out/node/core/project/artwork-approval.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createPage } = require(pagesPath);
const { placePanel } = require(placementsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { setApproval } = require(approvalPath);
const { assignCharacter } = require(assignmentsPath);
const { setArtworkApproval } = require(artworkApprovalPath);
const { importAsset } = require(registryPath);
const { getPlacementTrace, getPageTrace } = require(tracePath);
const { getLayoutPage, listLayoutBoard } = require(boardPath);

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

let projectRoot;
let manuscriptId;
let pageId;
let panelId;
let sceneId;
let placementId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  manuscriptId = record.manuscriptId;
  const scene = await createScene(projectRoot, { manuscriptId, narrativePurpose: "Robby leaves the tavern" });
  sceneId = scene.sceneId;
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  const character = await createCharacter(projectRoot, { name: "Robby" });
  const version = await createVersion(projectRoot, { characterId: character.characterId, label: "Robert, age 7" });
  await setApproval(projectRoot, version.versionId, "approved", "fixture approval");
  await assignCharacter(projectRoot, panelId, character.characterId, version.versionId);
  pageId = (await createPage(projectRoot, { manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  fs.writeFileSync(path.join(assetScratch, "art.png"), "approved-artwork-bytes");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: path.join(assetScratch, "art.png"),
    assetType: "artwork",
    destinationRelative: "artwork/generated/t.png",
  });
  const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
  placementId = (await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 })).placementId;
});

describe("S8.13 traceability", () => {
  it("each placed panel identifies its source scene + versions", async () => {
    const trace = await getPlacementTrace(projectRoot, placementId);
    expect(trace.placementId).toBe(placementId);
    expect(trace.panelId).toBe(panelId);
    expect(trace.sceneId).toBe(sceneId);
    expect(trace.scenePurpose).toBe("Robby leaves the tavern");
    expect(trace.assignments).toHaveLength(1);
    expect(trace.assignments[0].characterName).toBe("Robby");
    expect(trace.assignments[0].versionLabel).toBe("Robert, age 7");
    expect(trace.flags).toEqual([]);
  });

  it("empty pages are flagged, never broken; layout details carry traces", async () => {
    const emptyPage = (await createPage(projectRoot, { manuscriptId, title: "Empty", format: "webtoon", width: 120, height: 200, margin: 5 })).pageId;
    const pageTrace = await getPageTrace(projectRoot, emptyPage);
    expect(pageTrace.hasArtwork).toBe(false);
    expect(pageTrace.flags).toContain("EMPTY_PAGE");
    expect(pageTrace.placements).toEqual([]);
    // Still renders: layout details succeed with SVG and flags.
    const emptyDetails = await getLayoutPage(projectRoot, emptyPage);
    expect(emptyDetails.placements).toEqual([]);
    expect(emptyDetails.flags).toContain("EMPTY_PAGE");
    expect(emptyDetails.svg).toContain("<svg");
    // Non-empty page trace groups in reading order.
    const fullTrace = await getPageTrace(projectRoot, pageId);
    expect(fullTrace.hasArtwork).toBe(true);
    expect(fullTrace.flags).toEqual([]);
    expect(fullTrace.placements).toHaveLength(1);
    expect(fullTrace.placements[0].panelId).toBe(panelId);
    const details = await getLayoutPage(projectRoot, pageId);
    expect(details.placements[0].trace.panelId).toBe(panelId);
    expect(details.placements[0].trace.scenePurpose).toBe("Robby leaves the tavern");
    // Board flags the empty page by id.
    const board = await listLayoutBoard(projectRoot);
    const flagged = board.pages.find((p) => p.pageId === emptyPage);
    expect(flagged.flag).toBe("EMPTY_PAGE");
    const good = board.pages.find((p) => p.pageId === pageId);
    expect(good.flag).toBeNull();
  });

  it("unknown ids reject typed", async () => {
    await expect(getPlacementTrace(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPlacementTrace(projectRoot, "")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(getPageTrace(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getPageTrace(projectRoot, "")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });
});
