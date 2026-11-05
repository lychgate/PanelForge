// S1.11 Stage 1 Test Fixture.
//
// The end-to-end gate for Stage 1: one sample project is created, copied,
// reopened, backed up, restored, and verified — exercising S1.1–S1.10 in a
// single lifecycle and proving the Stage 1 stop condition (project
// creation, storage, asset tracking, portability, backups are reliable).
//
// Imports the built `out/node/core/project/*.js` modules with fresh temp
// locations, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/core/project", rel);
for (const rel of ["service.js", "metadata.js", "operations.js", "paths.js", "registry.js", "integrity.js", "backup.js"]) {
  if (!fs.existsSync(built(rel))) {
    throw new Error(`Missing out/node/core/project/${rel} — run 'npm run build' first`);
  }
}

const { identifyProject } = require(built("service.js"));
const { createProjectMetadata, getProjectMetadata } = require(built("metadata.js"));
const { createProjectAt, listProjects, renameProject, archiveProject, createProjectManager } = require(built("operations.js"));
const { importAsset, listAssets } = require(built("registry.js"));
const { verifyProjectIntegrity } = require(built("integrity.js"));
const { createSnapshot, restoreSnapshot } = require(built("backup.js"));

let parentDir;
beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-fixture-"));
});

function externalFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-external-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

describe("S1.11 Stage 1 test fixture", () => {
  it("a sample project completes the full Stage 1 lifecycle", async () => {
    // Create (S1.3) + identify (S1.1)
    const { root: projRoot, projectId } = await createProjectAt(parentDir, "Fixture Comic", {
      description: "S1.11 sample",
    });
    expect(identifyProject(projRoot).ok).toBe(true);

    // Reopen (S1.3 open + list shows it; metadata reads back)
    const listed = await listProjects(parentDir);
    expect(listed).toHaveLength(1);
    expect((await getProjectMetadata(projRoot)).name).toBe("Fixture Comic");

    // Track an asset: import + integrity (S1.5 + S1.6)
    const asset = await importAsset(projRoot, {
      sourceAbsolutePath: externalFile("hero.png", "fixture-pixels"),
      assetType: "reference",
      destinationRelative: "characters/robert/references/hero.png",
    });
    expect(asset.fileHash).toBe(crypto.createHash("sha256").update("fixture-pixels").digest("hex"));
    expect((await listAssets(projRoot))).toHaveLength(1);
    expect((await verifyProjectIntegrity(projRoot)).summary.ok).toBe(1);

    // Copy (S1.3 operations copy semantics + S1.9 portability core):
    // a byte-level copy opens independently at a different path.
    const copyParent = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-fixture-copy-"));
    const copyRoot = path.join(copyParent, "Fixture Comic");
    fs.cpSync(projRoot, copyRoot, { recursive: true, dereference: true });
    expect(identifyProject(copyRoot).ok).toBe(true);
    expect((await getProjectMetadata(copyRoot)).projectId).toBe(projectId);
    expect(await verifyProjectIntegrity(copyRoot)).toMatchObject({
      summary: { ok: 1, missing: 0, modified: 0 },
    });

    // Backup + restore (S1.8): snapshot the original, restore elsewhere,
    // verify the restored project independently of the original.
    const { snapshotId } = await createSnapshot(projRoot);
    const restoredParent = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-fixture-restore-"));
    const restoredRoot = path.join(restoredParent, "Restored");
    const { projectId: restoredId, integrity } = await restoreSnapshot(projRoot, snapshotId, {
      targetRoot: restoredRoot,
    });
    expect(restoredId).toBe(projectId);
    expect(integrity.summary).toMatchObject({ ok: 1, missing: 0, modified: 0 });
    expect(fs.readFileSync(path.join(restoredRoot, "characters/robert/references/hero.png"), "utf8")).toBe(
      "fixture-pixels"
    );

    // Rename + archive (S1.3) still work on the live project.
    const manager = createProjectManager();
    const renamed = await renameProject(projRoot, "Fixture Renamed", manager);
    expect(identifyProject(renamed.root).ok).toBe(true);
    const archived = await archiveProject(renamed.root, manager);
    expect(fs.existsSync(path.join(archived.root, "project.json"))).toBe(true);
    expect(await listProjects(parentDir)).toHaveLength(0);
  });

  it("the fixture gate closes with zero missing or modified assets", async () => {
    const { root: projRoot } = await createProjectAt(parentDir, "Before");
    await importAsset(projRoot, {
      sourceAbsolutePath: externalFile("gate.png", "gate"),
      assetType: "artwork",
      destinationRelative: "artwork/gate.png",
    });
    // Rename + close/cycle: verifying through the renamed root still holds.
    const manager = createProjectManager();
    const renamed = await renameProject(projRoot, "After", manager);
    const report = await verifyProjectIntegrity(renamed.root);
    expect(report.summary).toEqual({ total: 1, ok: 1, missing: 0, modified: 0, unreadable: 0 });
  });
});
