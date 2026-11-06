// S8.9 Reading order tests.
//
// Proves the spec acceptance: reordered page reads panels
// in the new order (independent of placement z-order).
//
// - Unset order falls back to placement order.
// - setReadingOrder stores the explicit order; reads
//   back the same sequence.
// - moveInReadingOrder reorders one item without
//   touching placement geometry or z-order.
// - Foreign-page placement ids reject typed;
//   migration v56.
//
// Imported from the built `out/node/core/project/reading-order.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const orderPath = path.join(root, "out/node/core/project/reading-order.js");
if (!fs.existsSync(orderPath)) {
  throw new Error("Missing out/node/core/project/reading-order.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const pagesPath = path.join(root, "out/node/core/project/pages.js");
const placementsPath = path.join(root, "out/node/core/project/placements.js");
const approvalPath = path.join(root, "out/node/core/project/artwork-approval.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createPage } = require(pagesPath);
const { placePanel, getPlacement } = require(placementsPath);
const { setArtworkApproval } = require(approvalPath);
const { importAsset } = require(registryPath);
const { setReadingOrder, getReadingOrder, moveInReadingOrder } = require(orderPath);

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
let pageId;
let placementIds;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  pageId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  placementIds = [];
  for (let n = 1; n <= 3; n++) {
    const panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
    const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    fs.writeFileSync(path.join(assetScratch, `art${n}.png`), `bytes-${n}`);
    const asset = await importAsset(projectRoot, {
      sourceAbsolutePath: path.join(assetScratch, `art${n}.png`),
      assetType: "artwork",
      destinationRelative: `artwork/generated/r${n}.png`,
    });
    const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
    await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
    placementIds.push((await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20 + (n - 1) * 80, width: 160, height: 70 })).placementId);
  }
});

describe("S8.9 reading order", () => {
  it("unset falls back to placement order; explicit order reads back", async () => {
    expect((await getReadingOrder(projectRoot, pageId)).map((p) => p.placementId)).toEqual(placementIds);
    const reversed = [...placementIds].reverse();
    const stored = await setReadingOrder(projectRoot, { pageId, placementIds: reversed });
    expect(stored.map((p) => p.placementId)).toEqual(reversed);
    expect((await getReadingOrder(projectRoot, pageId)).map((p) => p.placementId)).toEqual(reversed);
  });

  it("move reorders one item without touching geometry or z-order", async () => {
    const geometryBefore = await getPlacement(projectRoot, placementIds[2]);
    const moved = await moveInReadingOrder(projectRoot, { pageId, placementId: placementIds[2], toIndex: 0 });
    expect(moved[0].placementId).toBe(placementIds[2]);
    const after = await getPlacement(projectRoot, placementIds[2]);
    expect(after.x).toBe(geometryBefore.x);
    expect(after.y).toBe(geometryBefore.y);
    expect(after.zOrder).toBe(geometryBefore.zOrder);
  });

  it("foreign-page ids reject typed; migration v56", async () => {
    await expect(setReadingOrder(projectRoot, { pageId, placementIds: ["missing"] })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(moveInReadingOrder(projectRoot, { pageId, placementId: "missing", toIndex: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(56);
    } finally {
      db.close();
    }
  });
});
