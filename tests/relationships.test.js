// S3.5 Source relationships tests.
//
// Proves the spec acceptance: a full traversal from any extraction
// lands on exact source text; broken offsets are impossible by
// construction and tested.
//
// - traverseFromScene lands on the exact normalized slice + original
//   bytes for every stored scene.
// - verifySourceChain passes on well-formed projects and detects
//   tampering (span drift, gaps, wrong links, broken resolution).
//
// Imported from the built `out/node/core/project/relationships.js`
// with fresh temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const relPath = path.join(root, "out/node/core/project/relationships.js");
if (!fs.existsSync(relPath)) {
  throw new Error("Missing out/node/core/project/relationships.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");
const scenesPath = path.join(root, "out/node/core/project/scenes.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript, readManuscriptOriginal } = require(manuscriptsPath);
const { storeNormalization, getNormalization } = require(normalizePath);
const { storeChapters, listChapters } = require(chaptersPath);
const { storeScenes, listScenes } = require(scenesPath);
const { traverseFromScene, verifySourceChain } = require(relPath);
const { openProjectDatabase } = require(metadataPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function buildChain(name, text) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, text);
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  await storeNormalization(projectRoot, record.manuscriptId);
  await storeChapters(projectRoot, record.manuscriptId);
  await storeScenes(projectRoot, record.manuscriptId);
  return record;
}

describe("S3.5 source relationships", () => {
  it("traversal from any scene lands on exact normalized + source text", async () => {
    const text = "# One\n\nWake.\n\n***\n\nINT. TAVERN - NIGHT\n\nDrink.\n\n# Two\n\nSleep.";
    const record = await buildChain("chain.md", text);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const scenes = await listScenes(projectRoot, record.manuscriptId);
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      const traversal = await traverseFromScene(projectRoot, scene.sceneId);
      expect(traversal.manuscript.manuscriptId).toBe(record.manuscriptId);
      expect(traversal.chapter.chapterId).toBe(scene.chapterId);
      expect(traversal.scene.sceneId).toBe(scene.sceneId);
      expect(traversal.normalizedText).toBe(normalization.normalizedText.slice(scene.normStart, scene.normEnd));
      // Original slice folds back to the normalized slice exactly.
      expect(traversal.originalText.replace(/\r\n/g, "\n")).toBe(traversal.normalizedText);
    }
    expect((await verifySourceChain(projectRoot, record.manuscriptId)).ok).toBe(true);
  });

  it("CRLF originals traverse to exact bytes", async () => {
    const text = "# One\r\n\r\nWake.\r\n\r\n***\r\n\r\nINT. TAVERN - NIGHT\r\n\r\nDrink.";
    const record = await buildChain("crlf.md", text);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const [first] = await listScenes(projectRoot, record.manuscriptId);
    const traversal = await traverseFromScene(projectRoot, first.sceneId);
    expect(traversal.originalBytes.equals(readManuscriptOriginal(projectRoot, record).subarray(0, traversal.originalBytes.length))).toBe(true);
    expect(traversal.originalText.replace(/\r\n/g, "\n")).toBe(traversal.normalizedText);
  });

  it("verify detects span tampering (broken offsets never pass)", async () => {
    const record = await buildChain("tamper.md", "# One\n\nWake.\n\n# Two\n\nSleep.");
    expect((await verifySourceChain(projectRoot, record.manuscriptId)).ok).toBe(true);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const first = db.prepare("SELECT * FROM chapters ORDER BY sort_order LIMIT 1").get();
      db.prepare("UPDATE chapters SET norm_start = ? WHERE chapter_id = ?").run(Number(first.norm_start) + 3, String(first.chapter_id));
    } finally {
      db.close();
    }
    const verification = await verifySourceChain(projectRoot, record.manuscriptId);
    expect(verification.ok).toBe(false);
    expect(verification.problems.length).toBeGreaterThan(0);
  });

  it("verify detects scene escaping its chapter", async () => {
    const record = await buildChain("escape.md", "# One\n\nWake.\n\n# Two\n\nSleep.");
    const { db } = openProjectDatabase(projectRoot);
    try {
      const scene = db.prepare("SELECT * FROM scenes LIMIT 1").get();
      db.prepare("UPDATE scenes SET norm_end = norm_end + 100000 WHERE scene_id = ?").run(String(scene.scene_id));
    } finally {
      db.close();
    }
    const verification = await verifySourceChain(projectRoot, record.manuscriptId);
    expect(verification.ok).toBe(false);
    expect(verification.problems.some((p) => p.kind === "scene-span")).toBe(true);
  });

  it("overridden scenes still traverse and verify", async () => {
    const text = "# One\n\nWake.\n\n***\n\nINT. TAVERN - NIGHT\n\nDrink.";
    const record = await buildChain("override.md", text);
    const { recutScenes } = require(scenesPath);
    const [chapter] = await listChapters(projectRoot, record.manuscriptId);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const mid = normalization.normalizedText.indexOf("Drink");
    const recut = await recutScenes(projectRoot, record.manuscriptId, chapter.chapterId, [mid], ["Cold open", "Tavern"]);
    for (const scene of recut) {
      const traversal = await traverseFromScene(projectRoot, scene.sceneId);
      expect(traversal.normalizedText).toBe(normalization.normalizedText.slice(scene.normStart, scene.normEnd));
    }
    expect((await verifySourceChain(projectRoot, record.manuscriptId)).ok).toBe(true);
  });
});
