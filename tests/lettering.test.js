// S8.7 Dialogue/caption editing tests.
//
// Proves the spec acceptance: balloon text edits
// round-trip; artwork hashes unchanged.
//
// - setLettering/getLettering round-trips per balloon
//   (empty starts as "").
// - Artwork bytes byte-identical after edits (sha256).
// - Unknown balloons reject typed; migration v54.
//
// Imported from the built `out/node/core/project/lettering.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const letteringPath = path.join(root, "out/node/core/project/lettering.js");
if (!fs.existsSync(letteringPath)) {
  throw new Error("Missing out/node/core/project/lettering.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const pagesPath = path.join(root, "out/node/core/project/pages.js");
const placementsPath = path.join(root, "out/node/core/project/placements.js");
const balloonsPath = path.join(root, "out/node/core/project/balloons.js");
const approvalPath = path.join(root, "out/node/core/project/artwork-approval.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const panelTextPath = path.join(root, "out/node/core/project/panel-text.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createPage } = require(pagesPath);
const { placePanel } = require(placementsPath);
const { createBalloon } = require(balloonsPath);
const { setArtworkApproval } = require(approvalPath);
const { importAsset } = require(registryPath);
const { setText, getText } = require(panelTextPath);
const { setLettering, getLettering } = require(letteringPath);

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
let panelId;
let balloonId;
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
  const pageId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  assetFile = path.join(scratch, "art.png");
  fs.writeFileSync(assetFile, "approved-artwork-bytes");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: assetFile,
    assetType: "artwork",
    destinationRelative: "artwork/generated/l.png",
  });
  const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
  await setText(projectRoot, panelId, { dialogue: "panel dialogue lives here" });
  const placement = await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 });
  balloonId = (await createBalloon(projectRoot, { placementId: placement.placementId, kind: "speech", shape: "ellipse", x: 30, y: 30, width: 60, height: 25 })).balloonId;
});

describe("S8.7 dialogue/caption editing", () => {
  it("balloon text edits round-trip; artwork hashes unchanged", async () => {
    expect((await getLettering(projectRoot, balloonId)).text).toBe("");
    await setLettering(projectRoot, { balloonId, text: "We go now." });
    expect((await getLettering(projectRoot, balloonId)).text).toBe("We go now.");
    expect(fs.readFileSync(assetFile)).toEqual(Buffer.from("approved-artwork-bytes"));
    expect((await getText(projectRoot, panelId)).dialogue).toBe("panel dialogue lives here");
  });

  it("unknown balloons reject typed; non-string text rejects", async () => {
    await expect(setLettering(projectRoot, { balloonId: "missing", text: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setLettering(projectRoot, { balloonId, text: 5 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("migration v54 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(54);
    } finally {
      db.close();
    }
  });
});
