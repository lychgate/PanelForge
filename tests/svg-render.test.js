// S8.11 SVG page render tests.
//
// Proves the spec acceptance: identical records
// render byte-identical SVG; artwork files
// unmodified.
//
// - renderPageSvg returns deterministic bytes:
//   same page twice gives identical output;
//   artwork sha256 unchanged by rendering.
// - Composition covers artwork href (relative
//   path), borders, balloon shapes + tails,
//   wrapped balloon text, rotated SFX; reading
//   order is the DOM order.
// - Empty pages still render valid SVG; text is
//   XML-escaped; unknown page rejects typed.
//
// Imported from the built `out/node/core/project/svg-render.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "out/node/core/project/svg-render.js");
if (!fs.existsSync(svgPath)) {
  throw new Error("Missing out/node/core/project/svg-render.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const pagesPath = path.join(root, "out/node/core/project/pages.js");
const placementsPath = path.join(root, "out/node/core/project/placements.js");
const balloonsPath = path.join(root, "out/node/core/project/balloons.js");
const sfxPath = path.join(root, "out/node/core/project/sfx.js");
const letteringPath = path.join(root, "out/node/core/project/lettering.js");
const bordersPath = path.join(root, "out/node/core/project/borders.js");
const readingOrderPath = path.join(root, "out/node/core/project/reading-order.js");
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
const { setLettering } = require(letteringPath);
const { setBorder } = require(bordersPath);
const { setReadingOrder } = require(readingOrderPath);
const { setArtworkApproval } = require(approvalPath);
const { importAsset } = require(registryPath);
const { renderPageSvg, buildPageSvg } = require(svgPath);

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

let projectRoot;
let pageId;
let panelId;
let placementId;
let artworkAbs;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;
  pageId = (await createPage(projectRoot, { manuscriptId: record.manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280, margin: 10 })).pageId;
  const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  artworkAbs = path.join(assetScratch, "art.png");
  fs.writeFileSync(artworkAbs, "approved-artwork-bytes");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: artworkAbs,
    assetType: "artwork",
    destinationRelative: "artwork/generated/r.png",
  });
  const artworkId = makeArtwork(projectRoot, panelId, asset.assetId, 1);
  await setArtworkApproval(projectRoot, { artworkId, status: "approved", rationale: "fixture approval" });
  // Keep the absolute path to the imported copy for the hash check.
  artworkAbs = path.join(projectRoot, "artwork/generated/r.png");
  placementId = (await placePanel(projectRoot, { pageId, panelId, x: 20, y: 20, width: 160, height: 100 })).placementId;
  const balloon = await createBalloon(projectRoot, {
    placementId,
    kind: "speech",
    shape: "ellipse",
    x: 30,
    y: 30,
    width: 60,
    height: 25,
    tail: { x: 80, y: 90, visible: true },
  });
  await setLettering(projectRoot, { balloonId: balloon.balloonId, text: "Hello there good reader" });
  await createSfx(projectRoot, { placementId, text: "BOOM", weight: "heavy", angle: -12, x: 80, y: 80, scale: 2 });
});

describe("S8.11 SVG page render", () => {
  it("identical records render byte-identical SVG; artwork untouched", async () => {
    const before = hashFile(artworkAbs);
    const first = await renderPageSvg(projectRoot, pageId);
    const second = await renderPageSvg(projectRoot, pageId);
    expect(first).toBe(second);
    expect(first).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(first).toContain('href="artwork/generated/r.png"');
    expect(first).toContain("<ellipse");
    expect(first).toContain("<line");
    expect(first).toContain("BOOM");
    expect(first).toContain("Hello there");
    // No embedded bytes, no base64 payload of the artwork.
    expect(first).not.toContain("base64");
    expect(hashFile(artworkAbs)).toBe(before);
  });

  it("borders and reading order shape the output; empty pages render", async () => {
    await setBorder(projectRoot, { placementId, style: "bold", widthMm: 2, rounded: true });
    const withBorder = await renderPageSvg(projectRoot, pageId);
    expect(withBorder).toContain('stroke-width="2"');
    expect(withBorder).toContain('rx="3"');

    // Second placement + reversed explicit reading order.
    const { createPanel: createPanel2 } = require(panelsPath);
    const { createScene: createScene2 } = require(scenesPath);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    const source = path.join(scratch, "book.md");
    fs.writeFileSync(source, "# Prologue\n\nOnce.");
    const record = (await importManuscript(projectRoot, { sourceAbsolutePath: source })).manuscriptId;
    const scene = await createScene2(projectRoot, { manuscriptId: record });
    const panelId2 = (await createPanel2(projectRoot, scene.sceneId)).panelId;
    const assetScratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    fs.writeFileSync(path.join(assetScratch, "art2.png"), "second-artwork-bytes");
    const asset2 = await importAsset(projectRoot, {
      sourceAbsolutePath: path.join(assetScratch, "art2.png"),
      assetType: "artwork",
      destinationRelative: "artwork/generated/r2.png",
    });
    const artworkId2 = makeArtwork(projectRoot, panelId2, asset2.assetId, 1);
    await setArtworkApproval(projectRoot, { artworkId: artworkId2, status: "approved", rationale: "fixture approval" });
    const placement2 = (await placePanel(projectRoot, { pageId, panelId: panelId2, x: 20, y: 140, width: 160, height: 100, zOrder: 5 })).placementId;
    await setReadingOrder(projectRoot, { pageId, placementIds: [placement2, placementId] });
    const ordered = await renderPageSvg(projectRoot, pageId);
    expect(ordered.indexOf(`data-placement-id="${placement2}"`)).toBeLessThan(ordered.indexOf(`data-placement-id="${placementId}"`));
    expect(ordered).toContain('data-reading-index="0"');

    // Empty page renders valid SVG.
    const page2 = (await createPage(projectRoot, { manuscriptId: record, title: "Empty", format: "webtoon", width: 120, height: 200, margin: 5 })).pageId;
    const empty = await renderPageSvg(projectRoot, page2);
    expect(empty).toContain("<svg");
    expect(empty).toContain("</svg>");
    expect(empty).not.toContain("<g ");

    // Pure builder is deterministic too.
    const pure1 = buildPageSvg({ pageId: "p1", title: "T", format: "traditional", width: 100, height: 120 }, []);
    const pure2 = buildPageSvg({ pageId: "p1", title: "T", format: "traditional", width: 100, height: 120 }, []);
    expect(pure1).toBe(pure2);
  });

  it("XML escaping holds; unknown page rejects typed", async () => {
    const balloon = await createBalloon(projectRoot, {
      placementId,
      kind: "caption",
      shape: "rect",
      x: 30,
      y: 60,
      width: 60,
      height: 20,
    });
    await setLettering(projectRoot, { balloonId: balloon.balloonId, text: 'A & B <C> "Q"' });
    const svg = await renderPageSvg(projectRoot, pageId);
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;C&gt;");
    expect(svg).not.toContain("A & B");
    await expect(renderPageSvg(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
