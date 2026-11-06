// S6.12 Composition review tests.
//
// Proves the spec acceptance: fixture storyboards with planted
// gaps produce those warnings; clean storyboards pass silently.
//
// - A fully-wired panel (character + location + approved
//   version + dialogue) yields zero warnings.
// - Planted gaps surface: missing-character, missing-location,
//   unapproved-bound, era-mismatch (bound vs assigned age),
//   empty-dialogue, duplicate-slot. Each names panel + fix.
// - Unknown scene ids reject NOT_FOUND; review is read-only
//   (live dump unchanged by reviewBoard).
//
// Imported from the built `out/node/core/project/composition-review.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const reviewPath = path.join(root, "out/node/core/project/composition-review.js");
if (!fs.existsSync(reviewPath)) {
  throw new Error("Missing out/node/core/project/composition-review.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const bindingPath = path.join(root, "out/node/core/project/version-binding.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const locAssignmentsPath = path.join(root, "out/node/core/project/panel-location-assignments.js");
const textPath = path.join(root, "out/node/core/project/panel-text.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { createLocation } = require(locationsPath);
const { setApproval } = require(approvalPath);
const { bindVersion } = require(bindingPath);
const { assignCharacter } = require(assignmentsPath);
const { assignLocation } = require(locAssignmentsPath);
const { setText } = require(textPath);
const { reviewBoard } = require(reviewPath);

let projectRoot;
let sceneId;

async function makeWiredPanel(age) {
  const panelId = (await createPanel(projectRoot, sceneId)).panelId;
  const character = await createCharacter(projectRoot, { name: `Hero ${age}`, age });
  const version = await createVersion(projectRoot, { characterId: character.characterId, label: `age ${age}`, age });
  await setApproval(projectRoot, version.versionId, "approved", "fixture approval");
  await assignCharacter(projectRoot, panelId, character.characterId, version.versionId);
  const location = await createLocation(projectRoot, { name: "Tavern" });
  await assignLocation(projectRoot, panelId, location.locationId);
  await setText(projectRoot, panelId, { dialogue: "We go.", actions: "Robby stands." });
  return { panelId, character, version };
}

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  sceneId = (await createScene(projectRoot, { manuscriptId: record.manuscriptId })).sceneId;
});

describe("S6.12 composition review", () => {
  it("clean storyboards pass silently", async () => {
    await makeWiredPanel("7");
    const review = await reviewBoard(projectRoot);
    expect(review.warnings).toEqual([]);
    expect(review.checkedPanels).toHaveLength(1);
  });

  it("planted gaps produce named warnings with fixes", async () => {
    const barePanelId = (await createPanel(projectRoot, sceneId)).panelId;
    await setText(projectRoot, barePanelId, { actions: "Runs." });
    const review = await reviewBoard(projectRoot, { sceneId });
    const kinds = review.warnings.map((warning) => warning.kind).sort();
    expect(kinds).toContain("missing-character");
    expect(kinds).toContain("missing-location");
    expect(kinds).toContain("empty-dialogue");
    for (const warning of review.warnings) {
      expect(warning.panelId).toBe(barePanelId);
      expect(warning.fix).toBeTruthy();
    }
  });

  it("unapproved bound versions warn", async () => {
    const panelId = (await createPanel(projectRoot, sceneId)).panelId;
    const character = await createCharacter(projectRoot, { name: "Hero", age: "7" });
    const version = await createVersion(projectRoot, { characterId: character.characterId, label: "age 7", age: "7" });
    await setApproval(projectRoot, version.versionId, "approved", "first");
    const location = await createLocation(projectRoot, { name: "Tavern" });
    await assignCharacter(projectRoot, panelId, character.characterId, version.versionId);
    await assignLocation(projectRoot, panelId, location.locationId);
    await setText(projectRoot, panelId, { dialogue: "We go." });
    // Approval revoked after assignment — review must still catch it.
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      db.prepare("UPDATE character_versions SET approval_status = 'rejected' WHERE version_id = ?").run(version.versionId);
    } finally {
      db.close();
    }
    const review = await reviewBoard(projectRoot, { sceneId });
    expect(review.warnings.some((warning) => warning.kind === "unapproved-bound")).toBe(true);
  });

  it("era mismatch warns when bound and assigned ages disagree", async () => {
    const panelId = (await createPanel(projectRoot, sceneId)).panelId;
    const character = await createCharacter(projectRoot, { name: "Hero", age: "7" });
    const young = await createVersion(projectRoot, { characterId: character.characterId, label: "age 7", age: "7" });
    const old = await createVersion(projectRoot, { characterId: character.characterId, label: "age 20", age: "20" });
    await setApproval(projectRoot, young.versionId, "approved", "fixture approval");
    await setApproval(projectRoot, old.versionId, "approved", "fixture approval");
    await assignCharacter(projectRoot, panelId, character.characterId, young.versionId);
    const location = await createLocation(projectRoot, { name: "Tavern" });
    await assignLocation(projectRoot, panelId, location.locationId);
    await setText(projectRoot, panelId, { dialogue: "We go." });
    await bindVersion(projectRoot, panelId, character.characterId, old.versionId);
    const review = await reviewBoard(projectRoot, { sceneId });
    expect(review.warnings.some((warning) => warning.kind === "era-mismatch")).toBe(true);
  });

  it("duplicate slots warn; unknown scenes reject; review is read-only", async () => {
    const { panelId } = await makeWiredPanel("7");
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      db.prepare("UPDATE storyboard_panels SET sort_order = 0 WHERE panel_id = ?").run(panelId);
    } finally {
      db.close();
    }
    const second = await createPanel(projectRoot, sceneId);
    const first = openProjectDatabase(projectRoot).db;
    try {
      first.prepare("UPDATE storyboard_panels SET sort_order = 0 WHERE panel_id = ?").run(second.panelId);
    } finally {
      first.close();
    }
    const review = await reviewBoard(projectRoot, { sceneId });
    expect(review.warnings.some((warning) => warning.kind === "duplicate-slot")).toBe(true);
    await expect(reviewBoard(projectRoot, { sceneId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const dump = () => {
      const opened = openProjectDatabase(projectRoot);
      try {
        return JSON.stringify(opened.db.prepare("SELECT * FROM storyboard_panels ORDER BY panel_id").all());
      } finally {
        opened.db.close();
      }
    };
    const before = dump();
    await reviewBoard(projectRoot);
    expect(dump()).toBe(before);
  });
});
