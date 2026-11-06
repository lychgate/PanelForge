// S7.11 Side-by-side + approved-reference comparison tests.
//
// Proves the spec acceptance: all four §8.8 modes return
// exact compared pairs; approved-reference modes use the
// approved package, not the latest generation.
//
// - Mode 1 (two artworks): exact pair + pixel-identity.
// - Mode 2 (current vs previous): latest two generations.
// - Mode 3 (vs approved portrait): approved version's
//   portrait only — a NEWER unapproved version's refs are
//   ignored.
// - Mode 4 (vs approved references): pairs against the
//   approved character reference views.
// - Missing data rejects typed; comparison never writes
//   (panel_artwork row count unchanged).
//
// Imported from the built `out/node/core/project/comparison.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const comparisonPath = path.join(root, "out/node/core/project/comparison.js");
if (!fs.existsSync(comparisonPath)) {
  throw new Error("Missing out/node/core/project/comparison.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const versionRefsPath = path.join(root, "out/node/core/project/version-references.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { setApproval } = require(approvalPath);
const { assignCharacter } = require(assignmentsPath);
const { importAsset } = require(registryPath);
const { associateReference } = require(versionRefsPath);
const { compareTwo, compareCurrentVsPrevious, compareVsApprovedPortrait, compareVsApprovedReferences } = require(comparisonPath);

async function makeAsset(root, name, bytes) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, name);
  fs.writeFileSync(source, bytes);
  const asset = await importAsset(root, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `references/${name}`,
  });
  return asset.assetId;
}

function makeArtworkRow(projectRoot, panelId, assetId, versionNo) {
  const { openProjectDatabase } = require(metadataPath);
  const { db } = openProjectDatabase(projectRoot);
  try {
    const generationId = `gen-${versionNo}-${Math.random()}`;
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
      `art-${versionNo}-${Math.random()}`,
      panelId,
      generationId,
      versionNo,
      assetId,
      new Date().toISOString()
    );
    return db.prepare("SELECT artwork_id FROM panel_artwork WHERE generation_id = ?").get(generationId).artwork_id;
  } finally {
    db.close();
  }
}

let projectRoot;
let panelId;
let approvedVersionId;
let newerVersionId;
let portraitAssetId;
let newerAssetId;
let artworkA;
let artworkB;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;

  const character = await createCharacter(projectRoot, { name: "Robby" });
  const approved = await createVersion(projectRoot, { characterId: character.characterId, label: "v1" });
  await setApproval(projectRoot, approved.versionId, "approved", "fixture approval");
  approvedVersionId = approved.versionId;
  const newer = await createVersion(projectRoot, { characterId: character.characterId, label: "v2" });
  newerVersionId = newer.versionId;
  await assignCharacter(projectRoot, panelId, character.characterId, approvedVersionId);

  portraitAssetId = await makeAsset(projectRoot, "portrait.png", "approved-portrait-bytes");
  newerAssetId = await makeAsset(projectRoot, "newer.png", "newer-unapproved-bytes");
  await associateReference(projectRoot, { versionId: approvedVersionId, assetId: portraitAssetId, slot: "portrait" });
  await associateReference(projectRoot, { versionId: newerVersionId, assetId: newerAssetId, slot: "portrait" });

  artworkA = makeArtworkRow(projectRoot, panelId, portraitAssetId, 1);
  artworkB = makeArtworkRow(projectRoot, panelId, newerAssetId, 2);
});

describe("S7.11 side-by-side and approved-reference comparison", () => {
  it("mode 1: two artworks return an exact pair with pixel identity", async () => {
    const pair = await compareTwo(projectRoot, artworkA, artworkB);
    expect(pair.mode).toBe("side-by-side");
    expect(pair.a.artworkId).toBe(artworkA);
    expect(pair.a.assetId).toBe(portraitAssetId);
    expect(pair.identical).toBe(false);
    const same = await compareTwo(projectRoot, artworkA, artworkA);
    expect(same.identical).toBe(true);
  });

  it("mode 2: current vs previous generation", async () => {
    const pair = await compareCurrentVsPrevious(projectRoot, panelId);
    expect(pair.mode).toBe("current-vs-previous");
    expect(pair.a.artworkId).toBe(artworkB);
    expect(pair.b.artworkId).toBe(artworkA);
  });

  it("mode 3: approved portrait only — newer unapproved refs ignored", async () => {
    const pair = await compareVsApprovedPortrait(projectRoot, panelId);
    expect(pair.mode).toBe("vs-approved-portrait");
    expect(pair.b.assetId).toBe(portraitAssetId);
    expect(pair.b.assetId).not.toBe(newerAssetId);
  });

  it("mode 4: pairs against approved reference views; missing data rejects", async () => {
    const result = await compareVsApprovedReferences(projectRoot, panelId);
    expect(result.artwork.artworkId).toBe(artworkB);
    const characterViews = result.comparisons.filter((c) => c.kind === "character");
    expect(characterViews).toHaveLength(1);
    expect(characterViews[0].assetId).toBe(portraitAssetId);
    await expect(compareTwo(projectRoot, "missing", artworkB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(compareCurrentVsPrevious(projectRoot, "missing-panel")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("comparison is read-only (no artwork rows added)", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const count = () => {
      const { db } = openProjectDatabase(projectRoot);
      try {
        return Number(db.prepare("SELECT COUNT(*) AS n FROM panel_artwork").get().n);
      } finally {
        db.close();
      }
    };
    const before = count();
    await compareTwo(projectRoot, artworkA, artworkB);
    await compareCurrentVsPrevious(projectRoot, panelId);
    expect(count()).toBe(before);
  });
});
