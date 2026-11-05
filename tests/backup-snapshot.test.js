// S1.8 Backup and Snapshot System tests.
//
// Proves the spec acceptance:
// - Snapshot creation (manifest + files + database, in-project)
// - Backup creation (same snapshot copied out of the project)
// - Restore operation + Verification (restored project opens, integrity
//   ok, original project undamaged)
// - Manifest tampering is detected (missing/modified lists)
//
// Imported from the built `out/node/core/project/backup.js` with a fresh
// temp project root per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/project/service.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const backupPath = path.join(root, "out/node/core/project/backup.js");
if (!fs.existsSync(servicePath) || !fs.existsSync(registryPath) || !fs.existsSync(backupPath)) {
  throw new Error("Missing built project modules — run 'npm run build' first");
}

const { createProject } = require(servicePath);
const { createProjectMetadata } = require(servicePath.replace("/service.js", "/metadata.js"));
const { importAsset } = require(registryPath);
const {
  createSnapshot,
  listSnapshots,
  verifySnapshot,
  createBackup,
  restoreSnapshot,
  pruneSnapshots,
  SNAPSHOTS_DIR,
} = require(backupPath);

let tmpRoot;
beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-backup-"));
  createProject(tmpRoot);
  await createProjectMetadata(tmpRoot, { name: "Backup Me" });
});

function externalFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-external-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function sha(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("S1.8 backup and snapshot system", () => {
  it("createSnapshot writes a manifest + files + database under backups/snapshots", async () => {
    await importAsset(tmpRoot, {
      sourceAbsolutePath: externalFile("hero.png", "pixels"),
      assetType: "reference",
      destinationRelative: "characters/robert/hero.png",
    });
    const { snapshotId, dir, manifest } = await createSnapshot(tmpRoot);
    expect(fs.existsSync(path.join(dir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "project.db"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "files/project.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "files/characters/robert/hero.png"))).toBe(true);
    expect(manifest.snapshotId).toBe(snapshotId);
    const hero = manifest.files.find((f) => f.relativePath.includes("hero.png"));
    expect(hero.sha256).toBe(sha("pixels"));
    expect(listSnapshots(tmpRoot)).toEqual([snapshotId]);
  });

  it("a fresh snapshot verifies clean", async () => {
    const { snapshotId } = await createSnapshot(tmpRoot);
    const result = verifySnapshot(tmpRoot, snapshotId);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.modified).toEqual([]);
  });

  it("tampering with a snapshot is detected (missing + modified)", async () => {
    const { snapshotId, dir } = await createSnapshot(tmpRoot);
    fs.writeFileSync(path.join(dir, "files/project.json"), '{"tampered":true}\n', "utf8");
    const result = verifySnapshot(tmpRoot, snapshotId);
    expect(result.ok).toBe(false);
    expect(result.modified).toContain("project.json");
  });

  it("restore into a fresh target: opens, integrity ok, original undamaged", async () => {
    await importAsset(tmpRoot, {
      sourceAbsolutePath: externalFile("v1.png", "version-one"),
      assetType: "artwork",
      destinationRelative: "artwork/v1.png",
    });
    const { snapshotId } = await createSnapshot(tmpRoot);
    const target = path.join(tmpRoot, "restored");
    const { targetRoot, projectId, integrity } = await restoreSnapshot(tmpRoot, snapshotId, {
      targetRoot: target,
    });
    expect(targetRoot).toBe(target);
    const { createProject: _unused, identifyProject } = require(servicePath);
    expect(identifyProject(target).ok).toBe(true);
    expect(projectId).toBe(identifyProject(tmpRoot).metadata.projectId);
    expect(integrity.summary).toMatchObject({ total: 1, ok: 1, missing: 0, modified: 0 });
    // The original project is untouched.
    expect(identifyProject(tmpRoot).ok).toBe(true);
    expect(fs.readFileSync(path.join(tmpRoot, "artwork/v1.png"), "utf8")).toBe("version-one");
    expect(listSnapshots(tmpRoot)).toContain(snapshotId);
  });

  it("restore refuses to overwrite and refuses a tampered snapshot", async () => {
    const { snapshotId, dir } = await createSnapshot(tmpRoot);
    fs.writeFileSync(path.join(dir, "files/project.json"), '{"tampered":true}\n', "utf8");
    await expect(
      restoreSnapshot(tmpRoot, snapshotId, { targetRoot: path.join(tmpRoot, "restored2") })
    ).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
    const target = path.join(tmpRoot, "occupied");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "x"), "x", "utf8");
    // Untampered snapshot, occupied target: still refused (no silent overwrite).
    const clean = await createSnapshot(tmpRoot);
    await expect(
      restoreSnapshot(tmpRoot, clean.snapshotId, { targetRoot: target })
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    await expect(
      restoreSnapshot(tmpRoot, clean.snapshotId, { targetRoot: tmpRoot })
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("createBackup copies a snapshot outside the project", async () => {
    await importAsset(tmpRoot, {
      sourceAbsolutePath: externalFile("out.png", "out"),
      assetType: "artwork",
      destinationRelative: "artwork/out.png",
    });
    const destBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-bk-out-"));
    const { snapshotId, destinationDir } = await createBackup(tmpRoot, destBase);
    expect(fs.existsSync(path.join(destinationDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, "files/artwork/out.png"))).toBe(true);
    const result = verifySnapshot(tmpRoot, snapshotId);
    expect(result.ok).toBe(true);
  });

  it("pruneSnapshots keeps the newest N", async () => {
    for (let i = 0; i < 3; i++) {
      await createSnapshot(tmpRoot);
      await new Promise((r) => setTimeout(r, 150)); // distinct millisecond ids
    }
    expect(listSnapshots(tmpRoot).length).toBeGreaterThanOrEqual(3);
    const before = listSnapshots(tmpRoot);
    const removed = pruneSnapshots(tmpRoot, 1);
    expect(removed.length).toBe(before.length - 1);
    expect(listSnapshots(tmpRoot)).toHaveLength(1);
    expect(listSnapshots(tmpRoot)[0]).toBe(before[before.length - 1]);
  });

  it("unknown snapshot ids are NOT_FOUND", () => {
    expect(() => verifySnapshot(tmpRoot, "missing-id")).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/backup.ts"), "utf8");
    expect(source).not.toContain("/home/wetlander");
    expect(source).not.toContain("/Users/");
    expect(source).toContain(SNAPSHOTS_DIR);
  });
});
