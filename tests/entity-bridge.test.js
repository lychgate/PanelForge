// S4.6 Entity → character bridge tests.
//
// Proves the spec acceptance: a profile created from an entity
// keeps a resolvable link to its source span; an entity never
// spawns two profiles; fields outside the name start empty.
//
// - createProfileFromEntity copies only the name; all other §8.4
//   fields are "" (no fabrication).
// - second creation from the same entity rejects DUPLICATE_SOURCE.
// - unknown entities reject; getCharacterFromEntity round-trips.
// - resolveEntitySource returns the exact normalized slice and
//   original bytes behind the span.
//
// Imported from the built `out/node/core/project/entity-bridge.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bridgePath = path.join(root, "out/node/core/project/entity-bridge.js");
if (!fs.existsSync(bridgePath)) {
  throw new Error("Missing out/node/core/project/entity-bridge.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");
const scenesPath = path.join(root, "out/node/core/project/scenes.js");
const entitiesPath = path.join(root, "out/node/core/project/entities.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { storeNormalization } = require(normalizePath);
const { storeChapters } = require(chaptersPath);
const { storeScenes } = require(scenesPath);
const { storeEntities } = require(entitiesPath);
const { createProfileFromEntity, getCharacterFromEntity, resolveEntitySource } = require(bridgePath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function buildChain(text) {
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, text);
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  await storeNormalization(projectRoot, record.manuscriptId);
  await storeChapters(projectRoot, record.manuscriptId);
  await storeScenes(projectRoot, record.manuscriptId);
  const entities = await storeEntities(projectRoot, record.manuscriptId);
  return { record, entities };
}

describe("S4.6 entity → character bridge", () => {
  it("creates a profile from an entity with only the name copied", async () => {
    const { entities } = await buildChain("# One\n\nRobby met ARKNAD. Robby smiled.");
    const robby = entities.find((e) => e.name === "Robby");
    expect(robby).toBeTruthy();
    const profile = await createProfileFromEntity(projectRoot, robby.entityId);
    expect(profile.name).toBe("Robby");
    expect(profile.sourceEntityId).toBe(robby.entityId);
    for (const field of ["description", "physicalAppearance", "age", "personality", "clothing", "equipment", "distinguishingFeatures", "relationships", "timeline"]) {
      expect(profile[field]).toBe("");
    }
    expect(await getCharacterFromEntity(projectRoot, robby.entityId)).toMatchObject({ name: "Robby" });
    expect(await getCharacterFromEntity(projectRoot, "missing")).toBeNull();
  });

  it("an entity never spawns two profiles", async () => {
    const { entities } = await buildChain("# One\n\nRobby met ARKNAD. Robby waved. ARKNAD watched.");
    const robby = entities.find((e) => e.name === "Robby");
    await createProfileFromEntity(projectRoot, robby.entityId);
    await expect(createProfileFromEntity(projectRoot, robby.entityId)).rejects.toMatchObject({ code: "DUPLICATE_SOURCE" });
    // A different entity still links fine.
    const arknad = entities.find((e) => e.name === "ARKNAD");
    const twin = await createProfileFromEntity(projectRoot, arknad.entityId);
    expect(twin.name).toBe("ARKNAD");
  });

  it("unknown entities reject with typed errors", async () => {
    await expect(createProfileFromEntity(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(resolveEntitySource(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the profile's source resolves to exact bytes", async () => {
    const text = "# One\n\nRobby met ARKNAD. Robby smiled.";
    const { entities } = await buildChain(text);
    const robby = entities.find((e) => e.name === "Robby");
    const resolved = await resolveEntitySource(projectRoot, robby.entityId);
    expect(resolved.entity.entityId).toBe(robby.entityId);
    expect(resolved.normalizedText).toBe("Robby");
    expect(resolved.originalText.replace(/\r\n/g, "\n")).toBe("Robby");
    expect(resolved.originalBytes.equals(Buffer.from("Robby", "utf8"))).toBe(true);
  });

  it("migration v15 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(15);
    } finally {
      db.close();
    }
  });
});
