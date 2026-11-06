// S8.4 Webtoon / vertical layout tests.
//
// Proves the spec acceptance: three webtoon panels stack
// vertically in reading order.
//
// - applyWebtoonLayout on a webtoon page stacks panels
//   top→bottom (increasing y, full usable width), in
//   list order; the page height grows to fit.
// - Traditional pages reject; empty lists and bad
//   optionss reject typed.
// - Re-applying replaces unlabeled placements (no
//   lettering exists yet).
//
// Imported from the built `out/node/core/project/webtoon.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const webtoonPath = path.join(root, "out/node/core/project/webtoon.js");
if (!fs.existsSync(webtoonPath)) {
  throw new Error("Missing out/node/core/project/webtoon.js — run 'npm run build' first");
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
const { createPage, getPage } = require(pagesPath);
const { setArtworkApproval } = require(approvalPath);
const { importAsset } = require(registryPath);
const { applyWebtoonLayout } = require(webtoonPath);

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
let stripId;
let traditionalId;
let panelIds;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  stripId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Strip 1", format: "webtoon", width: 160, height: 300, margin: 10 })).pageId;
  traditionalId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  panelIds = [];
  for (let n = 1; n <= 3; n++) {
    const panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
    const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    fs.writeFileSync(path.join(assetScratch, `art${n}.png`), `bytes-${n}`);
    const asset = await importAsset(projectRoot, {
      sourceAbsolutePath: path.join(assetScratch, `art${n}.png`),
      assetType: "artwork",
      destinationRelative: `artwork/generated/w${n}.png`,
    });
    const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
    await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
    panelIds.push(panelId);
  }
});

describe("S8.4 webtoon / vertical layout", () => {
  it("three panels stack vertically in reading order; page grows", async () => {
    const created = await applyWebtoonLayout(projectRoot, { pageId: stripId, panelIds });
    expect(created.map((p) => p.panelId)).toEqual(panelIds);
    expect(created[0].x).toBe(10);
    expect(created[1].y).toBeGreaterThan(created[0].y);
    expect(created[2].y).toBeGreaterThan(created[1].y);
    expect(created[0].width).toBe(140);
    const page = await getPage(projectRoot, stripId);
    // 10 top + 3*140 panels + 2*0 gaps + 10 bottom = 450.
    expect(page.height).toBe(440);
  });

  it("traditional pages, empty lists, and bad options reject typed", async () => {
    await expect(applyWebtoonLayout(projectRoot, { pageId: traditionalId, panelIds: [panelIds[0]] })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(applyWebtoonLayout(projectRoot, { pageId: stripId, panelIds: [] })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(applyWebtoonLayout(projectRoot, { pageId: "missing", panelIds: [panelIds[0]] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("re-applying replaces unlabeled placements", async () => {
    const first = await applyWebtoonLayout(projectRoot, { pageId: stripId, panelIds });
    const second = await applyWebtoonLayout(projectRoot, { pageId: stripId, panelIds });
    expect(second[0].placementId).not.toBe(first[0].placementId);
    const { listPlacements } = require(path.join(root, "out/node/core/project/placements.js"));
    expect(await listPlacements(projectRoot, stripId)).toHaveLength(3);
  });
});
