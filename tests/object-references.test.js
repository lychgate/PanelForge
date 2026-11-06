// S5.6 Object reference association tests.
//
// Proves the spec acceptance: assets associate to variations by
// slot; unknown assets rejected; slot queries return exact sets.
//
// - associate binds registry assets to a variation under one of the
//   five §8.6 slot kinds; unknown assets/slots/variations reject.
// - list-by-variation and list-by-slot return exact sets.
// - remove unlinks; unknown IDs reject.
// - one asset may serve multiple variations/slots.
//
// Imported from the built `out/node/core/project/object-references.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const refsPath = path.join(root, "out/node/core/project/object-references.js");
if (!fs.existsSync(refsPath)) {
  throw new Error("Missing out/node/core/project/object-references.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const objectsPath = path.join(root, "out/node/core/project/objects.js");
const variationsPath = path.join(root, "out/node/core/project/object-variations.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createObject } = require(objectsPath);
const { createVariation } = require(variationsPath);
const { importAsset } = require(registryPath);
const { associateReference, getReference, listReferencesByVariation, listReferencesBySlot, removeReference } = require(refsPath);

let projectRoot;
let scratch;
let pristine;
let damaged;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const omnipad = await createObject(projectRoot, { name: "OmniPad" });
  pristine = await createVariation(projectRoot, { objectId: omnipad.objectId, label: "OmniPad, pristine" });
  damaged = await createVariation(projectRoot, { objectId: omnipad.objectId, label: "OmniPad, damaged" });
});

async function makeAsset(name, content) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, content, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `objects/omnipad/references/${name}`,
  });
}

describe("S5.6 object reference association", () => {
  it("associates registry assets to variations by slot", async () => {
    const front = await makeAsset("front.png", "pixels-front");
    const detail = await makeAsset("detail.png", "pixels-detail");
    const ref1 = await associateReference(projectRoot, { variationId: pristine.variationId, assetId: front.assetId, slot: "front" });
    const ref2 = await associateReference(projectRoot, { variationId: pristine.variationId, assetId: detail.assetId, slot: "detail" });
    expect(ref1.slot).toBe("front");
    expect(await getReference(projectRoot, ref1.referenceId)).toMatchObject({ assetId: front.assetId, variationId: pristine.variationId });
    expect(await getReference(projectRoot, "missing")).toBeNull();
    expect((await listReferencesByVariation(projectRoot, pristine.variationId)).map((r) => r.slot)).toEqual(["front", "detail"]);
    expect(await listReferencesBySlot(projectRoot, pristine.variationId, "front")).toHaveLength(1);
    expect(await listReferencesBySlot(projectRoot, pristine.variationId, "damaged")).toHaveLength(0);
    expect(await listReferencesByVariation(projectRoot, damaged.variationId)).toHaveLength(0);
  });

  it("unknown assets, slots, and variations reject with typed errors", async () => {
    const asset = await makeAsset("front.png", "pixels");
    await expect(associateReference(projectRoot, { variationId: pristine.variationId, assetId: "missing", slot: "front" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(associateReference(projectRoot, { variationId: pristine.variationId, assetId: asset.assetId, slot: "exploded" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(associateReference(projectRoot, { variationId: "missing", assetId: asset.assetId, slot: "front" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listReferencesBySlot(projectRoot, pristine.variationId, "exploded")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("all five §8.6 slots validate", async () => {
    const asset = await makeAsset("sheet.png", "pixels");
    for (const slot of ["front", "side", "detail", "in-use", "damaged"]) {
      const ref = await associateReference(projectRoot, { variationId: pristine.variationId, assetId: asset.assetId, slot });
      expect(ref.slot).toBe(slot);
    }
    expect(await listReferencesByVariation(projectRoot, pristine.variationId)).toHaveLength(5);
  });

  it("one asset may serve multiple variations and slots", async () => {
    const asset = await makeAsset("shared.png", "pixels");
    await associateReference(projectRoot, { variationId: pristine.variationId, assetId: asset.assetId, slot: "damaged" });
    await associateReference(projectRoot, { variationId: damaged.variationId, assetId: asset.assetId, slot: "damaged" });
    expect(await listReferencesByVariation(projectRoot, pristine.variationId)).toHaveLength(1);
    expect(await listReferencesByVariation(projectRoot, damaged.variationId)).toHaveLength(1);
  });

  it("remove unlinks one row; unknown IDs reject; migration v25 present", async () => {
    const asset = await makeAsset("front.png", "pixels");
    const ref = await associateReference(projectRoot, { variationId: pristine.variationId, assetId: asset.assetId, slot: "front" });
    await expect(removeReference(projectRoot, ref.referenceId)).resolves.toBeUndefined();
    expect(await getReference(projectRoot, ref.referenceId)).toBeNull();
    expect(await listReferencesByVariation(projectRoot, pristine.variationId)).toHaveLength(0);
    await expect(removeReference(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(25);
    } finally {
      db.close();
    }
  });
});
