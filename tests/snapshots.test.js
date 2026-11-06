// S6.10 Storyboard snapshots + lightweight branching tests.
//
// Proves the spec acceptance: snapshots preserve exactly;
// restore is byte-identical to the snapshot; branched edits
// never damage the parent snapshot.
//
// - Snapshot copies panels + all assignments/details; live
//   dump before snapshot equals live dump after restore.
// - Branch (parent lineage): editing + restoring a child
//   leaves the parent snapshot intact.
// - Empty storyboard snapshots fine; unknown snapshot/parent
//   ids reject with typed errors.
//
// Imported from the built `out/node/core/project/snapshots.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const snapshotsPath = path.join(root, "out/node/core/project/snapshots.js");
if (!fs.existsSync(snapshotsPath)) {
  throw new Error("Missing out/node/core/project/snapshots.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const camerasPath = path.join(root, "out/node/core/project/panel-cameras.js");
const positionsPath = path.join(root, "out/node/core/project/panel-positions.js");
const textPath = path.join(root, "out/node/core/project/panel-text.js");
const instructionsPath = path.join(root, "out/node/core/project/panel-instructions.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const approvalPath = path.join(root, "out/node/core/project/approval.js");
const { setApproval } = require(approvalPath);
const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel, deletePanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { assignCharacter } = require(assignmentsPath);
const { setCamera } = require(camerasPath);
const { setPosition } = require(positionsPath);
const { setText } = require(textPath);
const { setInstructions } = require(instructionsPath);
const { createSnapshot, listSnapshots, getSnapshot, restoreSnapshot } = require(snapshotsPath);

let projectRoot;
let sceneId;
let panelId;

const LIVE_TABLES = [
  "storyboard_panels",
  "panel_assignments",
  "panel_location_assignments",
  "panel_cameras",
  "panel_positions",
  "panel_text",
  "panel_instructions",
  "panel_character_bindings",
];

function dumpLive() {
  const { openProjectDatabase } = require(metadataPath);
  const { db } = openProjectDatabase(projectRoot);
  try {
    const dump = {};
    for (const table of LIVE_TABLES) {
      dump[table] = db.prepare(`SELECT * FROM ${table}`).all().map((row) => JSON.stringify(row)).sort();
    }
    return JSON.stringify(dump);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  sceneId = scene.sceneId;
  panelId = (await createPanel(projectRoot, sceneId)).panelId;
  const character = await createCharacter(projectRoot, { name: "Robby" });
  const version = await createVersion(projectRoot, { characterId: character.characterId, label: "v1" });
  await setApproval(projectRoot, version.versionId, "approved", "fixture approval");
  const assignment = await assignCharacter(projectRoot, panelId, character.characterId, version.versionId);
  await setPosition(projectRoot, assignment.assignmentId, "foreground", "left", "rim light");
  await setCamera(projectRoot, panelId, "wide", "low");
  await setText(projectRoot, panelId, { dialogue: "Robby: We go now." });
  await setInstructions(projectRoot, panelId, { compositionPrompt: "wide, tavern" });
});

describe("S6.10 storyboard snapshots", () => {
  it("snapshot preserves exactly; restore is byte-identical", async () => {
    const before = dumpLive();
    const snapshot = await createSnapshot(projectRoot, { name: "Act 1" });
    expect(snapshot.panelCount).toBe(1);
    expect(snapshot.parentSnapshotId).toBeNull();
    // Mutate live: add a panel, drop the camera/text/instructions.
    const extraId = (await createPanel(projectRoot, sceneId)).panelId;
    await setText(projectRoot, extraId, { dialogue: "intruder" });
    await setCamera(projectRoot, panelId, "close-up", "top");
    expect(dumpLive()).not.toBe(before);
    await restoreSnapshot(projectRoot, snapshot.snapshotId);
    expect(dumpLive()).toBe(before);
  });

  it("branched edits never damage the parent snapshot", async () => {
    const parent = await createSnapshot(projectRoot, { name: "parent" });
    // Branch: snapshot with the parent as lineage after a live edit.
    await setText(projectRoot, panelId, { dialogue: "changed after parent" });
    const child = await createSnapshot(projectRoot, { name: "branch", parentSnapshotId: parent.snapshotId });
    expect(child.parentSnapshotId).toBe(parent.snapshotId);
    await restoreSnapshot(projectRoot, child.snapshotId);
    expect((await getSnapshot(projectRoot, parent.snapshotId)).panelText[0].dialogue).toBe("Robby: We go now.");
    await restoreSnapshot(projectRoot, parent.snapshotId);
    expect((await getSnapshot(projectRoot, parent.snapshotId)).panels).toHaveLength(1);
  });

  it("empty storyboard snapshots fine; unknown ids reject", async () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-empty-"));
    createProject(emptyRoot);
    const snapshot = await createSnapshot(emptyRoot, { name: "empty" });
    expect(snapshot.panelCount).toBe(0);
    await restoreSnapshot(emptyRoot, snapshot.snapshotId);
    await expect(restoreSnapshot(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createSnapshot(projectRoot, { parentSnapshotId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("list shows lineage; migration v37 present", async () => {
    const parent = await createSnapshot(projectRoot, { name: "p" });
    await createSnapshot(projectRoot, { name: "c", parentSnapshotId: parent.snapshotId });
    const listed = await listSnapshots(projectRoot);
    expect(listed.some((entry) => entry.parentSnapshotId === parent.snapshotId)).toBe(true);
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(37);
    } finally {
      db.close();
    }
  });
});
