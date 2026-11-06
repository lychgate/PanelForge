// S6.6 Character positioning tests.
//
// Proves the spec acceptance: every character assignment on a
// panel carries placement guidance; positioning edits persist.
//
// - setPosition records depth + horizontal + note per assignment.
// - unknown depths/horizontals/assignments reject typed.
// - get round-trips; null when unset; setting again replaces.
// - list-by-panel returns every positioned assignment.
//
// Imported from the built `out/node/core/project/panel-positions.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const positionsPath = path.join(root, "out/node/core/project/panel-positions.js");
if (!fs.existsSync(positionsPath)) {
  throw new Error("Missing out/node/core/project/panel-positions.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const assignmentsPath = path.join(root, "out/node/core/project/panel-assignments.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { setApproval } = require(approvalPath);
const { assignCharacter } = require(assignmentsPath);
const { setPosition, getPosition, listPositionsByPanel } = require(positionsPath);

let projectRoot;
let panelId;
let robbyAssignment;
let miraAssignment;

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
  const robby = await createCharacter(projectRoot, { name: "Robby" });
  const mira = await createCharacter(projectRoot, { name: "Mira" });
  const robbyVersion = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7" });
  const miraVersion = await createVersion(projectRoot, { characterId: mira.characterId, label: "Mira, 30" });
  await setApproval(projectRoot, robbyVersion.versionId, "approved", "fixture approval");
  await setApproval(projectRoot, miraVersion.versionId, "approved", "fixture approval");
  robbyAssignment = await assignCharacter(projectRoot, panelId, robby.characterId, robbyVersion.versionId);
  miraAssignment = await assignCharacter(projectRoot, panelId, mira.characterId, miraVersion.versionId);
});

describe("S6.6 character positioning", () => {
  it("records depth + horizontal + note per assignment", async () => {
    const pos = await setPosition(projectRoot, robbyAssignment.assignmentId, "foreground", "left", "crouching, facing right");
    expect(pos.depth).toBe("foreground");
    expect(pos.horizontal).toBe("left");
    expect(pos.note).toBe("crouching, facing right");
    expect(pos.assignmentId).toBe(robbyAssignment.assignmentId);
    expect(await getPosition(projectRoot, robbyAssignment.assignmentId)).toMatchObject({ depth: "foreground", horizontal: "left" });
    expect(await getPosition(projectRoot, miraAssignment.assignmentId)).toBeNull();
  });

  it("setting again replaces", async () => {
    const first = await setPosition(projectRoot, robbyAssignment.assignmentId, "foreground", "left");
    const replaced = await setPosition(projectRoot, robbyAssignment.assignmentId, "background", "right", "distant");
    expect(replaced.depth).toBe("background");
    expect(replaced.positionId).not.toBe(first.positionId);
    expect((await listPositionsByPanel(projectRoot, panelId))).toHaveLength(1);
  });

  it("unknown depths, horizontals, and assignments reject with typed errors", async () => {
    await expect(setPosition(projectRoot, robbyAssignment.assignmentId, "middle", "left")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setPosition(projectRoot, robbyAssignment.assignmentId, "foreground", "upper")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setPosition(projectRoot, "missing", "foreground", "left")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("list-by-panel returns every positioned assignment; migration v34 present", async () => {
    await setPosition(projectRoot, robbyAssignment.assignmentId, "foreground", "left");
    await setPosition(projectRoot, miraAssignment.assignmentId, "midground", "right");
    const listed = await listPositionsByPanel(projectRoot, panelId);
    expect(listed.map((p) => p.assignmentId).sort()).toEqual([robbyAssignment.assignmentId, miraAssignment.assignmentId].sort());
    expect(listed.length).toBe(2);
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(34);
    } finally {
      db.close();
    }
  });
});
