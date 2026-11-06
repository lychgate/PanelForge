// S5.5 Object variations tests.
//
// Proves the spec acceptance: one object holds multiple
// variations; labels unique per object; foreign keys enforce
// object ownership.
//
// - create stores label + overrides; unknown objects reject.
// - duplicate labels (case-insensitive) reject with DUPLICATE_LABEL.
// - blank labels reject; overrides default to "" (inherit).
// - update merges partially; identity/createdAt stable; collisions reject.
// - list filters per object; delete removes; unknown IDs reject.
//
// Imported from the built `out/node/core/project/object-variations.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const variationsPath = path.join(root, "out/node/core/project/object-variations.js");
if (!fs.existsSync(variationsPath)) {
  throw new Error("Missing out/node/core/project/object-variations.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const objectsPath = path.join(root, "out/node/core/project/objects.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createObject, getObject } = require(objectsPath);
const { createVariation, getVariation, listVariations, updateVariation, deleteVariation } = require(variationsPath);

let projectRoot;
let omnipad;
let pristine;
let damaged;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  omnipad = await createObject(projectRoot, { name: "OmniPad", appearance: "Brushed steel", damageStates: "Scratch on housing" });
  pristine = await createVariation(projectRoot, { objectId: omnipad.objectId, label: "OmniPad, pristine" });
  damaged = await createVariation(projectRoot, {
    objectId: omnipad.objectId,
    label: "OmniPad, damaged",
    appearance: "Brushed steel, one glowing seam",
    damageStates: "Housing dented",
  });
});

describe("S5.5 object variations", () => {
  it("one object holds multiple identifiable variations", async () => {
    expect(pristine.label).toBe("OmniPad, pristine");
    expect(damaged.label).toBe("OmniPad, damaged");
    expect(damaged.damageStates).toBe("Housing dented");
    expect(pristine.variationId).not.toBe(damaged.variationId);
    expect(await getVariation(projectRoot, pristine.variationId)).toMatchObject({ label: "OmniPad, pristine" });
    expect(await getVariation(projectRoot, "missing")).toBeNull();
    const listed = await listVariations(projectRoot, omnipad.objectId);
    expect(listed.map((v) => v.label)).toEqual(["OmniPad, pristine", "OmniPad, damaged"]);
  });

  it("labels are unique per object, case-insensitive", async () => {
    await expect(createVariation(projectRoot, { objectId: omnipad.objectId, label: "  OMNIPAD, PRISTINE  " })).rejects.toMatchObject({
      code: "DUPLICATE_LABEL",
    });
    // The same label under a different object is fine.
    const compass = await createObject(projectRoot, { name: "Heirloom compass" });
    const twin = await createVariation(projectRoot, { objectId: compass.objectId, label: "OmniPad, pristine" });
    expect(twin.objectId).toBe(compass.objectId);
  });

  it("unknown objects and blank labels reject with typed errors", async () => {
    await expect(createVariation(projectRoot, { objectId: "missing", label: "Ghost" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createVariation(projectRoot, { objectId: omnipad.objectId, label: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariation(projectRoot, { objectId: omnipad.objectId, label: "   " })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariation(projectRoot, { objectId: omnipad.objectId, label: "X", appearance: 5 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
  });

  it("overrides default to inherit; update merges and keeps identity", async () => {
    expect(pristine.appearance).toBe("");
    expect(pristine.damageStates).toBe("");
    const updated = await updateVariation(projectRoot, pristine.variationId, { damageStates: "Scuffed seam" });
    expect(updated.variationId).toBe(pristine.variationId);
    expect(updated.objectId).toBe(omnipad.objectId);
    expect(updated.createdAt).toBe(pristine.createdAt);
    expect(updated.damageStates).toBe("Scuffed seam");
    expect(updated.label).toBe("OmniPad, pristine");
    // The profile itself is untouched by variation overrides.
    expect((await getObject(projectRoot, omnipad.objectId)).damageStates).toBe("Scratch on housing");
    await expect(updateVariation(projectRoot, "missing", { damageStates: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rename collisions reject; delete removes; migration v24 present", async () => {
    await expect(updateVariation(projectRoot, damaged.variationId, { label: "omnipad, PRISTINE" })).rejects.toMatchObject({ code: "DUPLICATE_LABEL" });
    await expect(deleteVariation(projectRoot, pristine.variationId)).resolves.toBeUndefined();
    expect(await getVariation(projectRoot, pristine.variationId)).toBeNull();
    expect((await listVariations(projectRoot, omnipad.objectId)).map((v) => v.label)).toEqual(["OmniPad, damaged"]);
    await expect(deleteVariation(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(24);
    } finally {
      db.close();
    }
  });
});
