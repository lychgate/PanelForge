// S4.4 Reference completeness scoring tests.
//
// Proves the spec acceptance: fixture versions score per tier;
// incomplete versions list missing slots explicitly; complete
// versions pass silently.
//
// - no references: every tier fails, missing names the gap.
// - Basic passes with one portrait; Recommended names front/expression.
// - Full requires side/rear/2nd expression/pose/clothing/equipment.
// - overall names the highest passed tier; unknown versions reject.
//
// Imported from the built `out/node/core/project/completeness.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const completenessPath = path.join(root, "out/node/core/project/completeness.js");
if (!fs.existsSync(completenessPath)) {
  throw new Error("Missing out/node/core/project/completeness.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const refsPath = path.join(root, "out/node/core/project/version-references.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { importAsset } = require(registryPath);
const { associateReference } = require(refsPath);
const { scoreCompleteness, DEFAULT_TIERS } = require(completenessPath);

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

async function makeAsset(name, content) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, content, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `characters/robby/references/${name}`,
  });
}

async function add(versionId, slot, name) {
  const asset = await makeAsset(name, `pixels-${name}`);
  return associateReference(projectRoot, { versionId, assetId: asset.assetId, slot });
}

describe("S4.4 reference completeness scoring", () => {
  it("a version with no references fails every tier, missing named", async () => {
    const score = await scoreCompleteness(projectRoot, version7.versionId);
    expect(score.overall).toBeNull();
    expect(score.tiers.map((t) => t.tier)).toEqual(["basic", "recommended", "full"]);
    expect(score.tiers[0]).toMatchObject({ passed: false, missing: ["any reference"] });
    expect(score.tiers[1].missing).toContain("portrait");
    expect(score.tiers[1].missing).toContain("front");
    expect(score.tiers[1].missing).toContain("expression");
    expect(score.tiers[2].passed).toBe(false);
    expect(score.tiers[2].missing.length).toBeGreaterThan(0);
  });

  it("one portrait passes Basic; Recommended names the gaps", async () => {
    await add(version7.versionId, "portrait", "portrait.png");
    const score = await scoreCompleteness(projectRoot, version7.versionId);
    expect(score.tiers[0].passed).toBe(true);
    expect(score.overall).toBe("basic");
    expect(score.tiers[1].passed).toBe(false);
    expect([...score.tiers[1].missing].sort()).toEqual(["expression", "front"]);
    expect(score.tiers[1].missing.length).toBe(2);
    expect(score.tiers[1].present).toEqual(["portrait"]);
  });

  it("portrait + front + expression passes Recommended", async () => {
    await add(version7.versionId, "portrait", "portrait.png");
    await add(version7.versionId, "front", "front.png");
    await add(version7.versionId, "expression", "shocked.png");
    const score = await scoreCompleteness(projectRoot, version7.versionId);
    expect(score.tiers[1].passed).toBe(true);
    expect(score.overall).toBe("recommended");
    // Full still needs side/rear/second expression/pose/clothing/equipment.
    expect(score.tiers[2].missing).toContain("side");
    expect(score.tiers[2].missing).toContain("rear");
    expect(score.tiers[2].missing).toContain("expression (need 2, have 1)");
    expect(score.tiers[2].missing).toContain("pose");
    expect(score.tiers[2].missing).toContain("clothing");
    expect(score.tiers[2].missing).toContain("equipment");
  });

  it("the full set passes silently with overall full", async () => {
    await add(version7.versionId, "portrait", "portrait.png");
    await add(version7.versionId, "front", "front.png");
    await add(version7.versionId, "side", "side.png");
    await add(version7.versionId, "rear", "rear.png");
    await add(version7.versionId, "expression", "shocked.png");
    await add(version7.versionId, "expression", "grinning.png");
    await add(version7.versionId, "pose", "crouch.png");
    await add(version7.versionId, "clothing", "jacket.png");
    await add(version7.versionId, "equipment", "omnipad.png");
    const score = await scoreCompleteness(projectRoot, version7.versionId);
    expect(score.tiers.every((t) => t.passed)).toBe(true);
    expect(score.tiers.every((t) => t.missing.length === 0)).toBe(true);
    expect(score.overall).toBe("full");
    // Defaults match §8.4.
    expect(DEFAULT_TIERS.recommended.map((r) => r.slot)).toEqual(["portrait", "front", "expression"]);
    expect(DEFAULT_TIERS.full.some((r) => r.slot === "expression" && r.min === 2)).toBe(true);
  });

  it("unknown versions reject with typed errors", async () => {
    await expect(scoreCompleteness(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
