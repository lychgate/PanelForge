// S8.6 Balloons + tails tests.
//
// Proves the spec acceptance: balloons persist with
// tails; orphan tails warn, never crash.
//
// - create/get/list round-trips (kinds, shapes, tail
//   anchor + visibility).
// - retargetTail moves/hides anchors; delete removes.
// - checkBalloon warns on orphan tails (anchor outside
//   placement), silent for anchored tails.
// - Invalid kind/shape/geometry reject typed;
//   migration v53.
//
// Imported from the built `out/node/core/project/balloons.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const balloonsPath = path.join(root, "out/node/core/project/balloons.js");
if (!fs.existsSync(balloonsPath)) {
  throw new Error("Missing out/node/core/project/balloons.js — run 'npm run build' first");
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
const { createBalloon, getBalloon, listBalloons, retargetTail, deleteBalloon, checkBalloon } = require(balloonsPath);

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

describe("S8.6 balloons + tails", () => {
  it("balloons persist with tails; list reads in order", async () => {
    const speech = await createBalloon(projectRoot, {
      placementId,
      kind: "speech",
      shape: "ellipse",
      x: 30,
      y: 30,
      width: 60,
      height: 25,
      tail: { x: 80, y: 90, visible: true },
    });
    const caption = await createBalloon(projectRoot, {
      placementId,
      kind: "caption",
      shape: "rect",
      x: 30,
      y: 60,
      width: 60,
      height: 20,
    });
    expect(speech.tailX).toBe(80);
    expect(speech.tailVisible).toBe(true);
    expect(caption.tailX).toBeNull();
    expect((await listBalloons(projectRoot, placementId)).map((b) => b.kind)).toEqual(["speech", "caption"]);
    expect((await getBalloon(projectRoot, speech.balloonId)).shape).toBe("ellipse");
  });

  it("retarget moves/hides tails; delete removes", async () => {
    const balloon = await createBalloon(projectRoot, {
      placementId,
      kind: "thought",
      shape: "rounded",
      x: 30,
      y: 30,
      width: 50,
      height: 30,
      tail: { x: 60, y: 60, visible: true },
    });
    const retargeted = await retargetTail(projectRoot, balloon.balloonId, { x: 70, y: 70, visible: false });
    expect(retargeted.tailX).toBe(70);
    expect(retargeted.tailVisible).toBe(false);
    await deleteBalloon(projectRoot, balloon.balloonId);
    expect(await getBalloon(projectRoot, balloon.balloonId)).toBeNull();
  });

  it("orphan tails warn; anchored tails pass silent", async () => {
    const orphan = await createBalloon(projectRoot, {
      placementId,
      kind: "speech",
      shape: "ellipse",
      x: 30,
      y: 30,
      width: 60,
      height: 25,
      tail: { x: 500, y: 500, visible: true },
    });
    expect((await checkBalloon(projectRoot, orphan.balloonId)).warnings.some((w) => w.includes("orphan tail"))).toBe(true);
    const anchored = await createBalloon(projectRoot, {
      placementId,
      kind: "speech",
      shape: "ellipse",
      x: 30,
      y: 90,
      width: 60,
      height: 25,
      tail: { x: 80, y: 100, visible: true },
    });
    expect((await checkBalloon(projectRoot, anchored.balloonId)).warnings).toEqual([]);
  });

  it("invalid kind/shape/geometry reject typed; migration v53", async () => {
    await expect(
      createBalloon(projectRoot, { placementId, kind: "bark", shape: "ellipse", x: 0, y: 0, width: 10, height: 10 })
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createBalloon(projectRoot, { placementId, kind: "speech", shape: "oval", x: 0, y: 0, width: 10, height: 10 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(createBalloon(projectRoot, { placementId, kind: "speech", shape: "ellipse", x: 0, y: 0, width: 0, height: 10 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(createBalloon(projectRoot, { placementId: "missing", kind: "speech", shape: "ellipse", x: 0, y: 0, width: 10, height: 10 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(53);
    } finally {
      db.close();
    }
  });
});
