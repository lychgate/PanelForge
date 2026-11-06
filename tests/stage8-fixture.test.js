// S8.14 Stage 8 acceptance fixture tests.
//
// Stage-gate proof: storyboard panels (Stage 6 scenes,
// assignments, character versions; Stage 7 approved
// artwork) assemble on traditional + webtoon pages →
// balloons/SFX/lettering → SVG render → layout
// snapshot/branch/restore, with artwork bytes
// byte-identical throughout and lettering editable
// without touching artwork.
//
// Imported from the built stage modules.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const pagesPath = path.join(root, "out/node/core/project/pages.js");
const placementsPath = path.join(root, "out/node/core/project/placements.js");
const balloonsPath = path.join(root, "out/node/core/project/balloons.js");
const sfxPath = path.join(root, "out/node/core/project/sfx.js");
const letteringPath = path.join(root, "out/node/core/project/lettering.js");
const bordersPath = path.join(root, "out/node/core/project/borders.js");
const svgPath = path.join(root, "out/node/core/project/svg-render.js");
const snapshotsPath = path.join(root, "out/node/core/project/layout-snapshots.js");
const tracePath = path.join(root, "out/node/core/project/traceability.js");
const artworkApprovalPath = path.join(root, "out/node/core/project/artwork-approval.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");
if (!fs.existsSync(svgPath) || !fs.existsSync(snapshotsPath)) {
  throw new Error("Missing built modules — run 'npm run build' first");
}

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { setApproval } = require(approvalPath);
const { assignCharacter } = require(assignmentsPath);
const { createPage } = require(pagesPath);
const { placePanel, updatePlacement } = require(placementsPath);
const { createBalloon } = require(balloonsPath);
const { createSfx, updateSfx } = require(sfxPath);
const { setLettering } = require(letteringPath);
const { setBorder } = require(bordersPath);
const { renderPageSvg } = require(svgPath);
const { createLayoutSnapshot, getLayoutSnapshot, restoreLayoutSnapshot } = require(snapshotsPath);
const { getPageTrace } = require(tracePath);
const { setArtworkApproval } = require(artworkApprovalPath);
const { importAsset } = require(registryPath);

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

const LAYOUT_TABLES = ["pages", "page_panels", "placement_borders", "balloons", "sfx", "reading_order"];

let projectRoot;
let manuscriptId;
let sceneId;
let panel1;
let panel2;
let artworkFiles;

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
  panel1 = (await createPanel(projectRoot, scene.sceneId)).panelId;
  panel2 = (await createPanel(projectRoot, scene.sceneId)).panelId;
  const character = await createCharacter(projectRoot, { name: "Robby" });
  const version = await createVersion(projectRoot, { characterId: character.characterId, label: "Robert, age 7" });
  await setApproval(projectRoot, version.versionId, "approved", "fixture approval");
  await assignCharacter(projectRoot, panel1, character.characterId, version.versionId);
  await assignCharacter(projectRoot, panel2, character.characterId, version.versionId);
  artworkFiles = [];
  for (const [index, panelId] of [panel1, panel2].entries()) {
    const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    const bytes = `stage8-fixture-artwork-${index + 1}`;
    fs.writeFileSync(path.join(assetScratch, `art${index + 1}.png`), bytes);
    const asset = await importAsset(projectRoot, {
      sourceAbsolutePath: path.join(assetScratch, `art${index + 1}.png`),
      assetType: "artwork",
      destinationRelative: `artwork/generated/acceptance-${index + 1}.png`,
    });
    const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
    await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
    artworkFiles.push(path.join(projectRoot, `artwork/generated/acceptance-${index + 1}.png`));
  }
});

