// S4.3 Reference asset association tests.
//
// Proves the spec acceptance: assets associate to versions by slot;
// unknown assets rejected; slot queries return exact sets.
//
// - associate binds registry assets to a version under one of the
//   eight §8.4 slot kinds; unknown assets/slots/versions reject.
// - list-by-version and list-by-slot return exact sets.
// - remove unlinks; unknown IDs reject.
// - one asset may serve multiple versions/slots.
//
// Imported from the built `out/node/core/project/version-references.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const refsPath = path.join(root, "out/node/core/project/version-references.js");
if (!fs.existsSync(refsPath)) {
  throw new Error("Missing out/node/core/project/version-references.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { importAsset } = require(registryPath);
const { associateReference, getReference, listReferencesByVersion, listReferencesBySlot, removeReference } = require(refsPath);

let projectRoot;
let scratch;
let version7;
let version12;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const robby = await createCharacter(projectRoot, { name: "Robby" });
  version7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7" });
  version12 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 12" });
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

describe("S4.3 reference asset association", () => {
  it("associates registry assets to versions by slot", async () => {
    const portrait = await makeAsset("portrait.png", "pixels-portrait");
    const front = await makeAsset("front.png", "pixels-front");
    const ref1 = await associateReference(projectRoot, { versionId: version7.versionId, assetId: portrait.assetId, slot: "portrait" });
    const ref2 = await associateReference(projectRoot, { versionId: version7.versionId, assetId: front.assetId, slot: "front" });
    expect(ref1.slot).toBe("portrait");
    expect(ref2.slot).toBe("front");
    expect(await getReference(projectRoot, ref1.referenceId)).toMatchObject({ assetId: portrait.assetId, versionId: version7.versionId });
    expect(await getReference(projectRoot, "missing")).toBeNull();
    const byVersion = await listReferencesByVersion(projectRoot, version7.versionId);
    expect(byVersion.map((r) => r.slot)).toEqual(["portrait", "front"]);
    expect(await listReferencesBySlot(projectRoot, version7.versionId, "portrait")).toHaveLength(1);
    expect(await listReferencesBySlot(projectRoot, version7.versionId, "rear")).toHaveLength(0);
    expect(await listReferencesByVersion(projectRoot, version12.versionId)).toHaveLength(0);
  });

  it("unknown assets, slots, and versions reject with typed errors", async () => {
    const asset = await makeAsset("portrait.png", "pixels");
    await expect(associateReference(projectRoot, { versionId: version7.versionId, assetId: "missing", slot: "portrait" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(associateReference(projectRoot, { versionId: version7.versionId, assetId: asset.assetId, slot: "splash" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(associateReference(projectRoot, { versionId: "missing", assetId: asset.assetId, slot: "portrait" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listReferencesBySlot(projectRoot, version7.versionId, "splash")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("all eight §8.4 slots validate", async () => {
    const asset = await makeAsset("sheet.png", "pixels");
    for (const slot of ["portrait", "front", "side", "rear", "expression", "pose", "clothing", "equipment"]) {
      const ref = await associateReference(projectRoot, { versionId: version7.versionId, assetId: asset.assetId, slot });
      expect(ref.slot).toBe(slot);
    }
    expect(await listReferencesByVersion(projectRoot, version7.versionId)).toHaveLength(8);
    for (const slot of ["portrait", "front", "side", "rear", "expression", "pose", "clothing", "equipment"]) {
      expect(await listReferencesBySlot(projectRoot, version7.versionId, slot)).toHaveLength(1);
    }
  });

  it("one asset may serve multiple versions and slots", async () => {
    const asset = await makeAsset("shared.png", "pixels");
    await associateReference(projectRoot, { versionId: version7.versionId, assetId: asset.assetId, slot: "expression" });
    await associateReference(projectRoot, { versionId: version12.versionId, assetId: asset.assetId, slot: "expression" });
    expect(await listReferencesByVersion(projectRoot, version7.versionId)).toHaveLength(1);
    expect(await listReferencesByVersion(projectRoot, version12.versionId)).toHaveLength(1);
  });

  it("remove unlinks one row; unknown IDs reject; migration v13 present", async () => {
    const asset = await makeAsset("portrait.png", "pixels");
    const ref = await associateReference(projectRoot, { versionId: version7.versionId, assetId: asset.assetId, slot: "portrait" });
    await expect(removeReference(projectRoot, ref.referenceId)).resolves.toBeUndefined();
    expect(await getReference(projectRoot, ref.referenceId)).toBeNull();
    expect(await listReferencesByVersion(projectRoot, version7.versionId)).toHaveLength(0);
    await expect(removeReference(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(13);
    } finally {
      db.close();
    }
  });
});
