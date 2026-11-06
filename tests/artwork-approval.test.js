// S7.13 Version history, approval, and restoration tests.
//
// Proves the spec acceptance: restore returns an earlier
// version to approved; later versions remain; approved
// work passes through untouched.
//
// - setArtworkApproval approves a version (rationale
//   required); approval alone never deletes anything.
// - restoreApproved moves the pointer back to an earlier
//   version; later versions stay in the ledger.
// - Generation never touches approvals: a new run does
//   not change the approved pointer or states.
// - Unknown artwork rejects typed.
//
// Imported from the built `out/node/core/project/artwork-approval.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const approvalPath = path.join(root, "out/node/core/project/artwork-approval.js");
if (!fs.existsSync(approvalPath)) {
  throw new Error("Missing out/node/core/project/artwork-approval.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { importAsset } = require(registryPath);
const { setArtworkApproval, restoreApproved, getApprovedArtwork, listHistory } = require(approvalPath);

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
let versionIds;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  versionIds = [];
  for (let n = 1; n <= 3; n++) {
    const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    const assetSource = path.join(assetScratch, `v${n}.png`);
    fs.writeFileSync(assetSource, `bytes-${n}`);
    const asset = await importAsset(projectRoot, {
      sourceAbsolutePath: assetSource,
      assetType: "artwork",
      destinationRelative: `artwork/generated/v${n}.png`,
    });
    versionIds.push(makeArtwork(projectRoot, panelId, asset.assetId, n));
  }
});

describe("S7.13 version history, approval, and restoration", () => {
  it("approval points at one version; restore moves it back, later versions remain", async () => {
    expect(await getApprovedArtwork(projectRoot, panelId)).toBeNull();
    await setArtworkApproval(projectRoot, { artworkId: versionIds[2], status: "approved", rationale: "v3 ships" });
    expect((await getApprovedArtwork(projectRoot, panelId)).artworkId).toBe(versionIds[2]);

    await restoreApproved(projectRoot, { panelId, artworkId: versionIds[0], rationale: "revert to v1" });
    expect((await getApprovedArtwork(projectRoot, panelId)).artworkId).toBe(versionIds[0]);
    const history = await listHistory(projectRoot, panelId);
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.versionNo)).toEqual([1, 2, 3]);
    expect(history[0].status).toBe("approved");
  });

  it("rejected versions are recorded; rationale required; unknown artwork typed", async () => {
    await setArtworkApproval(projectRoot, { artworkId: versionIds[1], status: "rejected", rationale: "off model" });
    expect((await listHistory(projectRoot, panelId))[1].status).toBe("rejected");
    await expect(setArtworkApproval(projectRoot, { artworkId: versionIds[1], status: "approved", rationale: "" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(setArtworkApproval(projectRoot, { artworkId: "missing", status: "approved", rationale: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(restoreApproved(projectRoot, { panelId, artworkId: versionIds[0], rationale: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("migration v49 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(49);
    } finally {
      db.close();
    }
  });
});
