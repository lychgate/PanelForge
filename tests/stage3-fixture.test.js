// S3.14 Stage 3 acceptance fixture.
//
// The end-to-end gate for Stage 3: one fixture manuscript flows through
// the whole pipeline — import (S3.1) → normalization (S3.2) → chapters
// (S3.3) → scenes (S3.4) → source relationships (S3.5) → entities
// (S3.6) → canon classification (S3.7) → styles (S3.11) applied to a
// scene via priority resolution (S3.13) — with the preserved original
// untouched throughout and every extracted span resolving back to it.
//
// Imported from the built `out/node/core/project/*.js` modules with
// fresh temp projects per test, so tests run in plain Node.
const { describe, it, expect, beforeEach } = await import("vitest");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/core/project", rel);
for (const rel of [
  "service.js",
  "manuscripts.js",
  "text-normalize.js",
  "chapters.js",
  "scenes.js",
  "relationships.js",
  "entities.js",
  "canon.js",
  "styles.js",
  "style-variants.js",
]) {
  if (!fs.existsSync(built(rel))) {
    throw new Error(`Missing out/node/core/project/${rel} — run 'npm run build' first`);
  }
}

const { createProject } = require(built("service.js"));
const {
  importManuscript,
  readManuscriptOriginal,
  verifyManuscript,
} = require(built("manuscripts.js"));
const {
  storeNormalization,
  getNormalization,
  sourceSpanFor,
} = require(built("text-normalize.js"));
const { storeChapters, listChapters } = require(built("chapters.js"));
const { storeScenes, listScenes } = require(built("scenes.js"));
const { verifySourceChain, traverseFromScene } = require(built("relationships.js"));
const { storeEntities, listEntities } = require(built("entities.js"));
const { classifyEntity, canonQuery, promoteToCanon } = require(built("canon.js"));
const { createStyle } = require(built("styles.js"));
const { createVariant, resolveStyle } = require(built("style-variants.js"));

// Two chapters, two scenes (INT./EXT. headings), deterministic entities.
const FIXTURE = [
  "# Chapter One",
  "",
  "Robby met ARKNAD in Ravenholt in 2793. Robby smiled.",
  "",
  "INT. TAVERN - NIGHT",
  "",
  "Robby ordered cider. ARKNAD watched from the shadows.",
  "",
  "# Chapter Two",
  "",
  "EXT. RAVENHOLT PLAINS - DAWN",
  "",
  "Robby crossed the plains toward the harbor.",
  "",
].join("\n");

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function buildChain(bytes = Buffer.from(FIXTURE, "utf8")) {
  const source = path.join(scratch, "fixture.md");
  fs.writeFileSync(source, bytes);
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const normalization = await storeNormalization(projectRoot, record.manuscriptId);
  const chapters = await storeChapters(projectRoot, record.manuscriptId);
  const scenes = await storeScenes(projectRoot, record.manuscriptId);
  const entities = await storeEntities(projectRoot, record.manuscriptId);
  return { record, normalization, chapters, scenes, entities, sourceBytes: bytes };
}

