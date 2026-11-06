// S3.7 Canon classification tests.
//
// Proves the spec acceptance (§2.7): a suggestion cannot satisfy a
// canon query until explicitly promoted; contradictions surface as
// unknown, never merged.
//
// - Four statuses store; canonQuery satisfies only explicit.
// - Promotion (with rationale) makes a suggestion canon.
// - Unknown contradictions cannot be promoted.
// - Conflicting explicit claims record unknown with conflict cited.
//
// Imported from the built `out/node/core/project/canon.js` with fresh
// temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const canonPath = path.join(root, "out/node/core/project/canon.js");
if (!fs.existsSync(canonPath)) {
  throw new Error("Missing out/node/core/project/canon.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");
const scenesPath = path.join(root, "out/node/core/project/scenes.js");
const entitiesPath = path.join(root, "out/node/core/project/entities.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { storeNormalization } = require(normalizePath);
const { storeChapters } = require(chaptersPath);
const { storeScenes } = require(scenesPath);
const { storeEntities, listEntities } = require(entitiesPath);
const { classifyEntity, promoteToCanon, canonQuery, listCanon } = require(canonPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function buildEntities(name, text) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, text);
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  await storeNormalization(projectRoot, record.manuscriptId);
  await storeChapters(projectRoot, record.manuscriptId);
  await storeScenes(projectRoot, record.manuscriptId);
  await storeEntities(projectRoot, record.manuscriptId);
  return listEntities(projectRoot, record.manuscriptId);
}

describe("S3.7 canon classification", () => {
  it("suggestions never satisfy a canon query until promoted", async () => {
    const entities = await buildEntities("a.md", "Robby waved.");
    const robby = entities.find((e) => e.name.toLowerCase() === "robby");
    expect(robby).toBeTruthy();
    await classifyEntity(projectRoot, robby.entityId, "suggestion", "LLM guessed this");
    expect(await canonQuery(projectRoot, { name: "Robby" })).toEqual([]);
    await classifyEntity(projectRoot, robby.entityId, "interpretation", "reasonable reading");
    expect(await canonQuery(projectRoot, { name: "Robby" })).toEqual([]);
    const promoted = await promoteToCanon(projectRoot, robby.entityId, "human confirmed in Ch2");
    expect(promoted.status).toBe("explicit");
    expect(promoted.promotedAt).toBeTruthy();
    const canon = await canonQuery(projectRoot, { name: "Robby" });
    expect(canon).toHaveLength(1);
    expect(canon[0].entity.entityId).toBe(robby.entityId);
    expect(canon[0].status).toBe("explicit");
  });

  it("explicit classifies directly; empty rationale rejects", async () => {
    const entities = await buildEntities("b.md", "ARKNAD laughed.");
    const arknad = entities.find((e) => e.name.toLowerCase() === "arknad");
    await expect(classifyEntity(projectRoot, arknad.entityId, "explicit", "")).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(classifyEntity(projectRoot, arknad.entityId, "nope", "why")).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    const record = await classifyEntity(projectRoot, arknad.entityId, "explicit", "verbatim name in text");
    expect(record.status).toBe("explicit");
    expect((await canonQuery(projectRoot, { entityType: "character" })).map((r) => r.entity.name)).toContain("ARKNAD");
    expect(await listCanon(projectRoot, arknad.entityId)).toHaveLength(1);
  });

  it("unknown contradictions cannot be promoted", async () => {
    const entities = await buildEntities("c.md", "Robby waved.");
    const robby = entities.find((e) => e.name.toLowerCase() === "robby");
    await classifyEntity(projectRoot, robby.entityId, "unknown", "text is torn here");
    await expect(promoteToCanon(projectRoot, robby.entityId, "force it")).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(promoteToCanon(projectRoot, robby.entityId, "")).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    expect(await canonQuery(projectRoot, { name: "Robby" })).toEqual([]);
  });

  it("conflicting explicit claims record unknown, never merged", async () => {
    const source = path.join(scratch, "d.md");
    fs.writeFileSync(source, "Robby waved at dusk. Again Robby slept.");
    const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
    await storeNormalization(projectRoot, record.manuscriptId);
    await storeChapters(projectRoot, record.manuscriptId);
    await storeScenes(projectRoot, record.manuscriptId);
    // Deterministic extraction keeps only the earliest mention; add an
    // LLM candidate at the LATER mention via classifier injection.
    const { storeEntities } = require(entitiesPath);
    await storeEntities(projectRoot, record.manuscriptId, {
      llmClassifier: async () => [
        { name: "Robby", entityType: "character", quote: "Again Robby slept", confidence: 0.7 },
        { name: "Robby", entityType: "character", quote: "Robby waved", confidence: 0.6 },
      ],
    });
    const entities = await listEntities(projectRoot, record.manuscriptId);
    const robbys = entities.filter((e) => e.name.toLowerCase() === "robby");
    expect(robbys.length).toBeGreaterThanOrEqual(2);
    await classifyEntity(projectRoot, robbys[0].entityId, "explicit", "verbatim");
    const conflict = await classifyEntity(projectRoot, robbys[1].entityId, "explicit", "also verbatim");
    expect(conflict.status).toBe("unknown");
    expect(conflict.rationale).toContain("contradicts explicit");
    // The original explicit stays canon; the conflict never merges into it.
    expect((await canonQuery(projectRoot, { name: "Robby" })).some((r) => r.entity.entityId === robbys[0].entityId)).toBe(true);
  });

  it("unknown entities reject classification of missing ids", async () => {
    await expect(classifyEntity(projectRoot, "missing", "explicit", "why")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(promoteToCanon(projectRoot, "missing", "why")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
