// S4.7 Character version binding tests.
//
// Proves the spec acceptance: a binding returns the exact version
// ID; rebinding replaces; version deletion while bound is refused;
// the era helper flags age conflicts on fixture data.
//
// - bind pins one version to one (panel, character) pair; one
//   binding per pair; rebinding replaces it.
// - mismatched character/version pairs reject; unknown versions reject.
// - deleting a bound version rejects BOUND_VERSION; unbind frees it.
// - verifyBindingEra: matching ages pass silently; mismatches warn;
//   unbound characters warn.
//
// Imported from the built `out/node/core/project/version-binding.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bindingPath = path.join(root, "out/node/core/project/version-binding.js");
if (!fs.existsSync(bindingPath)) {
  throw new Error("Missing out/node/core/project/version-binding.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion, deleteVersion } = require(versionsPath);
const { bindVersion, getBinding, listBindingsByPanel, listBindingsByCharacter, unbind, verifyBindingEra } = require(bindingPath);

let projectRoot;
let robby;
let v7;
let v12;
let mira;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  robby = await createCharacter(projectRoot, { name: "Robby", age: "8" });
  mira = await createCharacter(projectRoot, { name: "Mira", age: "30" });
  v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7", age: "7" });
  v12 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 12", age: "12" });
});

describe("S4.7 character version binding", () => {
  it("bind pins the exact version; one binding per pair; rebind replaces", async () => {
    const binding = await bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId);
    expect(binding.versionId).toBe(v7.versionId);
    expect(await getBinding(projectRoot, "panel-1", robby.characterId)).toMatchObject({ versionId: v7.versionId });
    expect(await getBinding(projectRoot, "panel-1", mira.characterId)).toBeNull();
    const rebound = await bindVersion(projectRoot, "panel-1", robby.characterId, v12.versionId);
    expect(rebound.versionId).toBe(v12.versionId);
    expect(rebound.bindingId).not.toBe(binding.bindingId);
    expect(await listBindingsByPanel(projectRoot, "panel-1")).toHaveLength(1);
    expect((await getBinding(projectRoot, "panel-1", robby.characterId)).versionId).toBe(v12.versionId);
  });

  it("mismatched pairs and unknown versions reject with typed errors", async () => {
    await expect(bindVersion(projectRoot, "panel-1", mira.characterId, v7.versionId)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(bindVersion(projectRoot, "panel-1", robby.characterId, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bindVersion(projectRoot, "", robby.characterId, v7.versionId)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("bound versions refuse deletion until unbound", async () => {
    const binding = await bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId);
    await expect(deleteVersion(projectRoot, v7.versionId)).rejects.toMatchObject({ code: "BOUND_VERSION" });
    await expect(unbind(projectRoot, binding.bindingId)).resolves.toBeUndefined();
    await expect(deleteVersion(projectRoot, v7.versionId)).resolves.toBeUndefined();
    await expect(unbind(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("era checks flag age mismatches, pass matches, warn when unbound", async () => {
    await bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId);
    const match = await verifyBindingEra(projectRoot, "panel-1", robby.characterId, "7");
    expect(match).toMatchObject({ versionId: v7.versionId, boundAge: "7", mismatch: false, warnings: [] });
    const clash = await verifyBindingEra(projectRoot, "panel-1", robby.characterId, "12");
    expect(clash.mismatch).toBe(true);
    expect(clash.warnings[0]).toContain("7");
    expect(clash.warnings[0]).toContain("12");
    const unbound = await verifyBindingEra(projectRoot, "panel-2", robby.characterId, "7");
    expect(unbound.versionId).toBeNull();
    expect(unbound.mismatch).toBe(true);
    expect(unbound.warnings[0]).toContain("no version bound");
  });

  it("character-scoped listing spans panels; migration v16 present", async () => {
    await bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId);
    await bindVersion(projectRoot, "panel-2", robby.characterId, v12.versionId);
    await bindVersion(projectRoot, "panel-1", mira.characterId, (await createVersion(projectRoot, { characterId: mira.characterId, label: "Mira, 30" })).versionId);
    expect((await listBindingsByCharacter(projectRoot, robby.characterId)).map((b) => b.panelId)).toEqual(["panel-1", "panel-2"]);
    expect((await listBindingsByPanel(projectRoot, "panel-1")).map((b) => b.characterId)).toContain(mira.characterId);
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(16);
    } finally {
      db.close();
    }
  });
});
