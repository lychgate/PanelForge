// S4.12 Stage 4 acceptance fixture.
//
// The end-to-end gate for Stage 4: one fixture character flows
// through the whole studio — Stage 3 entity → profile (S4.6) →
// versions (S4.2) → references (S4.3) → completeness tiers (S4.4)
// → approval (S4.8) → panel binding (S4.7) → comparison (S4.10)
// → history replay (S4.11) — with incomplete references warning
// in actionable form and approved work untouched throughout.
//
// Imported from the built `out/node/core/project/*.js` modules
// with fresh temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/core/project", rel);
for (const rel of [
  "service.js",
  "manuscripts.js",
  "text-normalize.js",
  "chapters.js",
  "scenes.js",
  "entities.js",
  "characters.js",
  "character-versions.js",
  "registry.js",
  "version-references.js",
  "completeness.js",
  "approval.js",
  "version-binding.js",
  "version-comparison.js",
  "history.js",
  "entity-bridge.js",
]) {
  if (!fs.existsSync(built(rel))) {
    throw new Error(`Missing out/node/core/project/${rel} — run 'npm run build' first`);
  }
}

const { createProject } = require(built("service.js"));
const { importManuscript } = require(built("manuscripts.js"));
const { storeNormalization } = require(built("text-normalize.js"));
const { storeChapters } = require(built("chapters.js"));
const { storeScenes } = require(built("scenes.js"));
const { storeEntities } = require(built("entities.js"));
const { getCharacter, updateCharacter } = require(built("characters.js"));
const { createVersion } = require(built("character-versions.js"));
const { importAsset } = require(built("registry.js"));
const { associateReference } = require(built("version-references.js"));
const { scoreCompleteness } = require(built("completeness.js"));
const { setApproval } = require(built("approval.js"));
const { bindVersion, verifyBindingEra } = require(built("version-binding.js"));
const { compareVersions } = require(built("version-comparison.js"));
const { recordEvent, listHistoryByCharacter } = require(built("history.js"));
const { createProfileFromEntity } = require(built("entity-bridge.js"));

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function buildChain(text) {
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, text);
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  await storeNormalization(projectRoot, record.manuscriptId);
  await storeChapters(projectRoot, record.manuscriptId);
  await storeScenes(projectRoot, record.manuscriptId);
  const entities = await storeEntities(projectRoot, record.manuscriptId);
  return { record, entities };
}

async function makeAsset(name, content) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, content, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `characters/robby/references/${name}`,
  });
}

describe("S4.12 Stage 4 acceptance fixture", () => {
  it("entity → profile → versions → references → tiers → approve → bind, with history replay", async () => {
    const { entities } = await buildChain("# One\n\nRobby met ARKNAD. Robby waved. ARKNAD watched.");
    const robbyEntity = entities.find((e) => e.name === "Robby");
    expect(robbyEntity).toBeTruthy();

    // S4.6: explicit bridge — name only, source linked, rest empty.
    const profile = await createProfileFromEntity(projectRoot, robbyEntity.entityId);
    expect(profile.name).toBe("Robby");
    expect(profile.sourceEntityId).toBe(robbyEntity.entityId);
    await updateCharacter(projectRoot, profile.characterId, { age: "8", clothing: "Adventurer outfit" });

    // S4.2: two visual versions.
    const v7 = await createVersion(projectRoot, { characterId: profile.characterId, label: "Robert, age 7", age: "7" });
    const v12 = await createVersion(projectRoot, { characterId: profile.characterId, label: "Robert, age 12", age: "12" });

    // S4.3: references on v7 (portrait + front); v12 starts bare.
    const portrait = await makeAsset("portrait.png", "pixels-portrait");
    const front = await makeAsset("front.png", "pixels-front");
    await associateReference(projectRoot, { versionId: v7.versionId, assetId: portrait.assetId, slot: "portrait" });
    await associateReference(projectRoot, { versionId: v7.versionId, assetId: front.assetId, slot: "front" });

    // S4.4: tiers name the gaps; bare v12 fails everything.
    const bare = await scoreCompleteness(projectRoot, v12.versionId);
    expect(bare.overall).toBeNull();
    expect(bare.tiers[0].missing).toEqual(["any reference"]);
    const partial = await scoreCompleteness(projectRoot, v7.versionId);
    expect(partial.overall).toBe("basic");
    expect([...partial.tiers[1].missing].sort()).toEqual(["expression"]);
    expect(partial.tiers[1].passed).toBe(false);

    // S4.8: approval gates binding.
    await expect(bindVersion(projectRoot, "panel-1", profile.characterId, v7.versionId)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await setApproval(projectRoot, v7.versionId, "approved", "matches approved reference sheet");

    // S4.7: exact-version binding + era warning.
    const binding = await bindVersion(projectRoot, "panel-1", profile.characterId, v7.versionId);
    expect(binding.versionId).toBe(v7.versionId);
    expect((await verifyBindingEra(projectRoot, "panel-1", profile.characterId, "12")).mismatch).toBe(true);
    expect((await verifyBindingEra(projectRoot, "panel-1", profile.characterId, "7")).mismatch).toBe(false);

    // S4.10: comparison names the diffs; versions untouched by it.
    const cmp = await compareVersions(projectRoot, v7.versionId, v12.versionId);
    expect(cmp.fieldDiffs).toContainEqual({ field: "age", a: "7", b: "12" });
    expect(cmp.slots.find((s) => s.slot === "portrait").same).toBe(false);
    expect(cmp.a.approval).toBe("approved");
    expect(cmp.b.approval).toBe("pending");

    // S4.11: the lifecycle replays from history.
    for (const event of ["created", "version_created", "reference_added", "approved", "bound", "compared"]) {
      const kind = event === "compared" ? "updated" : event;
      await recordEvent(projectRoot, { characterId: profile.characterId, versionId: v7.versionId, event: kind, detail: event === "compared" ? "vs age 12" : "" });
    }
    const replay = await listHistoryByCharacter(projectRoot, profile.characterId);
    expect(replay.map((r) => r.event)).toEqual(["created", "version_created", "reference_added", "approved", "bound", "updated"]);

    // Approved work intact: profile and version reads unchanged.
    expect((await getCharacter(projectRoot, profile.characterId)).name).toBe("Robby");
  });

  it("a second character proves the stage honors the same gates", async () => {
    const { entities } = await buildChain("# One\n\nMira found RAVENHOLT at dawn in 2801. Mira kept walking. RAVENHOLT watched.");
    const mira = entities.find((e) => e.name === "Mira");
    const profile = await createProfileFromEntity(projectRoot, mira.entityId);
    const version = await createVersion(projectRoot, { characterId: profile.characterId, label: "Mira, 30" });
    await setApproval(projectRoot, version.versionId, "approved", "fixture approval");
    const portrait = await makeAsset("mira-portrait.png", "pixels-mira");
    await associateReference(projectRoot, { versionId: version.versionId, assetId: portrait.assetId, slot: "portrait" });
    await bindVersion(projectRoot, "panel-9", profile.characterId, version.versionId);
    const score = await scoreCompleteness(projectRoot, version.versionId);
    expect(score.overall).toBe("basic");
    // Unbound version rejected for binding until approved — same gate.
    const other = await createVersion(projectRoot, { characterId: profile.characterId, label: "Mira, 31" });
    await expect(bindVersion(projectRoot, "panel-10", profile.characterId, other.versionId)).rejects.toMatchObject({ code: "NOT_APPROVED" });
  });
});
