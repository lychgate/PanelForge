// S4.1 Character profile records tests.
//
// Proves the spec acceptance: profiles create, read back, update,
// and delete with typed errors; name validation; identity stability.
//
// - create stores all §8.4 text fields; omitted fields default to "".
// - blank or non-string names reject with typed errors.
// - update merges partially; identity and createdAt never change.
// - delete removes; unknown IDs return null / reject typed.
//
// Imported from the built `out/node/core/project/characters.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
if (!fs.existsSync(charactersPath)) {
  throw new Error("Missing out/node/core/project/characters.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const {
  createCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
  deleteCharacter,
} = require(charactersPath);

let projectRoot;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
});

describe("S4.1 character profile records", () => {
  it("create stores all §8.4 fields with trimmed name and stable identity", async () => {
    const profile = await createCharacter(projectRoot, {
      name: "  Robby  ",
      description: "Space-pirate crew kid",
      physicalAppearance: "Small, bony-elbowed",
      age: "8",
      personality: "Curious, fearless",
      clothing: "Adventurer outfit",
      equipment: "OmniPad",
      distinguishingFeatures: "Bony elbows",
      relationships: "ARKNAD (ally)",
      timeline: "2793",
    });
    expect(profile.name).toBe("Robby");
    expect(profile.description).toBe("Space-pirate crew kid");
    expect(profile.physicalAppearance).toBe("Small, bony-elbowed");
    expect(profile.age).toBe("8");
    expect(profile.personality).toBe("Curious, fearless");
    expect(profile.clothing).toBe("Adventurer outfit");
    expect(profile.equipment).toBe("OmniPad");
    expect(profile.distinguishingFeatures).toBe("Bony elbows");
    expect(profile.relationships).toBe("ARKNAD (ally)");
    expect(profile.timeline).toBe("2793");
    expect(profile.characterId).toBeTruthy();
    expect(profile.createdAt).toBeTruthy();
    expect(await getCharacter(projectRoot, profile.characterId)).toMatchObject({ name: "Robby", age: "8" });
    expect(await getCharacter(projectRoot, "missing")).toBeNull();
  });

  it("omitted fields default to empty strings", async () => {
    const profile = await createCharacter(projectRoot, { name: "Mira" });
    expect(profile.physicalAppearance).toBe("");
    expect(profile.age).toBe("");
    expect(profile.timeline).toBe("");
    for (const field of ["description", "physicalAppearance", "age", "personality", "clothing", "equipment", "distinguishingFeatures", "relationships", "timeline"]) {
      expect(typeof profile[field]).toBe("string");
    }
  });

  it("blank or malformed names reject with typed errors", async () => {
    await expect(createCharacter(projectRoot, { name: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createCharacter(projectRoot, { name: "   " })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const profile = await createCharacter(projectRoot, { name: "Robby" });
    await expect(createCharacter(projectRoot, { name: "Mira", age: 8 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(updateCharacter(projectRoot, profile.characterId, { name: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("update merges partially; identity and createdAt never change", async () => {
    const profile = await createCharacter(projectRoot, { name: "Robby", age: "7" });
    const updated = await updateCharacter(projectRoot, profile.characterId, { age: "8", equipment: "OmniPad" });
    expect(updated.characterId).toBe(profile.characterId);
    expect(updated.createdAt).toBe(profile.createdAt);
    expect(updated.age).toBe("8");
    expect(updated.equipment).toBe("OmniPad");
    expect(updated.name).toBe("Robby");
    expect(updated.updatedAt >= profile.updatedAt).toBe(true);
    await expect(updateCharacter(projectRoot, "missing", { age: "9" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("list returns creation order; delete removes and rejects unknown IDs", async () => {
    const first = await createCharacter(projectRoot, { name: "Robby" });
    const second = await createCharacter(projectRoot, { name: "ARKNAD" });
    const listed = await listCharacters(projectRoot);
    expect(listed.map((p) => p.name)).toEqual(["Robby", "ARKNAD"]);
    await expect(deleteCharacter(projectRoot, first.characterId)).resolves.toBeUndefined();
    expect(await getCharacter(projectRoot, first.characterId)).toBeNull();
    expect((await listCharacters(projectRoot)).map((p) => p.name)).toEqual(["ARKNAD"]);
    await expect(deleteCharacter(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(11);
    } finally {
      db.close();
    }
  });
});
