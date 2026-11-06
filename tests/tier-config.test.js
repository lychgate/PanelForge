// S4.5 MVRS tier config tests.
//
// Proves the spec acceptance: changing a tier's requirements
// changes scoring on the same fixture; defaults equal §8.4.
//
// - seeded config matches the §8.4 defaults exactly.
// - setTierRequirement edits validation + storage; scorer follows.
// - removeTierRequirement drops a requirement; scorer follows.
// - resetTierConfig restores the defaults.
// - invalid tiers/slots/counts reject typed.
//
// Imported from the built `out/node/core/project/tier-config.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const tierConfigPath = path.join(root, "out/node/core/project/tier-config.js");
if (!fs.existsSync(tierConfigPath)) {
  throw new Error("Missing out/node/core/project/tier-config.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const refsPath = path.join(root, "out/node/core/project/version-references.js");
const completenessPath = path.join(root, "out/node/core/project/completeness.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { importAsset } = require(registryPath);
const { associateReference } = require(refsPath);
const { scoreCompleteness, DEFAULT_TIERS } = require(completenessPath);
const { getTierConfig, setTierRequirement, removeTierRequirement, resetTierConfig } = require(tierConfigPath);

let projectRoot;
let scratch;
let version7;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const robby = await createCharacter(projectRoot, { name: "Robby" });
  version7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7" });
});

async function addPortrait() {
  const source = path.join(scratch, "portrait.png");
  fs.writeFileSync(source, "pixels", "utf8");
  const asset = await importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: "characters/robby/references/portrait.png",
  });
  await associateReference(projectRoot, { versionId: version7.versionId, assetId: asset.assetId, slot: "portrait" });
}

describe("S4.5 MVRS tier config", () => {
  const sorted = (rows) => [...rows].sort((a, b) => a.slot.localeCompare(b.slot));

  it("seeded config matches the §8.4 defaults exactly", async () => {
    const config = await getTierConfig(projectRoot);
    expect(config.basic).toEqual([...DEFAULT_TIERS.basic]);
    expect(sorted(config.recommended)).toEqual(sorted(DEFAULT_TIERS.recommended));
    expect(sorted(config.full)).toEqual(sorted(DEFAULT_TIERS.full));
    expect(sorted(config.recommended).map((r) => r.slot)).toEqual(["expression", "front", "portrait"]);
  });

  it("changing a tier's requirements changes scoring on the same fixture", async () => {
    await addPortrait();
    expect((await scoreCompleteness(projectRoot, version7.versionId)).overall).toBe("basic");
    // Owner relaxes Recommended to portrait-only: the same fixture now passes.
    await setTierRequirement(projectRoot, "recommended", "front", 0);
    await removeTierRequirement(projectRoot, "recommended", "expression");
    const score = await scoreCompleteness(projectRoot, version7.versionId);
    expect(score.tiers[1].passed).toBe(true);
    expect(score.overall).toBe("recommended");
  });

  it("reset restores the §8.4 defaults", async () => {
    await setTierRequirement(projectRoot, "full", "expression", 5);
    const reset = await resetTierConfig(projectRoot);
    expect(sorted(reset.recommended)).toEqual(sorted(DEFAULT_TIERS.recommended));
    expect(sorted(reset.full)).toEqual(sorted(DEFAULT_TIERS.full));
    expect(sorted((await getTierConfig(projectRoot)).full)).toEqual(sorted(DEFAULT_TIERS.full));
  });

  it("invalid tiers, slots, and counts reject with typed errors", async () => {
    await expect(setTierRequirement(projectRoot, "mega", "portrait", 1)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setTierRequirement(projectRoot, "basic", "splash", 1)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setTierRequirement(projectRoot, "basic", "portrait", -1)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setTierRequirement(projectRoot, "basic", "portrait", 1.5)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setTierRequirement(projectRoot, "basic", "portrait", 21)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(removeTierRequirement(projectRoot, "mega", "portrait")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("migration v14 present; duplicate sets replace", async () => {
    await setTierRequirement(projectRoot, "basic", "expression", 3);
    const config = await getTierConfig(projectRoot);
    expect(config.basic).toEqual([{ slot: "expression", min: 3 }]);
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(14);
    } finally {
      db.close();
    }
  });
});
