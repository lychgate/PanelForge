// S3.6 Entity extraction framework tests.
//
// Proves the spec acceptance: fixture entities resolve to exact source
// spans; candidates without spans are rejected.
//
// - Deterministic spine: capitalized names + chronology markers resolve
//   to exact spans with heuristic confidence.
// - LLM path: proposals whose quotes verify are accepted with spans;
//   hallucinated quotes are dropped (anti-fabrication).
// - Storage round-trips per manuscript; re-runs replace.
//
// Imported from the built `out/node/core/project/entities.js` with
// fresh temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entitiesPath = path.join(root, "out/node/core/project/entities.js");
if (!fs.existsSync(entitiesPath)) {
  throw new Error("Missing out/node/core/project/entities.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");
const scenesPath = path.join(root, "out/node/core/project/scenes.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { storeNormalization, getNormalization, sourceSpanFor } = require(normalizePath);
const { storeChapters } = require(chaptersPath);
const { storeScenes } = require(scenesPath);
const {
  deterministicCandidates,
  validateLlmProposals,
  storeEntities,
  listEntities,
} = require(entitiesPath);

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

describe("S3.6 entity extraction framework", () => {
  it("deterministic candidates resolve to exact spans", () => {
    const text = "Robby met ARKNAD in Ravenholt in 2793. Robby smiled.";
    const candidates = deterministicCandidates(text, 0);
    const byName = new Map(candidates.map((c) => [c.name.toLowerCase(), c]));
    expect(text.slice(byName.get("robby").normStart, byName.get("robby").normEnd)).toBe("Robby");
    expect(text.slice(byName.get("arknad").normStart, byName.get("arknad").normEnd)).toBe("ARKNAD");
    expect(text.slice(byName.get("2793").normStart, byName.get("2793").normEnd)).toBe("2793");
    expect(byName.get("2793").entityType).toBe("chronology");
    for (const candidate of candidates) {
      expect(normalizeFloat(candidate.confidence)).toBeGreaterThan(0);
      expect(normalizeFloat(candidate.confidence)).toBeLessThanOrEqual(1);
      expect(candidate.source).toBe("deterministic");
    }
  });

  it("LLM proposals without verbatim spans are rejected", () => {
    const sceneText = "Robby waved.";
    const accepted = validateLlmProposals(sceneText, 0, [
      { name: "Robby", entityType: "character", quote: "Robby", confidence: 0.9 },
      { name: "Ghost", entityType: "character", quote: "Ghost", confidence: 0.9 },
      { name: "Robby", entityType: "character", quote: "Ghost said", confidence: 0.9 },
    ]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ name: "Robby", source: "llm" });
  });

  it("fixture entities store with scene links and source resolution", async () => {
    const record = await buildChain("story.md", "# One\n\nRobby met ARKNAD. Robby smiled.\n\n***\n\nINT. TAVERN - NIGHT\n\nRobby ordered cider.");
    const stored = await storeEntities(projectRoot, record.manuscriptId);
    expect(stored.length).toBeGreaterThan(0);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const { readManuscriptOriginal } = require(manuscriptsPath);
    const original = readManuscriptOriginal(projectRoot, record);
    for (const entity of stored) {
      expect(entity.sceneId).toBeTruthy();
      // Span resolves exactly through the S3.2 map.
      const slice = sourceSpanFor(original, normalization.offsetMap, entity.normStart, entity.normEnd).toString("utf8");
      expect(slice.replace(/\r\n/g, "\n")).toBe(normalization.normalizedText.slice(entity.normStart, entity.normEnd));
      expect(normalization.normalizedText.slice(entity.normStart, entity.normEnd)).toContain(entity.name);
    }
    expect((await listEntities(projectRoot, record.manuscriptId)).map((e) => e.name)).toContain("Robby");
    // Re-run replaces (idempotent count).
    const again = await storeEntities(projectRoot, record.manuscriptId);
    expect(again.length).toBe(stored.length);
  });

  it("LLM classifier integrates via injection; provider absence never fabricates", async () => {
    const record = await buildChain("llm.md", "# One\n\nRobby waved at the Tavern.");
    const fakeClassifier = async (sceneText) => [
      { name: "Tavern", entityType: "location", quote: "the Tavern", confidence: 0.8 },
      { name: "Phantom", entityType: "character", quote: "Phantom", confidence: 0.9 },
    ];
    const stored = await storeEntities(projectRoot, record.manuscriptId, { llmClassifier: fakeClassifier });
    const llm = stored.filter((e) => e.source === "llm");
    expect(llm.map((e) => e.name)).toEqual(["Tavern"]);
    // A throwing classifier surfaces the error (no silent empty).
    await expect(
      storeEntities(projectRoot, record.manuscriptId, {
        llmClassifier: async () => {
          throw Object.assign(new Error("down"), { code: "UNAVAILABLE" });
        },
      })
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("missing normalization rejects with NOT_FOUND", async () => {
    const source = path.join(scratch, "bare.txt");
    fs.writeFileSync(source, "x");
    const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
    await expect(storeEntities(projectRoot, record.manuscriptId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listEntities(projectRoot, record.manuscriptId)).toEqual([]);
  });
});

function normalizeFloat(v) {
  return typeof v === "number" ? v : Number(v);
}
