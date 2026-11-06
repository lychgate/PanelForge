// S7.5 Reference conditioning tests.
//
// Proves the spec acceptance: conditioned jobs name their
// exact reference asset IDs; unapproved refs reject.
//
// - Approved character version slot attaches its exact
//   reference asset IDs; location/object slots attach
//   too (no approval state on variations).
// - Pending/rejected character versions reject NOT_APPROVED.
// - Unattached panels have no conditioning (unconditioned).
// - Unknown versions/slots reject typed; migration v42.
//
// Imported from the built `out/node/core/project/reference-conditioning.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const conditioningPath = path.join(root, "out/node/core/project/reference-conditioning.js");
if (!fs.existsSync(conditioningPath)) {
  throw new Error("Missing out/node/core/project/reference-conditioning.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const scenesPath = path.join(root, "out/node/core/project/storyboard-scenes.js");
const panelsPath = path.join(root, "out/node/core/project/storyboard-panels.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const variationsPath = path.join(root, "out/node/core/project/location-variations.js");
const objectsPath = path.join(root, "out/node/core/project/objects.js");
const objectVariationsPath = path.join(root, "out/node/core/project/object-variations.js");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const versionRefsPath = path.join(root, "out/node/core/project/version-references.js");
const locationRefsPath = path.join(root, "out/node/core/project/location-references.js");
const objectRefsPath = path.join(root, "out/node/core/project/object-references.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createScene } = require(scenesPath);
const { createPanel } = require(panelsPath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { createLocation } = require(locationsPath);
const { createVariation: createLocationVariation } = require(variationsPath);
const { createObject } = require(objectsPath);
const { createVariation: createObjectVariation } = require(objectVariationsPath);
const { setApproval } = require(approvalPath);
const { importAsset } = require(registryPath);
const { associateReference: associateVersionReference } = require(versionRefsPath);
const { associateReference: associateLocationReference } = require(locationRefsPath);
const { associateReference: associateObjectReference } = require(objectRefsPath);
const { setConditioning, getConditioning } = require(conditioningPath);

async function makeAsset(root, name, bytes) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, name);
  fs.writeFileSync(source, bytes);
  const asset = await importAsset(root, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `references/${name}`,
  });
  return asset.assetId;
}

let projectRoot;
let sceneId;
let panelId;
let approvedVersionId;
let pendingVersionId;
let locationVariationId;
let objectVariationId;
let characterAssetId;
let locationAssetId;
let objectAssetId;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "story.md");
  fs.writeFileSync(source, "# One\n\nWake.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  const scene = await createScene(projectRoot, { manuscriptId: record.manuscriptId });
  sceneId = scene.sceneId;
  panelId = (await createPanel(projectRoot, scene.sceneId)).panelId;

  const character = await createCharacter(projectRoot, { name: "Robby" });
  const approved = await createVersion(projectRoot, { characterId: character.characterId, label: "v1" });
  await setApproval(projectRoot, approved.versionId, "approved", "fixture approval");
  approvedVersionId = approved.versionId;
  pendingVersionId = (await createVersion(projectRoot, { characterId: character.characterId, label: "v2" })).versionId;

  characterAssetId = await makeAsset(projectRoot, "portrait.png", "portrait-bytes");
  locationAssetId = await makeAsset(projectRoot, "tavern.png", "tavern-bytes");
  objectAssetId = await makeAsset(projectRoot, "sword.png", "sword-bytes");

  const location = await createLocation(projectRoot, { name: "Tavern" });
  const locationVariation = await createLocationVariation(projectRoot, { locationId: location.locationId, label: "rainy" });
  const object = await createObject(projectRoot, { name: "Sword" });
  const objectVariation = await createObjectVariation(projectRoot, { objectId: object.objectId, label: "bright" });

  await associateVersionReference(projectRoot, { versionId: approvedVersionId, assetId: characterAssetId, slot: "portrait" });
  await associateVersionReference(projectRoot, { versionId: pendingVersionId, assetId: characterAssetId, slot: "portrait" });
  await associateLocationReference(projectRoot, { variationId: locationVariation.variationId, assetId: locationAssetId, slot: "exterior" });
  await associateObjectReference(projectRoot, { variationId: objectVariation.variationId, assetId: objectAssetId, slot: "front" });
  locationVariationId = locationVariation.variationId;
  objectVariationId = objectVariation.variationId;
});

describe("S7.5 reference conditioning", () => {
  it("approved character + location + object slots attach exact asset IDs", async () => {
    const conditioning = await setConditioning(projectRoot, {
      panelId,
      character: { versionId: approvedVersionId, slot: "portrait" },
      location: { variationId: locationVariationId, slot: "exterior" },
      object: { variationId: objectVariationId, slot: "front" },
    });
    expect(conditioning.character.assetIds).toEqual([characterAssetId]);
    expect(conditioning.location.assetIds).toEqual([locationAssetId]);
    expect(conditioning.object.assetIds).toEqual([objectAssetId]);
    expect((await getConditioning(projectRoot, panelId)).character.assetIds).toEqual([characterAssetId]);
  });

  it("pending/rejected character versions reject NOT_APPROVED", async () => {
    await expect(
      setConditioning(projectRoot, { panelId, character: { versionId: pendingVersionId, slot: "portrait" } })
    ).rejects.toMatchObject({ code: "NOT_APPROVED" });
    expect(await getConditioning(projectRoot, panelId)).toBeNull();
  });

  it("unattached panels are unconditioned; unknown slots/versions reject typed", async () => {
    const extraId = (await createPanel(projectRoot, sceneId)).panelId;
    expect(await getConditioning(projectRoot, extraId)).toBeNull();
    await expect(setConditioning(projectRoot, { panelId, character: { versionId: approvedVersionId, slot: "nope" } })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(setConditioning(projectRoot, { panelId, character: { versionId: "missing", slot: "portrait" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("migration v42 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(42);
    } finally {
      db.close();
    }
  });
});