describe("S8.14 Stage 8 acceptance fixture", () => {
  it("traditional + webtoon pages assemble → lettering/SVG → snapshot/branch/restore; artwork byte-identical", async () => {
    const hashesBefore = artworkFiles.map(hashFile);

    // Traditional page: two panels, borders, balloon + lettering + SFX.
    const tradId = (await createPage(projectRoot, { manuscriptId, title: "Trad 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
    const t1 = (await placePanel(projectRoot, { pageId: tradId, panelId: panel1, x: 20, y: 20, width: 160, height: 100 })).placementId;
    const t2 = (await placePanel(projectRoot, { pageId: tradId, panelId: panel2, x: 20, y: 140, width: 160, height: 100 })).placementId;
    await setBorder(projectRoot, { placementId: t1, style: "bold", widthMm: 2, rounded: true });
    const balloon = await createBalloon(projectRoot, {
      placementId: t1,
      kind: "speech",
      shape: "ellipse",
      x: 30,
      y: 30,
      width: 60,
      height: 25,
      tail: { x: 80, y: 90, visible: true },
    });
    await setLettering(projectRoot, { balloonId: balloon.balloonId, text: "We go now." });
    const sfx = await createSfx(projectRoot, { placementId: t1, text: "BOOM", weight: "heavy", angle: -12, x: 80, y: 80, scale: 2 });

    // Webtoon page: the second panel scrolls solo.
    const stripId = (await createPage(projectRoot, { manuscriptId, title: "Strip 1", format: "webtoon", width: 120, height: 400, margin: 10 })).pageId;
    await placePanel(projectRoot, { pageId: stripId, panelId: panel2, x: 20, y: 20, width: 80, height: 120 });

    // Both formats render deterministically with artwork by reference.
    const tradSvg1 = await renderPageSvg(projectRoot, tradId);
    const tradSvg2 = await renderPageSvg(projectRoot, tradId);
    expect(tradSvg1).toBe(tradSvg2);
    expect(tradSvg1).toContain('href="artwork/generated/acceptance-1.png"');
    expect(tradSvg1).toContain('href="artwork/generated/acceptance-2.png"');
    expect(tradSvg1).toContain("We go now.");
    expect(tradSvg1).toContain("BOOM");
    expect(tradSvg1).toContain('stroke-width="2"');
    const stripSvg = await renderPageSvg(projectRoot, stripId);
    expect(stripSvg).toContain('href="artwork/generated/acceptance-2.png"');

    // Traceability holds on the assembled page.
    const trace = await getPageTrace(projectRoot, tradId);
    expect(trace.placements.map((t) => t.panelId)).toEqual([panel1, panel2]);
    expect(trace.placements[0].scenePurpose).toBe("Robby leaves the tavern");

    // Snapshot → mutate → branch → restore: dump returns byte-identical.
    const dump = () => {
      const { openProjectDatabase } = require(metadataPath);
      const { db } = openProjectDatabase(projectRoot);
      try {
        const out = {};
        for (const table of LAYOUT_TABLES) {
          out[table] = db.prepare(`SELECT * FROM ${table}`).all().map((row) => JSON.stringify(row)).sort();
        }
        return JSON.stringify(out);
      } finally {
        db.close();
      }
    };
    const before = dump();
    const parent = await createLayoutSnapshot(projectRoot, { name: "gate-parent" });
    await updateSfx(projectRoot, sfx.sfxId, { text: "branched" });
    await setLettering(projectRoot, { balloonId: balloon.balloonId, text: "branched line" });
    await updatePlacement(projectRoot, t2, { y: 150 });
    const child = await createLayoutSnapshot(projectRoot, { name: "gate-branch", parentSnapshotId: parent.snapshotId });
    expect(child.parentSnapshotId).toBe(parent.snapshotId);
    expect((await getLayoutSnapshot(projectRoot, parent.snapshotId)).sfx[0].text).toBe("BOOM");

    await restoreLayoutSnapshot(projectRoot, parent.snapshotId);
    expect(dump()).toBe(before);
    const restoredSvg = await renderPageSvg(projectRoot, tradId);
    expect(restoredSvg).toBe(tradSvg1);

    // Lettering stays editable, artwork never moves.
    await setLettering(projectRoot, { balloonId: balloon.balloonId, text: "final line" });
    const afterLettering = await renderPageSvg(projectRoot, tradId);
    expect(afterLettering).toContain("final line");
    expect(artworkFiles.map(hashFile)).toEqual(hashesBefore);
  });
});
