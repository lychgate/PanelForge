// S5.8 Generation-request records (both studios) tests.
//
// Proves the spec acceptance: requests validate/store/list;
// malformed requests rejected; zero provider calls made.
//
// - create stores prompt inputs per (studio, variation, slot);
//   recreate replaces; studios don't collide.
// - unknown providers/studios/slots/empty prompts/unknown
//   subjects reject; subjects must live in the matching table.
// - attachResultAsset links the result (fulfilled).
//
// Imported from the built `out/node/core/project/studio-requests.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requestsPath = path.join(root, "out/node/core/project/studio-requests.js");
if (!fs.existsSync(requestsPath)) {
  throw new Error("Missing out/node/core/project/studio-requests.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const locationsPath = path.join(root, "out/node/core/project/locations.js");
const locVarPath = path.join(root, "out/node/core/project/location-variations.js");
const objectsPath = path.join(root, "out/node/core/project/objects.js");
const objVarPath = path.join(root, "out/node/core/project/object-variations.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createLocation } = require(locationsPath);
const { createVariation: createLocationVariation } = require(locVarPath);
const { createObject } = require(objectsPath);
const { createVariation: createObjectVariation } = require(objVarPath);
const { importAsset } = require(registryPath);
const { createRequest, getRequest, listRequestsBySubject, attachResultAsset } = require(requestsPath);

let projectRoot;
let scratch;
let locVariation;
let objVariation;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const ravenholt = await createLocation(projectRoot, { name: "Ravenholt" });
  locVariation = await createLocationVariation(projectRoot, { locationId: ravenholt.locationId, label: "Ravenholt, dawn" });
  const omnipad = await createObject(projectRoot, { name: "OmniPad" });
  objVariation = await createObjectVariation(projectRoot, { objectId: omnipad.objectId, label: "OmniPad, pristine" });
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

describe("S5.8 generation-request records (both studios)", () => {
  it("stores prompt inputs per (studio, variation, slot); recreate replaces", async () => {
    const req = await createRequest(projectRoot, {
      studio: "location",
      subjectId: locVariation.variationId,
      slot: "exterior",
      provider: "comfyui",
      prompt: "wide shard of the Ravenholt mill at dawn",
    });
    expect(req).toMatchObject({ studio: "location", slot: "exterior", provider: "comfyui", status: "requested", resultAssetId: null });
    const replacement = await createRequest(projectRoot, {
      studio: "location",
      subjectId: locVariation.variationId,
      slot: "exterior",
      provider: "mock",
      prompt: "revised prompt",
    });
    expect(replacement.requestId).not.toBe(req.requestId);
    expect(replacement.provider).toBe("mock");
    expect((await listRequestsBySubject(projectRoot, "location", locVariation.variationId))).toHaveLength(1);
    expect(await getRequest(projectRoot, req.requestId)).toBeNull();
  });

  it("studios don't collide: same slot, different studios, separate tracks", async () => {
    await createRequest(projectRoot, { studio: "location", subjectId: locVariation.variationId, slot: "detail", provider: "comfyui", prompt: "mill detail" });
    await createRequest(projectRoot, { studio: "object", subjectId: objVariation.variationId, slot: "detail", provider: "comfyui", prompt: "pad detail" });
    expect((await listRequestsBySubject(projectRoot, "location", locVariation.variationId))).toHaveLength(1);
    expect((await listRequestsBySubject(projectRoot, "object", objVariation.variationId))).toHaveLength(1);
  });

  it("malformed requests reject; subjects must match their table; zero provider traffic", async () => {
    await expect(createRequest(projectRoot, { studio: "moon", subjectId: locVariation.variationId, slot: "x", provider: "comfyui", prompt: "x" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createRequest(projectRoot, { studio: "location", subjectId: locVariation.variationId, slot: "x", provider: "cloudai", prompt: "x" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createRequest(projectRoot, { studio: "location", subjectId: locVariation.variationId, slot: "x", provider: "comfyui", prompt: "  " })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createRequest(projectRoot, { studio: "location", subjectId: "missing", slot: "x", provider: "comfyui", prompt: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A location variation ID is not an object variation ID (and vice versa).
    await expect(createRequest(projectRoot, { studio: "object", subjectId: locVariation.variationId, slot: "x", provider: "comfyui", prompt: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const service = fs.readFileSync(path.join(root, "out/node/core/project/studio-requests.js"), "utf8");
    expect(service.includes("engines/provider")).toBe(false);
    expect(service.includes("fetch(")).toBe(false);
  });

  it("attachResultAsset links the produced asset (fulfilled); migration v27 present", async () => {
    const req = await createRequest(projectRoot, { studio: "object", subjectId: objVariation.variationId, slot: "front", provider: "comfyui", prompt: "pad front" });
    const asset = await makeAsset("pad.png");
    const fulfilled = await attachResultAsset(projectRoot, req.requestId, asset.assetId);
    expect(fulfilled.status).toBe("fulfilled");
    expect(fulfilled.resultAssetId).toBe(asset.assetId);
    await expect(attachResultAsset(projectRoot, "missing", asset.assetId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(27);
    } finally {
      db.close();
    }
  });
});
