// S5.4 Object profile records tests.
//
// Proves the spec acceptance: profiles create, read back, update,
// and delete with typed errors; name validation; identity stability.
//
// - create stores all §8.6 fields; omitted fields default to "".
// - blank or non-string names reject with typed errors.
// - update merges partially; identity and createdAt never change.
// - delete removes; unknown IDs return null / reject typed.
//
// Imported from the built `out/node/core/project/objects.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const objectsPath = path.join(root, "out/node/core/project/objects.js");
if (!fs.existsSync(objectsPath)) {
  throw new Error("Missing out/node/core/project/objects.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createObject, getObject, listObjects, updateObject, deleteObject } = require(objectsPath);

let projectRoot;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
});

describe("S5.4 object profile records", () => {
  it("create stores all §8.6 fields with trimmed name and stable identity", async () => {
    const profile = await createObject(projectRoot, {
      name: "  OmniPad  ",
      description: "Space-pirate boarding computer",
      dimensions: "Palm-sized",
      materials: "Bonded alloy",
      appearance: "Brushed steel, one glowing seam",
      damageStates: "Scratch on housing",
      category: "technology",
    });
    expect(profile.name).toBe("OmniPad");
    expect(profile.description).toBe("Space-pirate boarding computer");
    expect(profile.dimensions).toBe("Palm-sized");
    expect(profile.materials).toBe("Bonded alloy");
    expect(profile.appearance).toBe("Brushed steel, one glowing seam");
    expect(profile.damageStates).toBe("Scratch on housing");
    expect(profile.category).toBe("technology");
    expect(profile.objectId).toBeTruthy();
    expect(profile.createdAt).toBeTruthy();
    expect(await getObject(projectRoot, profile.objectId)).toMatchObject({ name: "OmniPad", category: "technology" });
    expect(await getObject(projectRoot, "missing")).toBeNull();
  });

  it("omitted fields default to empty strings", async () => {
    const profile = await createObject(projectRoot, { name: "Heirloom compass" });
    for (const field of ["description", "dimensions", "materials", "appearance", "damageStates", "category"]) {
      expect(profile[field]).toBe("");
    }
  });

  it("blank or malformed names reject with typed errors", async () => {
    await expect(createObject(projectRoot, { name: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createObject(projectRoot, { name: "   " })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const profile = await createObject(projectRoot, { name: "OmniPad" });
    await expect(createObject(projectRoot, { name: "Compass", dimensions: 5 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(updateObject(projectRoot, profile.objectId, { name: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("update merges partially; identity and createdAt never change", async () => {
    const profile = await createObject(projectRoot, { name: "OmniPad", materials: "Bonded alloy" });
    const updated = await updateObject(projectRoot, profile.objectId, { damageStates: "Housing dented", category: "equipment" });
    expect(updated.objectId).toBe(profile.objectId);
    expect(updated.createdAt).toBe(profile.createdAt);
    expect(updated.damageStates).toBe("Housing dented");
    expect(updated.category).toBe("equipment");
    expect(updated.materials).toBe("Bonded alloy");
    expect(updated.updatedAt >= profile.updatedAt).toBe(true);
    await expect(updateObject(projectRoot, "missing", { damageStates: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("list returns creation order; delete removes and rejects unknown IDs", async () => {
    const first = await createObject(projectRoot, { name: "OmniPad" });
    await createObject(projectRoot, { name: "Heirloom compass" });
    expect((await listObjects(projectRoot)).map((p) => p.name)).toEqual(["OmniPad", "Heirloom compass"]);
    await expect(deleteObject(projectRoot, first.objectId)).resolves.toBeUndefined();
    expect(await getObject(projectRoot, first.objectId)).toBeNull();
    expect((await listObjects(projectRoot)).map((p) => p.name)).toEqual(["Heirloom compass"]);
    await expect(deleteObject(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(23);
    } finally {
      db.close();
    }
  });
});
