// S6.3 Character and version assignment tests.
//
// Proves the spec acceptance: every panel identifies its source
// scene and assigned character versions; unapproved versions
// cannot bind.
//
// - assign pins one approved version to one (panel, character);
//   one assignment per pair; reassigning replaces.
// - mismatched character/version pairs reject; unapproved reject.
// - deleting a bound panel rejects BOUND_PANEL; unassign frees it.
// - list-by-panel returns every character on it.
//
// Imported from the built `out/node/core/project/panel-assignments.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
if (!fs.existsSync(assignmentsPath)) {
  throw new Error("Missing out/node/core/project/panel-assignments.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel, deletePanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { setApproval } = require(approvalPath);
const { assignCharacter, getAssignment, listAssignmentsByPanel, unassignCharacter } = require(assignmentsPath);

let projectRoot;
let panelId;
let robby;
let mira;
let v7;
let v12;
let miraVersion;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  const panel = await createPanel(projectRoot, scene.sceneId);
  panelId = panel.panelId;
  robby = await createCharacter(projectRoot, { name: "Robby", age: "8" });
  mira = await createCharacter(projectRoot, { name: "Mira", age: "30" });
  v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7", age: "7" });
  v12 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 12", age: "12" });
  miraVersion = await createVersion(projectRoot, { characterId: mira.characterId, label: "Mira, 30" });
  await setApproval(projectRoot, v7.versionId, "approved", "fixture approval");
  await setApproval(projectRoot, v12.versionId, "approved", "fixture approval");
  await setApproval(projectRoot, miraVersion.versionId, "approved", "fixture approval");
});

describe("S6.3 character and version assignment", () => {
  it("assign pins the exact version; one assignment per pair; reassigning replaces", async () => {
    const assignment = await assignCharacter(projectRoot, panelId, robby.characterId, v7.versionId);
    expect(assignment.panelId).toBe(panelId);
    expect(assignment.versionId).toBe(v7.versionId);
    expect(await getAssignment(projectRoot, panelId, robby.characterId)).toMatchObject({ versionId: v7.versionId });
    expect(await getAssignment(projectRoot, panelId, mira.characterId)).toBeNull();
    const reassigned = await assignCharacter(projectRoot, panelId, robby.characterId, v12.versionId);
    expect(reassigned.versionId).toBe(v12.versionId);
    expect(reassigned.assignmentId).not.toBe(assignment.assignmentId);
    expect(await listAssignmentsByPanel(projectRoot, panelId)).toHaveLength(1);
    expect((await getAssignment(projectRoot, panelId, robby.characterId)).versionId).toBe(v12.versionId);
  });

  it("multi-character scenes assign independently", async () => {
    await assignCharacter(projectRoot, panelId, robby.characterId, v7.versionId);
    await assignCharacter(projectRoot, panelId, mira.characterId, miraVersion.versionId);
    const listed = await listAssignmentsByPanel(projectRoot, panelId);
    expect(listed.map((a) => a.characterId).sort()).toEqual([mira.characterId, robby.characterId].sort());
  });

  it("mismatched pairs and unapproved versions reject with typed errors", async () => {
    await expect(assignCharacter(projectRoot, panelId, mira.characterId, v7.versionId)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const pending = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, pending" });
    await expect(assignCharacter(projectRoot, panelId, robby.characterId, pending.versionId)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await expect(assignCharacter(projectRoot, "missing", robby.characterId, v7.versionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assignCharacter(projectRoot, panelId, robby.characterId, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("bound panels refuse deletion until unassigned", async () => {
    const assignment = await assignCharacter(projectRoot, panelId, robby.characterId, v7.versionId);
    await expect(deletePanel(projectRoot, panelId)).rejects.toMatchObject({ code: "BOUND_PANEL" });
    await expect(unassignCharacter(projectRoot, assignment.assignmentId)).resolves.toBeUndefined();
    await expect(deletePanel(projectRoot, panelId)).resolves.toBeUndefined();
    await expect(unassignCharacter(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("migration v31 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(31);
    } finally {
      db.close();
    }
  });
});
