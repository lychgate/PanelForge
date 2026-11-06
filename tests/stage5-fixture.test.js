// S5.10 Stage 5 acceptance fixture.
//
// The end-to-end gate for Stage 5: one fixture location and one
// fixture object flow through the studio — Stage 3 entities →
// profiles (S5.7) → variations (S5.2/S5.5) → references
// (S5.3/S5.6) → request records (S5.8) → history replay (S5.9)
// — each independently created/edited/referenced, with evidence
// that neither studio's work touches the other's.
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
  "locations.js",
  "location-variations.js",
  "objects.js",
  "object-variations.js",
  "registry.js",
  "location-references.js",
  "object-references.js",
  "studio-requests.js",
  "studio-history.js",
  "location-object-bridge.js",
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
const { updateLocation } = require(built("locations.js"));
const { createVariation: createLocationVariation } = require(built("location-variations.js"));
const { updateObject } = require(built("objects.js"));
const { createVariation: createObjectVariation } = require(built("object-variations.js"));
const { importAsset } = require(built("registry.js"));
const { associateReference: associateLocationRef } = require(built("location-references.js"));
const { associateReference: associateObjectRef } = require(built("object-references.js"));
const { createRequest } = require(built("studio-requests.js"));
const { recordLocationEvent, recordObjectEvent, listLocationHistory, listObjectHistory } = require(built("studio-history.js"));
const { createLocationFromEntity, createObjectFromEntity } = require(built("location-object-bridge.js"));

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
    destinationRelative: `studio/references/${name}`,
  });
}

describe("S5.10 Stage 5 acceptance fixture", () => {
  it("location + object flow end-to-end, independently and replayable", async () => {
    const { entities } = await buildChain(
      "# One\n\nRobby met ARKNAD in Ravenholt. Robby polished the Silver Compass. Robby waved. Ravenholt stood. Silver Compass glowed."
    );
    const ravenholt = entities.find((e) => e.name === "Ravenholt");
    const compass = entities.find((e) => e.name === "Silver Compass");
    expect(ravenholt).toBeTruthy();
    expect(compass).toBeTruthy();

    // S5.7: explicit bridges — name only, source linked.
    const location = await createLocationFromEntity(projectRoot, ravenholt.entityId);
    const object = await createObjectFromEntity(projectRoot, compass.entityId);
    expect(location.name).toBe("Ravenholt");
    expect(object.name).toBe("Silver Compass");
    await updateLocation(projectRoot, location.locationId, { materials: "Timber, steel" });
    await updateObject(projectRoot, object.objectId, { materials: "Brass" });

    // S5.2/S5.5: variations.
    const locVariation = await createLocationVariation(projectRoot, { locationId: location.locationId, label: "Ravenholt, dawn" });
    const objVariation = await createObjectVariation(projectRoot, { objectId: object.objectId, label: "Silver Compass, pristine" });

    // S5.3/S5.6: references.
    const exterior = await makeAsset("mill.png", "pixels-mill");
    const front = await makeAsset("compass.png", "pixels-compass");
    await associateLocationRef(projectRoot, { variationId: locVariation.variationId, assetId: exterior.assetId, slot: "exterior" });
    await associateObjectRef(projectRoot, { variationId: objVariation.variationId, assetId: front.assetId, slot: "front" });

    // S5.8: separate request tracks per studio.
    const locReq = await createRequest(projectRoot, { studio: "location", subjectId: locVariation.variationId, slot: "exterior", provider: "comfyui", prompt: "wide shard of the mill" });
    const objReq = await createRequest(projectRoot, { studio: "object", subjectId: objVariation.variationId, slot: "front", provider: "comfyui", prompt: "macro of the compass" });
    expect(locReq.requestId).not.toBe(objReq.requestId);
    expect(locReq.status).toBe("requested");
    expect(objReq.status).toBe("requested");

    // S5.9: both lifecycles replay independently.
    for (const event of ["created", "variation_created", "reference_added", "request_created"]) {
      await recordLocationEvent(projectRoot, { profileId: location.locationId, variationId: locVariation.variationId, event, detail: event });
      await recordObjectEvent(projectRoot, { profileId: object.objectId, variationId: objVariation.variationId, event, detail: event });
    }
    expect((await listLocationHistory(projectRoot, location.locationId)).map((r) => r.event)).toEqual([
      "created",
      "variation_created",
      "reference_added",
      "request_created",
    ]);
    expect((await listObjectHistory(projectRoot, object.objectId)).map((r) => r.event)).toEqual([
      "created",
      "variation_created",
      "reference_added",
      "request_created",
    ]);
  });

  it("a second place proves the stage honors the same gates", async () => {
    const { entities } = await buildChain("# One\n\nMira found Silvercreek at dawn in 2801. Mira kept walking. Silvercreek stood.");
    const silvercreek = entities.find((e) => e.name === "Silvercreek");
    const location = await createLocationFromEntity(projectRoot, silvercreek.entityId);
    const variation = await createLocationVariation(projectRoot, { locationId: location.locationId, label: "Silvercreek, dawn" });
    const overview = await makeAsset("creek.png", "pixels-creek");
    await associateLocationRef(projectRoot, { variationId: variation.variationId, assetId: overview.assetId, slot: "overview" });
    const req = await createRequest(projectRoot, { studio: "location", subjectId: variation.variationId, slot: "overview", provider: "mock", prompt: "wide creek" });
    expect(req.studio).toBe("location");
    await recordLocationEvent(projectRoot, { profileId: location.locationId, event: "created" });
    expect((await listLocationHistory(projectRoot, location.locationId)).map((r) => r.event)).toEqual(["created"]);
  });
});