describe("S3.14 Stage 3 acceptance fixture", () => {
  it("fixture manuscript runs import → chapters → scenes → entities → canon with originals intact", async () => {
    const { record, chapters, scenes, entities, sourceBytes } = await buildChain();

    // Chapters and scenes tile the manuscript.
    expect(chapters.length).toBeGreaterThanOrEqual(2);
    expect(scenes.length).toBeGreaterThanOrEqual(2);
    expect(await listChapters(projectRoot, record.manuscriptId)).toHaveLength(chapters.length);
    expect(await listScenes(projectRoot, record.manuscriptId)).toHaveLength(scenes.length);

    // Deterministic entities extracted, each bound to a scene.
    expect(entities.length).toBeGreaterThan(0);
    expect(entities.some((e) => e.name === "Robby")).toBe(true);
    for (const entity of entities) {
      expect(entity.sceneId).toBeTruthy();
    }
    expect(await listEntities(projectRoot, record.manuscriptId)).toHaveLength(entities.length);

    // Canon classification: explicit is queryable; suggestion stays dark
    // until promoted.
    const robby = entities.find((e) => e.name === "Robby");
    const arknad = entities.find((e) => e.name === "ARKNAD");
    await classifyEntity(projectRoot, robby.entityId, "explicit", "named on-page dialogue actor");
    await classifyEntity(projectRoot, arknad.entityId, "suggestion", "background watcher — needs owner call");
    expect((await canonQuery(projectRoot, { name: "Robby" })).map((r) => r.entity.name)).toEqual(["Robby"]);
    expect(await canonQuery(projectRoot, { name: "ARKNAD" })).toHaveLength(0);
    await promoteToCanon(projectRoot, arknad.entityId, "owner confirmed watcher identity");
    expect((await canonQuery(projectRoot, { name: "ARKNAD" })).map((r) => r.entity.name)).toEqual(["ARKNAD"]);

    // The preserved original is untouched: hash, bytes, source file.
    expect(record.contentHash).toBe(crypto.createHash("sha256").update(sourceBytes).digest("hex"));
    expect(readManuscriptOriginal(projectRoot, record).equals(sourceBytes)).toBe(true);
    expect(fs.readFileSync(path.join(scratch, "fixture.md")).equals(sourceBytes)).toBe(true);
    expect(verifyManuscript(projectRoot, record).status).toBe("ok");
  });

  it("extracted info links back to exact source bytes", async () => {
    const { record, scenes, entities } = await buildChain();
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const original = readManuscriptOriginal(projectRoot, record);

    // The relationship chain verifies end-to-end (S3.5).
    const chain = await verifySourceChain(projectRoot, record.manuscriptId);
    expect(chain.ok).toBe(true);

    // A scene traversal lands on the exact normalized slice + original bytes.
    const traversal = await traverseFromScene(projectRoot, scenes[0].sceneId);
    expect(traversal.originalText.replace(/\r\n/g, "\n")).toBe(traversal.normalizedText);
    expect(traversal.originalBytes.equals(original.subarray(0, traversal.originalBytes.length))).toBe(true);

    // Every entity span resolves exactly through the S3.2 offset map.
    for (const entity of entities) {
      const slice = sourceSpanFor(original, normalization.offsetMap, entity.normStart, entity.normEnd).toString("utf8");
      expect(slice.replace(/\r\n/g, "\n")).toBe(normalization.normalizedText.slice(entity.normStart, entity.normEnd));
    }
  });

  it("styles apply to a scene through priority resolution, deterministic and guidance-only", async () => {
    const { scenes } = await buildChain();
    const sceneStyle = await createStyle(projectRoot, { name: "Tavern Grit", lighting: "low-key" });
    const projectStyle = await createStyle(projectRoot, { name: "Comic Flat", lighting: "flat" });
    await createVariant(projectRoot, { styleId: projectStyle.styleId, scope: "project" });
    await createVariant(projectRoot, {
      styleId: sceneStyle.styleId,
      scope: "scene",
      scopeRef: scenes[0].sceneId,
      lockStrength: "soft",
    });

    const a = await resolveStyle(projectRoot, { sceneId: scenes[0].sceneId });
    const b = await resolveStyle(projectRoot, { sceneId: scenes[0].sceneId });
    expect(a.styleId).toBe(sceneStyle.styleId);
    expect(a.scope).toBe("scene");
    expect(a.variantId).toBe(b.variantId);
    expect(a.styleId).toBe(b.styleId);
    expect(a.guidance).toBe("guidance-only");

    // An unrelated scene still gets the project-wide variant.
    const elsewhere = await resolveStyle(projectRoot, { sceneId: scenes[scenes.length - 1].sceneId });
    expect(elsewhere.styleId).toBe(projectStyle.styleId);
    expect(elsewhere.scope).toBe("project");
  });

  it("the whole acceptance passes on a second fixture text with the same guarantees", async () => {
    // A different manuscript shape: single chapter, different names,
    // CRLF line endings — the pipeline must not care.
    const text = "Chapter One\r\n\r\nMira found RAVENHOLT at dawn in 2801.\r\n\r\nMira kept walking.\r\n";
    const { record, scenes, entities } = await buildChain(Buffer.from(text, "utf8"));
    expect(scenes.length).toBeGreaterThanOrEqual(1);
    expect(entities.some((e) => e.name === "Mira")).toBe(true);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const original = readManuscriptOriginal(projectRoot, record);
    for (const entity of entities) {
      const slice = sourceSpanFor(original, normalization.offsetMap, entity.normStart, entity.normEnd).toString("utf8");
      expect(slice.replace(/\r\n/g, "\n")).toBe(normalization.normalizedText.slice(entity.normStart, entity.normEnd));
    }
    expect((await verifySourceChain(projectRoot, record.manuscriptId)).ok).toBe(true);
    expect(verifyManuscript(projectRoot, record).status).toBe("ok");
  });
});
