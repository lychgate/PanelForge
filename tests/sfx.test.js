// S8.8 Sound effects tests.
//
// Proves the spec acceptance: SFX text/angle persist
// (and render via S8.11 SVG; records verified here).
//
// - create/get/list round-trips text, weight, angle,
//   x/y/scale.
// - update edits; delete removes; unknown ids reject.
// - Invalid text/weight/angle/scale and unknown
//   placements reject typed; migration v55.
//
// Imported from the built `out/node/core/project/sfx.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sfxPath = path.join(root, "out/node/core/project/sfx.js");
if (!fs.existsSync(sfxPath)) {
  throw new Error("Missing out/node/core/project/sfx.js — run 'npm run build' first");
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
const { placePanel } = require(placementsPath);
const { setArtworkApproval } = require(approvalPath);
const { importAsset } = require(registryPath);
const { createSfx, getSfx, listSfx, updateSfx, deleteSfx } = require(sfxPath);

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
  const pageId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  fs.writeFileSync(path.join(assetScratch, "art.png"), "approved-artwork-bytes");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: path.join(assetScratch, "art.png"),
    assetType: "artwork",
    destinationRelative: "artwork/generated/b.png",
  });
  const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
  placementId = (await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 })).placementId;
});

describe("S8.8 sound effects (SFX)", () => {
  it("text/angle persist and round-trip", async () => {
    const created = await createSfx(projectRoot, { placementId, text: "BOOM", weight: "heavy", angle: -12, x: 80, y: 80, scale: 2.5 });
    expect(created.weight).toBe("heavy");
    expect(created.angle).toBe(-12);
    expect(created.scale).toBe(2.5);
    expect((await getSfx(projectRoot, created.sfxId)).text).toBe("BOOM");
    expect(await listSfx(projectRoot, placementId)).toHaveLength(1);
    expect(fs.readFileSync(path.join(projectRoot, "artwork/generated/b.png"))).toEqual(Buffer.from("approved-artwork-bytes"));
  });

  it("update edits + delete removes; unknown ids reject", async () => {
    const created = await createSfx(projectRoot, { placementId, text: "CRASH", x: 50, y: 50 });
    const updated = await updateSfx(projectRoot, created.sfxId, { text: "SMASH", angle: 6 });
    expect(updated.text).toBe("SMASH");
    expect(updated.angle).toBe(6);
    await deleteSfx(projectRoot, created.sfxId);
    expect(await getSfx(projectRoot, created.sfxId)).toBeNull();
    await expect(deleteSfx(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("invalid text/weight/angle/scale and unknown placements reject typed; migration v55", async () => {
    await expect(createSfx(projectRoot, { placementId, text: "", x: 0, y: 0 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createSfx(projectRoot, { placementId, text: "b", weight: "chunky", x: 0, y: 0 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createSfx(projectRoot, { placementId, text: "b", angle: "no", x: 0, y: 0 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createSfx(projectRoot, { placementId, text: "b", x: 0, y: 0, scale: 0 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createSfx(projectRoot, { placementId: "missing", text: "b", x: 0, y: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(55);
    } finally {
      db.close();
    }
  });
});
