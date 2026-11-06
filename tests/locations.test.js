// S5.1 Location profile records tests.
//
// Proves the spec acceptance: profiles create, read back, update,
// and delete with typed errors; name validation; identity stability.
//
// - create stores all §8.5 fields; omitted fields default to "".
// - blank or non-string names reject with typed errors.
// - update merges partially; identity and createdAt never change.
// - delete removes; unknown IDs return null / reject typed.
//
// Imported from the built `out/node/core/project/locations.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
if (!fs.existsSync(locationsPath)) {
  throw new Error("Missing out/node/core/project/locations.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createLocation, getLocation, listLocations, updateLocation, deleteLocation } = require(locationsPath);

let projectRoot;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
});

describe("S5.1 location profile records", () => {
  it("create stores all §8.5 fields with trimmed name and stable identity", async () => {
    const profile = await createLocation(projectRoot, {
      name: "  Ravenholt  ",
      architecture: "Timber ore mill",
      geography: "Valley mines",
      layout: "Mill → tunnels → harbor",
      lighting: "Dusty shafts",
      timeOfDay: "Dawn",
      weather: "Mist",
      materials: "Timber, steel, canvas",
      colorPalette: "Ochre, slate",
      damageStates: "Roof caved in wing three",
      historicalVariations: "Pre-war rigging era",
    });
    expect(profile.name).toBe("Ravenholt");
    expect(profile.architecture).toBe("Timber ore mill");
    expect(profile.damageStates).toBe("Roof caved in wing three");
    expect(profile.historicalVariations).toBe("Pre-war rigging era");
    expect(profile.locationId).toBeTruthy();
    expect(profile.createdAt).toBeTruthy();
    expect(await getLocation(projectRoot, profile.locationId)).toMatchObject({ name: "Ravenholt", weather: "Mist" });
    expect(await getLocation(projectRoot, "missing")).toBeNull();
  });

  it("omitted fields default to empty strings", async () => {
    const profile = await createLocation(projectRoot, { name: "Silvercreek" });
    for (const field of ["architecture", "geography", "layout", "lighting", "timeOfDay", "weather", "materials", "colorPalette", "damageStates", "historicalVariations"]) {
      expect(profile[field]).toBe("");
    }
  });

  it("blank or malformed names reject with typed errors", async () => {
    await expect(createLocation(projectRoot, { name: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createLocation(projectRoot, { name: "   " })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const profile = await createLocation(projectRoot, { name: "Ravenholt" });
    await expect(createLocation(projectRoot, { name: "Silvercreek", weather: 5 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(updateLocation(projectRoot, profile.locationId, { name: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("update merges partially; identity and createdAt never change", async () => {
    const profile = await createLocation(projectRoot, { name: "Ravenholt", weather: "Mist" });
    const updated = await updateLocation(projectRoot, profile.locationId, { weather: "Clear", damageStates: "Wind damage" });
    expect(updated.locationId).toBe(profile.locationId);
    expect(updated.createdAt).toBe(profile.createdAt);
    expect(updated.weather).toBe("Clear");
    expect(updated.damageStates).toBe("Wind damage");
    expect(updated.name).toBe("Ravenholt");
    expect(updated.updatedAt >= profile.updatedAt).toBe(true);
    await expect(updateLocation(projectRoot, "missing", { weather: "Clear" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("list returns creation order; delete removes and rejects unknown IDs", async () => {
    const first = await createLocation(projectRoot, { name: "Ravenholt" });
    await createLocation(projectRoot, { name: "Silvercreek" });
    expect((await listLocations(projectRoot)).map((p) => p.name)).toEqual(["Ravenholt", "Silvercreek"]);
    await expect(deleteLocation(projectRoot, first.locationId)).resolves.toBeUndefined();
    expect(await getLocation(projectRoot, first.locationId)).toBeNull();
    expect((await listLocations(projectRoot)).map((p) => p.name)).toEqual(["Silvercreek"]);
    await expect(deleteLocation(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(20);
    } finally {
      db.close();
    }
  });
});
