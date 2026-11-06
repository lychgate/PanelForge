// S4.2 Character version records tests.
//
// Proves the spec acceptance: one character holds multiple visual
// versions; labels unique per character; foreign keys enforce
// character ownership.
//
// - create stores label + overrides; unknown characters reject.
// - duplicate labels (case-insensitive) reject with DUPLICATE_LABEL.
// - blank labels reject; overrides default to "" (inherit).
// - update merges partially; identity/createdAt stable; collisions reject.
// - list filters per character; delete removes; unknown IDs reject.
//
// Imported from the built `out/node/core/project/character-versions.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
if (!fs.existsSync(versionsPath)) {
  throw new Error("Missing out/node/core/project/character-versions.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion, getVersion, listVersions, updateVersion, deleteVersion } = require(versionsPath);

let projectRoot;
let robby;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  robby = await createCharacter(projectRoot, { name: "Robby", age: "8", clothing: "Adventurer outfit" });
});

describe("S4.2 character version records", () => {
  it("one character holds multiple independently identifiable versions", async () => {
    const v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7", age: "7" });
    const v12 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 12", age: "12", clothing: "Pirate duster" });
    expect(v7.label).toBe("Robert, age 7");
    expect(v7.age).toBe("7");
    expect(v12.age).toBe("12");
    expect(v12.clothing).toBe("Pirate duster");
    expect(v7.versionId).not.toBe(v12.versionId);
    expect(await getVersion(projectRoot, v7.versionId)).toMatchObject({ label: "Robert, age 7" });
    expect(await getVersion(projectRoot, "missing")).toBeNull();
    const listed = await listVersions(projectRoot, robby.characterId);
    expect(listed.map((v) => v.label)).toEqual(["Robert, age 7", "Robert, age 12"]);
  });

  it("labels are unique per character, case-insensitive", async () => {
    await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7" });
    await expect(
      createVersion(projectRoot, { characterId: robby.characterId, label: "  ROBERT, AGE 7  " })
    ).rejects.toMatchObject({ code: "DUPLICATE_LABEL" });
    // The same label under a different character is fine.
    const mira = await createCharacter(projectRoot, { name: "Mira" });
    const twin = await createVersion(projectRoot, { characterId: mira.characterId, label: "Robert, age 7" });
    expect(twin.characterId).toBe(mira.characterId);
  });

  it("unknown characters and blank labels reject with typed errors", async () => {
    await expect(createVersion(projectRoot, { characterId: "missing", label: "Ghost" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createVersion(projectRoot, { characterId: robby.characterId, label: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVersion(projectRoot, { characterId: robby.characterId, label: "   " })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVersion(projectRoot, { characterId: robby.characterId, label: "X", age: 7 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("overrides default to inherit; update merges and keeps identity", async () => {
    const v = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, adult" });
    expect(v.physicalAppearance).toBe("");
    expect(v.age).toBe("");
    expect(v.clothing).toBe("");
    const updated = await updateVersion(projectRoot, v.versionId, { age: "18", clothing: "Flight jacket" });
    expect(updated.versionId).toBe(v.versionId);
    expect(updated.characterId).toBe(robby.characterId);
    expect(updated.createdAt).toBe(v.createdAt);
    expect(updated.label).toBe("Robert, adult");
    expect(updated.age).toBe("18");
    // The profile itself is untouched by version overrides.
    const { getCharacter } = require(charactersPath);
    expect((await getCharacter(projectRoot, robby.characterId)).age).toBe("8");
    await expect(updateVersion(projectRoot, "missing", { age: "9" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rename collisions reject; delete removes; migration v12 present", async () => {
    const v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7" });
    const v8 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 8" });
    await expect(updateVersion(projectRoot, v8.versionId, { label: "robert, AGE 7" })).rejects.toMatchObject({
      code: "DUPLICATE_LABEL",
    });
    await expect(deleteVersion(projectRoot, v7.versionId)).resolves.toBeUndefined();
    expect(await getVersion(projectRoot, v7.versionId)).toBeNull();
    expect((await listVersions(projectRoot, robby.characterId)).map((v) => v.label)).toEqual(["Robert, age 8"]);
    await expect(deleteVersion(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(12);
    } finally {
      db.close();
    }
  });
});
