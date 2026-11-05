// S1.5 Asset Registry tests.
//
// Proves the spec acceptance:
// - Imported assets are registered (SHA-256 hash, type, dates, size)
// - Imported assets are retrievable (by ID and by list)
// - Copy operations mint a new identity; the original is unchanged
// - Paths resolve safely (S1.4); identity is the UID, never the path
//
// Imported from the built `out/node/core/project/registry.js` with a fresh
// temp project root per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/project/service.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
if (!fs.existsSync(servicePath) || !fs.existsSync(registryPath)) {
  throw new Error("Missing built project modules — run 'npm run build' first");
}

const { createProject } = require(servicePath);
const { importAsset, copyAsset, getAsset, listAssets } = require(registryPath);

let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-assets-"));
  createProject(tmpRoot);
});

function externalFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-external-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S1.5 asset registry", () => {
  it("imports an external file: copies it in, hashes it (SHA-256), registers the row", async () => {
    const source = externalFile("hero.png", "fake-png-bytes");
    const record = await importAsset(tmpRoot, {
      sourceAbsolutePath: source,
      assetType: "reference",
      destinationRelative: "characters/robert/references/hero.png",
    });
    expect(typeof record.assetId).toBe("string");
    expect(record.assetId.length).toBeGreaterThan(0);
    expect(record.relativePath).toBe("characters/robert/references/hero.png");
    expect(record.assetType).toBe("reference");
    const expectedHash = crypto.createHash("sha256").update("fake-png-bytes").digest("hex");
    expect(record.fileHash).toBe(expectedHash);
    expect(record.fileSize).toBe("fake-png-bytes".length);
    expect(typeof record.createdAt).toBe("string");
    expect(fs.existsSync(path.join(tmpRoot, "characters/robert/references/hero.png"))).toBe(true);
    expect(fs.readFileSync(path.join(tmpRoot, "characters/robert/references/hero.png"), "utf8")).toBe("fake-png-bytes");
  });

  it("getAsset retrieves an imported asset by ID; unknown ID is null", async () => {
    const source = externalFile("a.txt", "hello");
    const record = await importAsset(tmpRoot, { sourceAbsolutePath: source, assetType: "document" });
    expect(await getAsset(tmpRoot, record.assetId)).toMatchObject({
      assetId: record.assetId,
      relativePath: record.relativePath,
      assetType: "document",
    });
    expect(await getAsset(tmpRoot, "missing-id")).toBeNull();
  });

  it("listAssets returns all imported assets", async () => {
    await importAsset(tmpRoot, { sourceAbsolutePath: externalFile("a.txt", "a"), assetType: "t" });
    await importAsset(tmpRoot, { sourceAbsolutePath: externalFile("b.txt", "b"), assetType: "t" });
    const list = await listAssets(tmpRoot);
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.fileHash)).toEqual(
      ["a", "b"].map((c) => crypto.createHash("sha256").update(c).digest("hex"))
    );
  });

  it("copyAsset mints a new identity; the original is unchanged", async () => {
    const source = externalFile("orig.png", "original-bytes");
    const original = await importAsset(tmpRoot, {
      sourceAbsolutePath: source,
      assetType: "artwork",
      destinationRelative: "artwork/original.png",
    });
    const copy = await copyAsset(tmpRoot, original.assetId, {
      destinationRelative: "artwork/copy.png",
    });
    expect(copy.assetId).not.toBe(original.assetId);
    expect(copy.fileHash).toBe(original.fileHash);
    expect(fs.readFileSync(path.join(tmpRoot, "artwork/copy.png"), "utf8")).toBe("original-bytes");
    expect((await getAsset(tmpRoot, original.assetId)).relativePath).toBe("artwork/original.png");
    expect((await listAssets(tmpRoot))).toHaveLength(2);
  });

  it("duplicate destination paths are rejected for both import and copy", async () => {
    const source = externalFile("a.txt", "a");
    const one = await importAsset(tmpRoot, {
      sourceAbsolutePath: source,
      assetType: "t",
      destinationRelative: "dup/x.txt",
    });
    await expect(
      importAsset(tmpRoot, { sourceAbsolutePath: source, assetType: "t", destinationRelative: "dup/x.txt" })
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    await expect(copyAsset(tmpRoot, one.assetId, { destinationRelative: "dup/x.txt" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
  });

  it("missing sources and unknown IDs are rejected", async () => {
    await expect(
      importAsset(tmpRoot, { sourceAbsolutePath: "/tmp/definitely-missing-12345.bin", assetType: "t" })
    ).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
    await expect(copyAsset(tmpRoot, "missing-id", { destinationRelative: "x/y.png" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(importAsset(tmpRoot, { sourceAbsolutePath: "relative.txt", assetType: "t" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
  });

  it("unsafe destination paths are rejected (traversal)", async () => {
    const source = externalFile("a.txt", "a");
    await expect(
      importAsset(tmpRoot, { sourceAbsolutePath: source, assetType: "t", destinationRelative: "../outside.png" })
    ).rejects.toThrow(/escapes/);
  });

  it("registry rows persist in the database across calls", async () => {
    await importAsset(tmpRoot, { sourceAbsolutePath: externalFile("keep.txt", "keep"), assetType: "t" });
    const rows = await listAssets(tmpRoot);
    expect(rows).toHaveLength(1);
    expect(rows[0].fileHash).toBe(crypto.createHash("sha256").update("keep").digest("hex"));
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/registry.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
