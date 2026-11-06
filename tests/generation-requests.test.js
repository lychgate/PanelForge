// S4.9 Generation-request records tests.
//
// Proves the spec acceptance: requests validate/store/list;
// malformed requests rejected; zero provider calls made.
//
// - create stores prompt inputs per (version, slot); recreate replaces.
// - unknown providers/slots/empty prompts/unknown versions reject.
// - attachResultAsset links the result (fulfilled); unknown IDs reject.
// - list-by-version returns slot order.
//
// Imported from the built `out/node/core/project/generation-requests.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requestsPath = path.join(root, "out/node/core/project/generation-requests.js");
if (!fs.existsSync(requestsPath)) {
  throw new Error("Missing out/node/core/project/generation-requests.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion } = require(versionsPath);
const { importAsset } = require(registryPath);
const { createGenerationRequest, getGenerationRequest, listGenerationRequestsByVersion, attachResultAsset } = require(requestsPath);

let projectRoot;
let scratch;
let v7;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const robby = await createCharacter(projectRoot, { name: "Robby" });
  v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7" });
});

async function makeAsset(name) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, `pixels-${name}`, "utf8");
  return importAsset(projectRoot, {
    sourceAbsolutePath: source,
    assetType: "reference",
    destinationRelative: `characters/robby/references/${name}`,
  });
}

describe("S4.9 generation-request records", () => {
  it("stores prompt inputs per (version, slot); recreate replaces", async () => {
    const req = await createGenerationRequest(projectRoot, {
      versionId: v7.versionId,
      slot: "portrait",
      provider: "comfyui",
      prompt: "portrait of an 8-year-old space pirate, bony elbows, OmniPad",
      negativePrompt: "blurry",
    });
    expect(req).toMatchObject({
      slot: "portrait",
      provider: "comfyui",
      status: "requested",
      resultAssetId: null,
      negativePrompt: "blurry",
    });
    expect(await getGenerationRequest(projectRoot, req.requestId)).toMatchObject({ prompt: expect.stringContaining("OmniPad") });
    const replacement = await createGenerationRequest(projectRoot, {
      versionId: v7.versionId,
      slot: "portrait",
      provider: "lmstudio",
      prompt: "new prompt",
    });
    expect(replacement.requestId).not.toBe(req.requestId);
    expect(replacement.provider).toBe("lmstudio");
    expect((await listGenerationRequestsByVersion(projectRoot, v7.versionId))).toHaveLength(1);
    expect(await getGenerationRequest(projectRoot, "missing")).toBeNull();
  });

  it("malformed requests reject with typed errors; no provider is contacted", async () => {
    await expect(
      createGenerationRequest(projectRoot, { versionId: v7.versionId, slot: "portrait", provider: "cloudai", prompt: "x" })
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(
      createGenerationRequest(projectRoot, { versionId: v7.versionId, slot: "splash", provider: "comfyui", prompt: "x" })
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(
      createGenerationRequest(projectRoot, { versionId: v7.versionId, slot: "portrait", provider: "comfyui", prompt: "   " })
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(
      createGenerationRequest(projectRoot, { versionId: "missing", slot: "portrait", provider: "comfyui", prompt: "x" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Zero model calls by construction: no provider module is imported
    // by the request service.
    const service = fs.readFileSync(path.join(root, "out/node/core/project/generation-requests.js"), "utf8");
    expect(service.includes("engines/provider")).toBe(false);
    expect(service.includes("fetch(")).toBe(false);
  });

  it("attachResultAsset links the produced asset (fulfilled)", async () => {
    const req = await createGenerationRequest(projectRoot, {
      versionId: v7.versionId,
      slot: "portrait",
      provider: "comfyui",
      prompt: "portrait",
    });
    const asset = await makeAsset("portrait.png");
    const fulfilled = await attachResultAsset(projectRoot, req.requestId, asset.assetId);
    expect(fulfilled.status).toBe("fulfilled");
    expect(fulfilled.resultAssetId).toBe(asset.assetId);
    await expect(attachResultAsset(projectRoot, "missing", asset.assetId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists requests in slot order; migration v18 present", async () => {
    await createGenerationRequest(projectRoot, { versionId: v7.versionId, slot: "front", provider: "mock", prompt: "front" });
    await createGenerationRequest(projectRoot, { versionId: v7.versionId, slot: "expression", provider: "mock", prompt: "expr" });
    expect((await listGenerationRequestsByVersion(projectRoot, v7.versionId)).map((r) => r.slot)).toEqual(["expression", "front"]);
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(18);
    } finally {
      db.close();
    }
  });
});
