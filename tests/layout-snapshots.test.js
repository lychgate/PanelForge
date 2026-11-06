// S8.10 Layout snapshots tests.
//
// Proves the spec acceptance: layout dump before
// snapshot equals dump after restore; branched edits
// leave the parent intact.
//
// - Snapshot copies pages + placements + borders +
//   balloons + SFX + reading order; live dump before
//   snapshot equals live dump after restore
//   (byte-identical).
// - Branch lineage: parent's contents unchanged after
//   child edits.
// - Unknown snapshot/parent ids reject typed;
//   migration v57.
//
// Imported from the built `out/node/core/project/layout-snapshots.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const layoutSnapshotsPath = path.join(root, "out/node/core/project/layout-snapshots.js");
if (!fs.existsSync(layoutSnapshotsPath)) {
  throw new Error("Missing out/node/core/project/layout-snapshots.js — run 'npm run build' first");
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
const registryPath = path.join(root, "out/node/core/project/registry.js");
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
const { importAsset } = require(registryPath);
const { createLayoutSnapshot, listLayoutSnapshots, getLayoutSnapshot, restoreLayoutSnapshot } = require(layoutSnapshotsPath);

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

const LAYOUT_TABLES = ["pages", "page_panels", "placement_borders", "balloons", "sfx", "reading_order"];

function dumpLayout(projectRoot) {
  const { openProjectDatabase } = require(metadataPath);
  const { db } = openProjectDatabase(projectRoot);
  try {
    const dump = {};
    for (const table of LAYOUT_TABLES) {
      dump[table] = db.prepare(`SELECT * FROM ${table}`).all().map((row) => JSON.stringify(row)).sort();
    }
    return JSON.stringify(dump);
  } finally {
    db.close();
  }
}

let projectRoot;
let pageId;
let placementId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  const panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  pageId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  fs.writeFileSync(path.join(assetScratch, "art.png"), "approved-artwork-bytes");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: path.join(assetScratch, "art.png"),
    assetType: "artwork",
    destinationRelative: "artwork/generated/s.png",
  });
  const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
  placementId = (await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 })).placementId;
  await createBalloon(projectRoot, { placementId, kind: "speech", shape: "ellipse", x: 30, y: 30, width: 60, height: 25, tail: { x: 80, y: 90, visible: true } });
  await createSfx(projectRoot, { placementId, text: "BOOM", weight: "heavy", angle: -12, x: 80, y: 80, scale: 2 });
});

describe("S8.10 layout snapshots", () => {
  it("snapshot preserves exactly; restore is byte-identical", async () => {
    const before = dumpLayout(projectRoot);
    const snapshot = await createLayoutSnapshot(projectRoot, { name: "layout-1" });
    expect(snapshot.pageCount).toBe(1);
    expect(snapshot.parentSnapshotId).toBeNull();
    const contents = await getLayoutSnapshot(projectRoot, snapshot.snapshotId);
    expect(contents.placements).toHaveLength(1);
    expect(contents.balloons).toHaveLength(1);
    expect(contents.sfx).toHaveLength(1);

    // Mutate live layout.
    const { updateSfx } = require(sfxPath);
    await updateSfx(projectRoot, contents.sfx[0].sfx_id, { text: "CHANGED" });
    expect(dumpLayout(projectRoot)).not.toBe(before);

    const restored = await restoreLayoutSnapshot(projectRoot, snapshot.snapshotId);
    expect(restored.snapshotId).toBe(snapshot.snapshotId);
    expect(dumpLayout(projectRoot)).toBe(before);
  });

  it("branch lineage leaves the parent intact", async () => {
    const parent = await createLayoutSnapshot(projectRoot, { name: "parent" });
    const before = (await getLayoutSnapshot(projectRoot, parent.snapshotId)).sfx;
    const child = await createLayoutSnapshot(projectRoot, { name: "branch", parentSnapshotId: parent.snapshotId });
    expect(child.parentSnapshotId).toBe(parent.snapshotId);
    const { listLayoutSnapshots } = require(layoutSnapshotsPath);
    expect((await listLayoutSnapshots(projectRoot)).some((s) => s.parentSnapshotId === parent.snapshotId)).toBe(true);
    const { updateSfx } = require(sfxPath);
    await updateSfx(projectRoot, before[0].sfx_id, { text: "branch edit" });
    expect((await getLayoutSnapshot(projectRoot, parent.snapshotId)).sfx[0].text).toBe("BOOM");
  });

  it("unknown snapshot/parent ids reject; migration v57", async () => {
    await expect(restoreLayoutSnapshot(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createLayoutSnapshot(projectRoot, { parentSnapshotId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(57);
    } finally {
      db.close();
    }
  });
});
