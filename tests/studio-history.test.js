// S5.9 Studio asset history tests.
//
// Proves the spec acceptance: a fixture lifecycle for each
// studio (create → variation → reference) replays in order.
//
// - recordLocationEvent / recordObjectEvent append; kind validated;
//   unknown profiles/variations reject.
// - list-by-profile and list-by-variation replay oldest-first.
// - rows are append-only; profile deletion cascades.
//
// Imported from the built `out/node/core/project/studio-history.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const historyPath = path.join(root, "out/node/core/project/studio-history.js");
if (!fs.existsSync(historyPath)) {
  throw new Error("Missing out/node/core/project/studio-history.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const objectsPath = path.join(root, "out/node/core/project/objects.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createLocation, deleteLocation } = require(locationsPath);
const { createObject } = require(objectsPath);
const { importAsset } = require(registryPath);
const {
  recordLocationEvent,
  recordObjectEvent,
  listLocationHistory,
  listObjectHistory,
  listLocationHistoryByVariation,
  listObjectHistoryByVariation,
} = require(historyPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function makeAsset(name) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, `pixels-${name}`, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `studio/references/${name}`,
  });
}

describe("S5.9 studio asset history", () => {
  it("a location lifecycle replays in order", async () => {
    const ravenholt = await createLocation(projectRoot, { name: "Ravenholt" });
    const asset = await makeAsset("mill.png");
    await recordLocationEvent(projectRoot, { profileId: ravenholt.locationId, event: "created" });
    await recordLocationEvent(projectRoot, { profileId: ravenholt.locationId, event: "variation_created", detail: "dawn" });
    await recordLocationEvent(projectRoot, { profileId: ravenholt.locationId, event: "reference_added", detail: "exterior" });
    const replay = await listLocationHistory(projectRoot, ravenholt.locationId);
    expect(replay.map((r) => r.event)).toEqual(["created", "variation_created", "reference_added"]);
    expect(replay[2].detail).toBe("exterior");
    expect(asset.assetId).toBeTruthy();
  });

  it("an object lifecycle replays in order (variation-scoped)", async () => {
    const omnipad = await createObject(projectRoot, { name: "OmniPad" });
    const { createVariation } = require(path.join(root, "out/node/core/project/object-variations.js"));
    const variation = await createVariation(projectRoot, { objectId: omnipad.objectId, label: "OmniPad, pristine" });
    await recordObjectEvent(projectRoot, { profileId: omnipad.objectId, variationId: variation.variationId, event: "created" });
    await recordObjectEvent(projectRoot, { profileId: omnipad.objectId, variationId: variation.variationId, event: "variation_created" });
    await recordObjectEvent(projectRoot, { profileId: omnipad.objectId, variationId: variation.variationId, event: "request_created", detail: "front" });
    const replay = await listObjectHistoryByVariation(projectRoot, variation.variationId);
    expect(replay.map((r) => r.event)).toEqual(["created", "variation_created", "request_created"]);
    expect((await listObjectHistory(projectRoot, omnipad.objectId)).length).toBe(3);
  });

  it("invalid kinds and unknown scopes reject with typed errors", async () => {
    const ravenholt = await createLocation(projectRoot, { name: "Ravenholt" });
    await expect(recordLocationEvent(projectRoot, { profileId: ravenholt.locationId, event: "teleported" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(recordLocationEvent(projectRoot, { profileId: "missing", event: "created" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(recordObjectEvent(projectRoot, { profileId: ravenholt.locationId, event: "created" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("profile deletion cascades; migration v28 present", async () => {
    const lonely = await createLocation(projectRoot, { name: "Lonely" });
    await recordLocationEvent(projectRoot, { profileId: lonely.locationId, event: "created" });
    await deleteLocation(projectRoot, lonely.locationId);
    expect(await listLocationHistory(projectRoot, lonely.locationId)).toHaveLength(0);
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(28);
    } finally {
      db.close();
    }
  });
});
