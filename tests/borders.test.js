// S8.5 Borders tests.
//
// Proves the spec acceptance: border style persists per
// placement; renders in SVG (S8.11) — never baked into
// artwork.
//
// - setBorder stores presets (none/thin/bold) with
//   default/custom widths + rounded, round-trips.
// - Invalid style/width/rounded and unknown placements
//   reject typed; artwork bytes untouched.
// - Migration v52.
//
// Imported from the built `out/node/core/project/borders.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bordersPath = path.join(root, "out/node/core/project/borders.js");
if (!fs.existsSync(bordersPath)) {
  throw new Error("Missing out/node/core/project/borders.js — run 'npm run build' first");
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
const { setBorder, getBorder } = require(bordersPath);

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
let assetRelative;

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
  assetRelative = asset.relativePath;
  const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
  placementId = (await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 })).placementId;
});

describe("S8.5 borders", () => {
  it("presets persist with widths and rounded, round-tripping", async () => {
    const thin = await setBorder(projectRoot, { placementId, style: "thin" });
    expect(thin).toEqual({ style: "thin", widthMm: 0.5, rounded: false });
    expect(await getBorder(projectRoot, placementId)).toEqual(thin);
    const bold = await setBorder(projectRoot, { placementId, style: "bold", widthMm: 3, rounded: true });
    expect(bold).toEqual({ style: "bold", widthMm: 3, rounded: true });
    expect((await getBorder(projectRoot, placementId)).widthMm).toBe(3);
  });

  it("invalid style/width/rounded reject typed; artwork bytes untouched", async () => {
    await expect(setBorder(projectRoot, { placementId, style: "chunky" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setBorder(projectRoot, { placementId, style: "thin", widthMm: -1 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setBorder(projectRoot, { placementId, style: "thin", widthMm: 99 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setBorder(projectRoot, { placementId, style: "none", widthMm: 2 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setBorder(projectRoot, { placementId: "missing", style: "thin" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fs.readFileSync(path.join(projectRoot, assetRelative))).toEqual(Buffer.from("approved-artwork-bytes"));
  });

  it("migration v52 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(52);
    } finally {
      db.close();
    }
  });
});
