// S5.2 Location variations tests.
//
// Proves the spec acceptance: one location holds multiple
// variations; labels unique per location; foreign keys enforce
// location ownership.
//
// - create stores label + overrides; unknown locations reject.
// - duplicate labels (case-insensitive) reject with DUPLICATE_LABEL.
// - blank labels reject; overrides default to "" (inherit).
// - update merges partially; identity/createdAt stable; collisions reject.
// - list filters per location; delete removes; unknown IDs reject.
//
// Imported from the built `out/node/core/project/location-variations.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const variationsPath = path.join(root, "out/node/core/project/location-variations.js");
if (!fs.existsSync(variationsPath)) {
  throw new Error("Missing out/node/core/project/location-variations.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createLocation, getLocation } = require(locationsPath);
const { createVariation, getVariation, listVariations, updateVariation, deleteVariation } = require(variationsPath);

let projectRoot;
let ravenholt;
let pristine;
let damaged;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  ravenholt = await createLocation(projectRoot, { name: "Ravenholt", lighting: "Dusty shafts", weather: "Mist" });
  pristine = await createVariation(projectRoot, { locationId: ravenholt.locationId, label: "Ravenholt, dawn" });
  damaged = await createVariation(projectRoot, {
    locationId: ravenholt.locationId,
    label: "Ravenholt, winter, damaged",
    timeOfDay: "Dusk",
    weather: "Snow",
    damageStates: "Roof caved in wing three",
  });
});

describe("S5.2 location variations", () => {
  it("one location holds multiple identifiable variations", async () => {
    expect(pristine.label).toBe("Ravenholt, dawn");
    expect(damaged.label).toBe("Ravenholt, winter, damaged");
    expect(damaged.timeOfDay).toBe("Dusk");
    expect(damaged.weather).toBe("Snow");
    expect(pristine.variationId).not.toBe(damaged.variationId);
    expect(await getVariation(projectRoot, pristine.variationId)).toMatchObject({ label: "Ravenholt, dawn" });
    expect(await getVariation(projectRoot, "missing")).toBeNull();
    const listed = await listVariations(projectRoot, ravenholt.locationId);
    expect(listed.map((v) => v.label)).toEqual(["Ravenholt, dawn", "Ravenholt, winter, damaged"]);
  });

  it("labels are unique per location, case-insensitive", async () => {
    await expect(createVariation(projectRoot, { locationId: ravenholt.locationId, label: "  RAVENHOLT, DAWN  " })).rejects.toMatchObject({
      code: "DUPLICATE_LABEL",
    });
    // The same label under a different location is fine.
    const silvercreek = await createLocation(projectRoot, { name: "Silvercreek" });
    const twin = await createVariation(projectRoot, { locationId: silvercreek.locationId, label: "Ravenholt, dawn" });
    expect(twin.locationId).toBe(silvercreek.locationId);
  });

  it("unknown locations and blank labels reject with typed errors", async () => {
    await expect(createVariation(projectRoot, { locationId: "missing", label: "Ghost" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createVariation(projectRoot, { locationId: ravenholt.locationId, label: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariation(projectRoot, { locationId: ravenholt.locationId, label: "   " })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariation(projectRoot, { locationId: ravenholt.locationId, label: "X", weather: 5 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
  });

  it("overrides default to inherit; update merges and keeps identity", async () => {
    expect(pristine.lighting).toBe("");
    expect(pristine.weather).toBe("");
    const updated = await updateVariation(projectRoot, pristine.variationId, { weather: "Clear" });
    expect(updated.variationId).toBe(pristine.variationId);
    expect(updated.locationId).toBe(ravenholt.locationId);
    expect(updated.createdAt).toBe(pristine.createdAt);
    expect(updated.weather).toBe("Clear");
    expect(updated.label).toBe("Ravenholt, dawn");
    // The profile itself is untouched by variation overrides.
    expect((await getLocation(projectRoot, ravenholt.locationId)).weather).toBe("Mist");
    await expect(updateVariation(projectRoot, "missing", { weather: "Clear" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rename collisions reject; delete removes; migration v21 present", async () => {
    await expect(updateVariation(projectRoot, damaged.variationId, { label: "ravenholt, DAWN" })).rejects.toMatchObject({ code: "DUPLICATE_LABEL" });
    await expect(deleteVariation(projectRoot, pristine.variationId)).resolves.toBeUndefined();
    expect(await getVariation(projectRoot, pristine.variationId)).toBeNull();
    expect((await listVariations(projectRoot, ravenholt.locationId)).map((v) => v.label)).toEqual(["Ravenholt, winter, damaged"]);
    await expect(deleteVariation(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(21);
    } finally {
      db.close();
    }
  });
});
