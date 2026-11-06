// S5.3 Location reference association tests.
//
// Proves the spec acceptance: assets associate to variations by
// slot; unknown assets rejected; slot queries return exact sets.
//
// - associate binds registry assets to a variation under one of the
//   eight §8.5 slot kinds; unknown assets/slots/variations reject.
// - list-by-variation and list-by-slot return exact sets.
// - remove unlinks; unknown IDs reject.
// - one asset may serve multiple variations/slots.
//
// Imported from the built `out/node/core/project/location-references.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const refsPath = path.join(root, "out/node/core/project/location-references.js");
if (!fs.existsSync(refsPath)) {
  throw new Error("Missing out/node/core/project/location-references.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const variationsPath = path.join(root, "out/node/core/project/location-variations.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createLocation } = require(locationsPath);
const { createVariation } = require(variationsPath);
const { importAsset } = require(registryPath);
const { associateReference, getReference, listReferencesByVariation, listReferencesBySlot, removeReference } = require(refsPath);

let projectRoot;
let scratch;
let dawn;
let winter;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const ravenholt = await createLocation(projectRoot, { name: "Ravenholt" });
  dawn = await createVariation(projectRoot, { locationId: ravenholt.locationId, label: "Ravenholt, dawn" });
  winter = await createVariation(projectRoot, { locationId: ravenholt.locationId, label: "Ravenholt, winter, damaged" });
});

async function makeAsset(name, content) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, content, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `locations/ravenholt/references/${name}`,
  });
}

describe("S5.3 location reference association", () => {
  it("associates registry assets to variations by slot", async () => {
    const exterior = await makeAsset("exterior.png", "pixels-exterior");
    const overview = await makeAsset("overview.png", "pixels-overview");
    const ref1 = await associateReference(projectRoot, { variationId: dawn.variationId, assetId: exterior.assetId, slot: "exterior" });
    const ref2 = await associateReference(projectRoot, { variationId: dawn.variationId, assetId: overview.assetId, slot: "overview" });
    expect(ref1.slot).toBe("exterior");
    expect(await getReference(projectRoot, ref1.referenceId)).toMatchObject({ assetId: exterior.assetId, variationId: dawn.variationId });
    expect(await getReference(projectRoot, "missing")).toBeNull();
    expect((await listReferencesByVariation(projectRoot, dawn.variationId)).map((r) => r.slot)).toEqual(["exterior", "overview"]);
    expect(await listReferencesBySlot(projectRoot, dawn.variationId, "exterior")).toHaveLength(1);
    expect(await listReferencesBySlot(projectRoot, dawn.variationId, "night")).toHaveLength(0);
    expect(await listReferencesByVariation(projectRoot, winter.variationId)).toHaveLength(0);
  });

  it("unknown assets, slots, and variations reject with typed errors", async () => {
    const asset = await makeAsset("exterior.png", "pixels");
    await expect(associateReference(projectRoot, { variationId: dawn.variationId, assetId: "missing", slot: "exterior" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(associateReference(projectRoot, { variationId: dawn.variationId, assetId: asset.assetId, slot: "aerial" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(associateReference(projectRoot, { variationId: "missing", assetId: asset.assetId, slot: "exterior" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listReferencesBySlot(projectRoot, dawn.variationId, "aerial")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("all eight §8.5 slots validate", async () => {
    const asset = await makeAsset("sheet.png", "pixels");
    for (const slot of ["exterior", "interior", "overview", "detail", "day", "night", "weather", "damaged"]) {
      const ref = await associateReference(projectRoot, { variationId: dawn.variationId, assetId: asset.assetId, slot });
      expect(ref.slot).toBe(slot);
    }
    expect(await listReferencesByVariation(projectRoot, dawn.variationId)).toHaveLength(8);
  });

  it("one asset may serve multiple variations and slots", async () => {
    const asset = await makeAsset("shared.png", "pixels");
    await associateReference(projectRoot, { variationId: dawn.variationId, assetId: asset.assetId, slot: "damaged" });
    await associateReference(projectRoot, { variationId: winter.variationId, assetId: asset.assetId, slot: "damaged" });
    expect(await listReferencesByVariation(projectRoot, dawn.variationId)).toHaveLength(1);
    expect(await listReferencesByVariation(projectRoot, winter.variationId)).toHaveLength(1);
  });

  it("remove unlinks one row; unknown IDs reject; migration v22 present", async () => {
    const asset = await makeAsset("exterior.png", "pixels");
    const ref = await associateReference(projectRoot, { variationId: dawn.variationId, assetId: asset.assetId, slot: "exterior" });
    await expect(removeReference(projectRoot, ref.referenceId)).resolves.toBeUndefined();
    expect(await getReference(projectRoot, ref.referenceId)).toBeNull();
    expect(await listReferencesByVariation(projectRoot, dawn.variationId)).toHaveLength(0);
    await expect(removeReference(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(22);
    } finally {
      db.close();
    }
  });
});
