// S6.4 Location assignment tests.
//
// Proves the spec acceptance: a panel identifies its exact
// location (and variation when set); reassignment replaces
// cleanly.
//
// - assign pins one location (+ optional variation) per panel.
// - variation must belong to the location (cross-check).
// - unknown panels/locations/variations reject typed.
// - reassigning replaces; unassign frees; unknown IDs reject.
// - migration v32 present.
//
// Imported from the built `out/node/core/project/panel-location-assignments.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const assignmentsPath = path.join(root, "out/node/core/project/panel-location-assignments.js");
if (!fs.existsSync(assignmentsPath)) {
  throw new Error("Missing out/node/core/project/panel-location-assignments.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const variationsPath = path.join(root, "out/node/core/project/location-variations.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createLocation } = require(locationsPath);
const { createVariation } = require(variationsPath);
const { assignLocation, getLocationAssignment, unassignLocation } = require(assignmentsPath);

let projectRoot;
let panelId;
let ravenholt;
let dawn;
let winter;
let silvercreek;

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
  ravenholt = await createLocation(projectRoot, { name: "Ravenholt" });
  silvercreek = await createLocation(projectRoot, { name: "Silvercreek" });
  dawn = await createVariation(projectRoot, { locationId: ravenholt.locationId, label: "Ravenholt, dawn" });
  winter = await createVariation(projectRoot, { locationId: ravenholt.locationId, label: "Ravenholt, winter, damaged" });
});

describe("S6.4 location assignment", () => {
  it("pins one location (+ variation) per panel; reassigning replaces", async () => {
    const assignment = await assignLocation(projectRoot, panelId, ravenholt.locationId, dawn.variationId);
    expect(assignment.locationId).toBe(ravenholt.locationId);
    expect(assignment.variationId).toBe(dawn.variationId);
    expect(await getLocationAssignment(projectRoot, panelId)).toMatchObject({ variationId: dawn.variationId });
    const reassigned = await assignLocation(projectRoot, panelId, ravenholt.locationId, winter.variationId);
    expect(reassigned.variationId).toBe(winter.variationId);
    expect(reassigned.assignmentId).not.toBe(assignment.assignmentId);
    expect((await getLocationAssignment(projectRoot, panelId)).variationId).toBe(winter.variationId);
  });

  it("location without variation is valid", async () => {
    const assignment = await assignLocation(projectRoot, panelId, ravenholt.locationId);
    expect(assignment.variationId).toBeNull();
  });

  it("cross-checked variation and unknown scopes reject with typed errors", async () => {
    await expect(assignLocation(projectRoot, panelId, silvercreek.locationId, dawn.variationId)).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(assignLocation(projectRoot, panelId, "missing", dawn.variationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assignLocation(projectRoot, panelId, ravenholt.locationId, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assignLocation(projectRoot, "missing", ravenholt.locationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("unassign frees; unknown IDs reject; migration v32 present", async () => {
    const assignment = await assignLocation(projectRoot, panelId, ravenholt.locationId, dawn.variationId);
    await expect(unassignLocation(projectRoot, assignment.assignmentId)).resolves.toBeUndefined();
    expect(await getLocationAssignment(projectRoot, panelId)).toBeNull();
    await expect(unassignLocation(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(32);
    } finally {
      db.close();
    }
  });
});
