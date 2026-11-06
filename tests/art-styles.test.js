// S3.11 Art Style Manager tests.
//
// Proves the spec acceptance (§9): profiles create/edit/delete;
// exactly one canonical default per project.
//
// - First profile becomes the default automatically; later ones don't.
// - setDefaultStyle swaps atomically (never two, never zero while
//   styles exist); delete of the default requires a successor.
// - Update merges partial fields; references validate against the
//   registry; invalid inputs reject with typed errors.
//
// Imported from the built `out/node/core/project/styles.js` with fresh
// temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
if (!fs.existsSync(stylesPath)) {
  throw new Error("Missing out/node/core/project/styles.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const {
  createStyle,
  getStyle,
  listStyles,
  getDefaultStyle,
  updateStyle,
  setDefaultStyle,
  deleteStyle,
} = require(stylesPath);

let projectRoot;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
});

describe("S3.11 art style manager", () => {
  it("first profile becomes the canonical default automatically", async () => {
    const first = await createStyle(projectRoot, { name: "Main", colorPalette: ["#101820"], aspectRatios: ["16:9"] });
    expect(first.isDefault).toBe(true);
    const second = await createStyle(projectRoot, { name: "Dream", lighting: "low-key" });
    expect(second.isDefault).toBe(false);
    expect((await getDefaultStyle(projectRoot))?.styleId).toBe(first.styleId);
    expect((await listStyles(projectRoot)).map((s) => s.name)).toEqual(["Main", "Dream"]);
    expect(await getStyle(projectRoot, "missing")).toBeNull();
  });

  it("setDefaultStyle swaps atomically (exactly one default)", async () => {
    const a = await createStyle(projectRoot, { name: "A" });
    const b = await createStyle(projectRoot, { name: "B" });
    await setDefaultStyle(projectRoot, b.styleId);
    expect((await getDefaultStyle(projectRoot))?.styleId).toBe(b.styleId);
    expect((await getStyle(projectRoot, a.styleId))?.isDefault).toBe(false);
    expect((await listStyles(projectRoot)).filter((s) => s.isDefault)).toHaveLength(1);
    expect((await getStyle(projectRoot, b.styleId))?.name).toBe("B");
    await setDefaultStyle(projectRoot, a.styleId);
    expect((await getDefaultStyle(projectRoot))?.styleId).toBe(a.styleId);
  });

  it("update merges partial fields and bumps updated_at", async () => {
    const style = await createStyle(projectRoot, { name: "Main", description: "v1", negativePrompt: "blurry" });
    const before = (await getStyle(projectRoot, style.styleId))?.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateStyle(projectRoot, style.styleId, { description: "v2" });
    expect(updated.description).toBe("v2");
    expect(updated.name).toBe("Main");
    expect(updated.negativePrompt).toBe("blurry");
    expect(updated.updatedAt).not.toBe(before);
    await expect(updateStyle(projectRoot, style.styleId, { name: " " })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(updateStyle(projectRoot, "missing", { name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("non-default styles delete freely", async () => {
    const a = await createStyle(projectRoot, { name: "A" });
    const b = await createStyle(projectRoot, { name: "B" });
    await expect(deleteStyle(projectRoot, b.styleId)).resolves.toBeUndefined();
    expect((await getDefaultStyle(projectRoot))?.styleId).toBe(a.styleId);
    await expect(deleteStyle(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleting the default with a successor succeeds; last default never orphans", async () => {
    const a = await createStyle(projectRoot, { name: "A" });
    const b = await createStyle(projectRoot, { name: "B" });
    await expect(deleteStyle(projectRoot, b.styleId)).resolves.toBeUndefined();
    expect(await listStyles(projectRoot)).toHaveLength(1);
    await expect(deleteStyle(projectRoot, a.styleId)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("reference images validate against the registry", async () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
    const src = path.join(scratch, "ref.txt");
    fs.writeFileSync(src, "ref bytes");
    const { importAsset } = require(path.join(root, "out/node/core/project/registry.js"));
    const asset = await importAsset(projectRoot, { sourceAbsolutePath: src, assetType: "style-reference" });
    const style = await createStyle(projectRoot, { name: "WithRef", referenceAssetIds: [asset.assetId] });
    expect((await getStyle(projectRoot, style.styleId))?.referenceAssetIds).toEqual([asset.assetId]);
    await expect(createStyle(projectRoot, { name: "Bad", referenceAssetIds: ["missing"] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("styles persist across reopen (migration v9)", async () => {
    await createStyle(projectRoot, { name: "Persisted" });
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(9);
    } finally {
      db.close();
    }
    expect((await listStyles(projectRoot)).map((s) => s.name)).toEqual(["Persisted"]);
  });
});
