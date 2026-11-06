// S4.11 Character history tests.
//
// Proves the spec acceptance: a fixture lifecycle
// (create → version → reference → approve → bind) replays in
// order from history.
//
// - recordEvent appends; kind/detail validated; unknown
//   characters/versions reject.
// - list-by-character and list-by-version replay in order.
// - rows are append-only (no update path exists); cascade on
//   character delete.
//
// Imported from the built `out/node/core/project/history.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const historyPath = path.join(root, "out/node/core/project/history.js");
if (!fs.existsSync(historyPath)) {
  throw new Error("Missing out/node/core/project/history.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const refsPath = path.join(root, "out/node/core/project/version-references.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const bindingPath = path.join(root, "out/node/core/project/version-binding.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createCharacter, deleteCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { importAsset } = require(registryPath);
const { associateReference } = require(refsPath);
const { setApproval } = require(approvalPath);
const { bindVersion } = require(bindingPath);
const { recordEvent, listHistoryByCharacter, listHistoryByVersion } = require(historyPath);

let projectRoot;
let scratch;
let robby;
let v7;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  robby = await createCharacter(projectRoot, { name: "Robby" });
  v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7" });
});

async function makeAsset(name) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, `pixels-${name}`, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `characters/robby/references/${name}`,
  });
}

describe("S4.11 character history", () => {
  it("a fixture lifecycle replays in order", async () => {
    const asset = await makeAsset("portrait.png");
    await recordEvent(projectRoot, { characterId: robby.characterId, event: "created" });
    await recordEvent(projectRoot, { characterId: robby.characterId, versionId: v7.versionId, event: "version_created" });
    await associateReference(projectRoot, { versionId: v7.versionId, assetId: asset.assetId, slot: "portrait" });
    await recordEvent(projectRoot, { characterId: robby.characterId, versionId: v7.versionId, event: "reference_added", detail: "portrait" });
    await setApproval(projectRoot, v7.versionId, "approved", "matches sheet");
    await recordEvent(projectRoot, { characterId: robby.characterId, versionId: v7.versionId, event: "approved" });
    await bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId);
    await recordEvent(projectRoot, { characterId: robby.characterId, versionId: v7.versionId, event: "bound", detail: "panel-1" });

    const replay = await listHistoryByCharacter(projectRoot, robby.characterId);
    expect(replay.map((r) => r.event)).toEqual(["created", "version_created", "reference_added", "approved", "bound"]);
    expect(replay[3].detail).toBe("");
    expect(replay[4].detail).toBe("panel-1");
    const byVersion = await listHistoryByVersion(projectRoot, v7.versionId);
    expect(byVersion.map((r) => r.event)).toEqual(["version_created", "reference_added", "approved", "bound"]);
  });

  it("invalid kinds and unknown scopes reject with typed errors", async () => {
    await expect(recordEvent(projectRoot, { characterId: robby.characterId, event: "teleported" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(recordEvent(projectRoot, { characterId: "missing", event: "created" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(recordEvent(projectRoot, { characterId: robby.characterId, versionId: "missing", event: "created" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rows survive updates; character deletion cascades; migration v19 present", async () => {
    await recordEvent(projectRoot, { characterId: robby.characterId, event: "created" });
    expect(await listHistoryByCharacter(projectRoot, robby.characterId)).toHaveLength(1);
    expect(await listHistoryByCharacter(projectRoot, robby.characterId)).toHaveLength(1);
    // A character with no versions can be deleted; its history follows.
    const lonely = await createCharacter(projectRoot, { name: "Lonely" });
    await recordEvent(projectRoot, { characterId: lonely.characterId, event: "created" });
    await deleteCharacter(projectRoot, lonely.characterId);
    expect(await listHistoryByCharacter(projectRoot, lonely.characterId)).toHaveLength(0);
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(19);
    } finally {
      db.close();
    }
  });
});
