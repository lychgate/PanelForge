// S5.7 Entity → location/object bridge tests.
//
// Proves the spec acceptance: profiles keep resolvable links to
// their source spans; an entity never spawns two profiles; fields
// outside the name start empty.
//
// - createLocationFromEntity / createObjectFromEntity copy only
//   the name; all other fields are "" (no fabrication).
// - second creation from the same entity rejects DUPLICATE_SOURCE.
// - unknown entities reject; get*FromEntity round-trips.
// - resolveEntitySource (S4.6) returns exact bytes.
//
// Imported from the built `out/node/core/project/location-object-bridge.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bridgePath = path.join(root, "out/node/core/project/location-object-bridge.js");
if (!fs.existsSync(bridgePath)) {
  throw new Error("Missing out/node/core/project/location-object-bridge.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");
const scenesPath = path.join(root, "out/node/core/project/scenes.js");
const entitiesPath = path.join(root, "out/node/core/project/entities.js");
const s46Path = path.join(root, "out/node/core/project/entity-bridge.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { storeNormalization } = require(normalizePath);
const { storeChapters } = require(chaptersPath);
const { storeScenes } = require(scenesPath);
const { storeEntities } = require(entitiesPath);
const { resolveEntitySource } = require(s46Path);
const { createLocationFromEntity, createObjectFromEntity, getLocationFromEntity, getObjectFromEntity } = require(bridgePath);

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

describe("S5.7 entity → location/object bridge", () => {
  it("creates a location profile from an entity with only the name copied", async () => {
    const { entities } = await buildChain("# One\n\nRobby met ARKNAD in Ravenholt. Robby waved. Ravenholt stood.");
    const ravenholt = entities.find((e) => e.name === "Ravenholt");
    expect(ravenholt).toBeTruthy();
    const profile = await createLocationFromEntity(projectRoot, ravenholt.entityId);
    expect(profile.name).toBe("Ravenholt");
    for (const field of ["architecture", "geography", "layout", "lighting", "timeOfDay", "weather", "materials", "colorPalette", "damageStates", "historicalVariations"]) {
      expect(profile[field]).toBe("");
    }
    expect(await getLocationFromEntity(projectRoot, ravenholt.entityId)).toMatchObject({ name: "Ravenholt" });
    expect(await getLocationFromEntity(projectRoot, "missing")).toBeNull();
  });

  it("creates an object profile from an entity with only the name copied", async () => {
    const { entities } = await buildChain("# One\n\nSilver Compass glowed. Robby polished the Silver Compass. Robby waved.");
    const compass = entities.find((e) => e.name === "Silver Compass");
    expect(compass).toBeTruthy();
    const profile = await createObjectFromEntity(projectRoot, compass.entityId);
    expect(profile.name).toBe("Silver Compass");
    for (const field of ["description", "dimensions", "materials", "appearance", "damageStates", "category"]) {
      expect(profile[field]).toBe("");
    }
    expect(await getObjectFromEntity(projectRoot, compass.entityId)).toMatchObject({ name: "Silver Compass" });
    expect(await getObjectFromEntity(projectRoot, "missing")).toBeNull();
  });

  it("an entity never spawns two profiles in the same studio", async () => {
    const { entities } = await buildChain("# One\n\nRobby met ARKNAD in Ravenholt. Robby waved. Ravenholt stood.");
    const ravenholt = entities.find((e) => e.name === "Ravenholt");
    await createLocationFromEntity(projectRoot, ravenholt.entityId);
    await expect(createLocationFromEntity(projectRoot, ravenholt.entityId)).rejects.toMatchObject({ code: "DUPLICATE_SOURCE" });
    // A different entity still links fine.
    const arknad = entities.find((e) => e.name === "ARKNAD");
    expect((await createLocationFromEntity(projectRoot, arknad.entityId)).name).toBe("ARKNAD");
  });

  it("unknown entities reject with typed errors", async () => {
    await expect(createLocationFromEntity(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createObjectFromEntity(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the profile's source resolves to exact bytes", async () => {
    const { entities } = await buildChain("# One\n\nRobby met ARKNAD in Ravenholt. Robby waved. Ravenholt stood.");
    const ravenholt = entities.find((e) => e.name === "Ravenholt");
    const resolved = await resolveEntitySource(projectRoot, ravenholt.entityId);
    expect(resolved.normalizedText).toBe("Ravenholt");
    expect(resolved.originalText.replace(/\r\n/g, "\n")).toBe("Ravenholt");
    expect(resolved.entity.entityId).toBe(ravenholt.entityId);
  });

  it("migration v26 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(26);
    } finally {
      db.close();
    }
  });
});
