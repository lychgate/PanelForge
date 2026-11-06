// S4.10 Reference comparison tests.
//
// Proves the spec acceptance: comparison names slot differences
// and field diffs exactly; identical versions compare clean.
//
// - slot-by-slot reference sets from both versions; onlyIn names
//   the richer side; same slots compare identical.
// - effective field diffs (override-or-inherited) reported exactly.
// - approval states reported for both.
// - cross-character pairs reject; unknown versions reject.
//
// Imported from the built `out/node/core/project/version-comparison.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const comparisonPath = path.join(root, "out/node/core/project/version-comparison.js");
if (!fs.existsSync(comparisonPath)) {
  throw new Error("Missing out/node/core/project/version-comparison.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const refsPath = path.join(root, "out/node/core/project/version-references.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { importAsset } = require(registryPath);
const { associateReference } = require(refsPath);
const { setApproval } = require(approvalPath);
const { compareVersions } = require(comparisonPath);

let projectRoot;
let scratch;
let robby;
let v7;
let v12;
let miraVersion;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  robby = await createCharacter(projectRoot, { name: "Robby", age: "8", clothing: "Adventurer outfit" });
  v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7", age: "7" });
  v12 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 12", age: "12", clothing: "Pirate duster" });
  const mira = await createCharacter(projectRoot, { name: "Mira" });
  miraVersion = await createVersion(projectRoot, { characterId: mira.characterId, label: "Mira, 30" });
});

async function makeAsset(name) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, `pixels-${name}`, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `characters/robby/references/${name}`,
  });
}

async function add(versionId, slot, name) {
  const asset = await makeAsset(name);
  await associateReference(projectRoot, { versionId, assetId: asset.assetId, slot });
  return asset.assetId;
}

describe("S4.10 reference comparison", () => {
  it("names slot differences and field diffs exactly", async () => {
    const portrait7 = await add(v7.versionId, "portrait", "portrait7.png");
    const portrait12 = await add(v12.versionId, "portrait", "portrait12.png");
    await add(v12.versionId, "front", "front12.png");
    const both = await compareVersions(projectRoot, v7.versionId, v12.versionId);
    expect(both.a.label).toBe("Robert, age 7");
    expect(both.b.label).toBe("Robert, age 12");
    const portrait = both.slots.find((s) => s.slot === "portrait");
    expect(portrait.a).toEqual([portrait7]);
    expect(portrait.b).toEqual([portrait12]);
    expect(portrait.same).toBe(false);
    const front = both.slots.find((s) => s.slot === "front");
    expect(front.onlyIn).toBe("b");
    expect(front.same).toBe(false);
    const expression = both.slots.find((s) => s.slot === "expression");
    expect(expression.same).toBe(true);
    expect(expression.onlyIn).toBeNull();
    expect(both.slots).toHaveLength(8);
    expect(both.fieldDiffs).toContainEqual({ field: "age", a: "7", b: "12" });
    expect(both.fieldDiffs).toContainEqual({ field: "clothing", a: "Adventurer outfit", b: "Pirate duster" });
    expect(both.identical).toBe(false);
  });

  it("approval states reported; identical versions compare clean", async () => {
    await setApproval(projectRoot, v7.versionId, "approved", "looks right");
    const same = await compareVersions(projectRoot, v7.versionId, v7.versionId);
    expect(same.identical).toBe(true);
    expect(same.a.approval).toBe("approved");
    expect(same.fieldDiffs).toEqual([]);
    const other = await compareVersions(projectRoot, v7.versionId, v12.versionId);
    expect(other.a.approval).toBe("approved");
    expect(other.b.approval).toBe("pending");
  });

  it("cross-character pairs and unknown versions reject", async () => {
    await expect(compareVersions(projectRoot, v7.versionId, miraVersion.versionId)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(compareVersions(projectRoot, v7.versionId, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(compareVersions(projectRoot, "missing", v12.versionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("comparison mutates nothing", async () => {
    await add(v7.versionId, "portrait", "portrait7.png");
    const before = await compareVersions(projectRoot, v7.versionId, v12.versionId);
    const after = await compareVersions(projectRoot, v7.versionId, v12.versionId);
    expect(after).toEqual(before);
    const { listReferencesByVersion } = require(refsPath);
    expect(await listReferencesByVersion(projectRoot, v12.versionId)).toHaveLength(0);
  });
});
