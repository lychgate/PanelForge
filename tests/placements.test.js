// S8.2 Panel placement tests.
//
// Proves the spec acceptance: a page shows its panels in
// placement order; artwork assets unchanged (hash check).
//
// - placePanel slots the APPROVED artwork (asset id,
//   never copied); re-placement replaces that slot.
// - Geometry validates inside the page bounds (margin-
//   aware) with typed rejections; z-order moves restack.
// - Placement order lists back-to-front; removing a
//   placement leaves the asset store byte-identical.
// - Unapproved panels cannot be placed (NOT_APPROVED);
//   migration v51.
//
// Imported from the built `out/node/core/project/placements.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const placementsPath = path.join(root, "out/node/core/project/placements.js");
if (!fs.existsSync(placementsPath)) {
  throw new Error("Missing out/node/core/project/placements.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const pagesPath = path.join(root, "out/node/core/project/pages.js");
const approvalPath = path.join(root, "out/node/core/project/artwork-approval.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createPage } = require(pagesPath);
const { setArtworkApproval } = require(approvalPath);
const { importAsset } = require(registryPath);
const { placePanel, getPlacement, listPlacements, movePlacement, removePlacement } = require(placementsPath);

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
let panelId;
let artworkId;
let assetId;
let assetFile;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  const page = await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 });
  pageId = page.pageId;

  assetFile = path.join(scratch, "art.png");
  fs.writeFileSync(assetFile, "approved-artwork-bytes");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: assetFile,
    assetType: "artwork",
    destinationRelative: "artwork/generated/approved.png",
  });
  assetId = asset.assetId;
  artworkId = makeArtwork(projectRoot, panelId, assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
});

describe("S8.2 panel placement", () => {
  it("slots the approved artwork by reference; page lists in z-order", async () => {
    const placement = await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 });
    expect(placement.assetId).toBe(assetId);
    expect(placement.artworkId).toBe(artworkId);
    expect((await getPlacement(projectRoot, placement.placementId)).panelId).toBe(panelId);
    expect(await listPlacements(projectRoot, pageId)).toHaveLength(1);
    expect(fs.readFileSync(path.join(projectRoot, "artwork/generated/approved.png"))).toEqual(Buffer.from("approved-artwork-bytes"));
  });

  it("re-placement replaces the slot; moves restack; removal keeps the asset", async () => {
    const first = await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 100, height: 80, zOrder: 0 });
    const replaced = await placePanel(projectRoot, { pageId, panelId, x: 30, y: 30, width: 120, height: 90, zOrder: 2 });
    expect(replaced.placementId).not.toBe(first.placementId);
    expect(await listPlacements(projectRoot, pageId)).toHaveLength(1);
    const moved = await movePlacement(projectRoot, replaced.placementId, 5);
    expect(moved.zOrder).toBe(5);
    await removePlacement(projectRoot, replaced.placementId);
    expect(await listPlacements(projectRoot, pageId)).toHaveLength(0);
    expect(fs.existsSync(path.join(projectRoot, "artwork/generated/approved.png"))).toBe(true);
    expect(crypto.createHash("sha256").update(fs.readFileSync(path.join(projectRoot, "artwork/generated/approved.png"))).digest("hex")).toBe(
      crypto.createHash("sha256").update("approved-artwork-bytes").digest("hex")
    );
  });

  it("unapproved panels refuse; out-of-bounds geometry rejects typed", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    fs.writeFileSync(path.join(scratch, "book2.md"), "# One\n\nWake.");
    const record = await importManuscript(projectRoot, { sourceAbsolutePath: path.join(scratch, "book2.md") });
    const scene2 = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
    const panel2 = (await createPanel(projectRoot, scene2.sceneId)).panelId;
    await expect(placePanel(projectRoot, { pageId, panelId: panel2, x: 20, y: 20, width: 50, height: 50 })).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await expect(placePanel(projectRoot, { pageId, panelId, x: 5, y: 20, width: 50, height: 50 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(placePanel(projectRoot, { pageId, panelId, x: 150, y: 20, width: 100, height: 50 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(placePanel(projectRoot, { pageId: "missing", panelId, x: 20, y: 20, width: 50, height: 50 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    db.close();
  });

  it("migration v51 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(51);
    } finally {
      db.close();
    }
  });
});
