// S3.12 Style profile persistence tests.
//
// Proves the spec acceptance: styles round-trip through copy/restore;
// no absolute paths stored.
//
// - verifyStylePortability passes on well-formed projects and flags
//   missing/unregistered/non-portable references.
// - Snapshot create → restore to a new path: styles identical.
// - Plain copy to a new path reopens with identical styles.
// - No machine-specific absolute path leaks into the project DB.
//
// Imported from the built `out/node/core/project/style-persistence.js`
// with fresh temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const persistPath = path.join(root, "out/node/core/project/style-persistence.js");
if (!fs.existsSync(persistPath)) {
  throw new Error("Missing out/node/core/project/style-persistence.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const backupPath = path.join(root, "out/node/core/project/backup.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createStyle, listStyles, getDefaultStyle } = require(stylesPath);
const { importAsset } = require(registryPath);
const { createSnapshot, restoreSnapshot } = require(backupPath);
const { openProjectDatabase } = require(metadataPath);
const { verifyStylePortability, isPortablePath } = require(persistPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function seedStyles() {
  const src = path.join(scratch, "ref.txt");
  fs.writeFileSync(src, "reference bytes");
  const asset = await importAsset(projectRoot, { sourceAbsolutePath: src, assetType: "style-reference" });
  const main = await createStyle(projectRoot, {
    name: "Main",
    referenceAssetIds: [asset.assetId],
    colorPalette: ["#101820"],
    aspectRatios: ["16:9"],
  });
  await createStyle(projectRoot, { name: "Dream", lighting: "low-key" });
  return main;
}

describe("S3.12 style profile persistence", () => {
  it("portability passes; problem paths fail precisely", async () => {
    expect(isPortablePath("manuscripts/original/x.txt")).toBe(true);
    expect(isPortablePath("/home/user/x")).toBe(false);
    expect(isPortablePath("C:\\data\\x")).toBe(false);
    await seedStyles();
    const report = await verifyStylePortability(projectRoot);
    expect(report).toMatchObject({ ok: true, stylesChecked: 2 });
    // Tamper: point a reference at a missing file via registry delete of the row's file.
    const { db } = openProjectDatabase(projectRoot);
    try {
      const row = db.prepare("SELECT * FROM assets LIMIT 1").get();
      const abs = path.join(projectRoot, String(row.relative_path));
      fs.rmSync(abs);
    } finally {
      db.close();
    }
    const broken = await verifyStylePortability(projectRoot);
    expect(broken.ok).toBe(false);
    expect(broken.problems.some((p) => p.detail.includes("missing"))).toBe(true);
  });

  it("snapshot restore round-trips styles to a new path", async () => {
    await seedStyles();
    const before = await listStyles(projectRoot);
    const { snapshotId } = await createSnapshot(projectRoot);
    const target = path.join(scratch, "restored");
    const restored = await restoreSnapshot(projectRoot, snapshotId, { targetRoot: target });
    expect(restored.projectId).toBeTruthy();
    const after = await listStyles(target);
    expect(after.map((s) => s.name)).toEqual(before.map((s) => s.name));
    expect(after.map((s) => s.referenceAssetIds)).toEqual(before.map((s) => s.referenceAssetIds));
    expect((await getDefaultStyle(target))?.name).toBe("Main");
    expect((await verifyStylePortability(target)).ok).toBe(true);
  });

  it("plain copy to a new path reopens with identical styles", async () => {
    await seedStyles();
    const target = path.join(scratch, "copied");
    fs.cpSync(projectRoot, target, { recursive: true });
    const copied = await listStyles(target);
    expect(copied.map((s) => s.name)).toEqual(["Main", "Dream"]);
    expect((await getDefaultStyle(target))?.name).toBe("Main");
    expect((await verifyStylePortability(target)).ok).toBe(true);
  });

  it("no machine-specific absolute path is stored in style rows", async () => {
    await seedStyles();
    const { db } = openProjectDatabase(projectRoot);
    try {
      const rows = db.prepare("SELECT * FROM styles").all();
      const blob = JSON.stringify(rows);
      expect(blob).not.toContain(projectRoot);
      expect(blob).not.toContain(scratch);
    } finally {
      db.close();
    }
  });
});
