// S8.3 Traditional layout templates tests.
//
// Proves the spec acceptance: a 2×3 preset yields six
// evenly guttered placements.
//
// - listPresets lists the built-in grids.
// - applyPreset("six-panel") places 6 panels in
//   row-major order with even gutters inside margins.
// - Over-capacity panel lists, unknown presets, and
//   non-traditional pages reject typed.
// - Re-applying replaces only unlabeled placements
//   (no lettering exists yet — all placements replaced).
//
// Imported from the built `out/node/core/project/layout-templates.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const templatesPath = path.join(root, "out/node/core/project/layout-templates.js");
if (!fs.existsSync(templatesPath)) {
  throw new Error("Missing out/node/core/project/layout-templates.js — run 'npm run build' first");
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
const { listPresets, applyPreset } = require(templatesPath);

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
let panelIds;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  pageId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  panelIds = [];
  for (let n = 1; n <= 6; n++) {
    const panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
    const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    fs.writeFileSync(path.join(assetScratch, `art${n}.png`), `bytes-${n}`);
    const asset = await importAsset(projectRoot, {
      sourceAbsolutePath: path.join(assetScratch, `art${n}.png`),
      assetType: "artwork",
      destinationRelative: `artwork/generated/p${n}.png`,
    });
    const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
    await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
    panelIds.push(panelId);
  }
});

describe("S8.3 traditional layout templates", () => {
  it("six-panel preset yields six evenly guttered placements", async () => {
    const presets = await listPresets();
    expect(presets.some((preset) => preset.name === "six-panel")).toBe(true);
    const created = await applyPreset(projectRoot, { pageId, preset: "six-panel", panelIds });
    expect(created).toHaveLength(6);
    expect(created.map((p) => p.panelId)).toEqual(panelIds);
    // Row-major: first row x positions step by cell+gutter.
    expect(created[0].y).toBe(created[1].y);
    expect(created[3].y).toBeGreaterThan(created[0].y);
    const gapX = created[1].x - (created[0].x + created[0].width);
    expect(gapX).toBeGreaterThan(0);
    expect(Math.abs(gapX - 6)).toBeLessThan(0.2);
    expect(created[0].x).toBeGreaterThanOrEqual(10);
  });

  it("over-capacity, unknown presets, and webtoon pages reject typed", async () => {
    await expect(applyPreset(projectRoot, { pageId, preset: "four-panel", panelIds })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(applyPreset(projectRoot, { pageId, preset: "nope", panelIds: [panelIds[0]] })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const { listPages } = require(pagesPath);
    const [only] = await listPages(projectRoot, manuscriptIdOf(projectRoot));
    const stripId = (await createPage(projectRoot, { manuscriptId: only.manuscriptId, title: "Strip", format: "webtoon", width: 160, height: 800 })).pageId;
    await expect(applyPreset(projectRoot, { pageId: stripId, preset: "two-up", panelIds: [panelIds[0]] })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
  });

  it("re-applying replaces unlabeled placements", async () => {
    const first = await applyPreset(projectRoot, { pageId, preset: "two-up", panelIds: panelIds.slice(0, 2) });
    const second = await applyPreset(projectRoot, { pageId, preset: "two-up", panelIds: panelIds.slice(0, 2) });
    expect(second[0].placementId).not.toBe(first[0].placementId);
    const { listPlacements } = require(path.join(root, "out/node/core/project/placements.js"));
    expect(await listPlacements(projectRoot, pageId)).toHaveLength(2);
  });
});

function manuscriptIdOf(root) {
  const { openProjectDatabase } = require(metadataPath);
  const { db } = openProjectDatabase(root);
  try {
    return db.prepare("SELECT manuscript_id FROM pages WHERE page_id = ?").get(pageId).manuscript_id;
  } finally {
    db.close();
  }
}
