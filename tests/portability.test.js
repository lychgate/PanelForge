// S1.9 Project Portability Test.
//
// Proves the spec acceptance:
// - A copied project opens on a different directory path (copy AND move
//   verified, including after the original is gone)
// - No reliance on machine-specific absolute paths: stored artifacts
//   (project.json, database rows) contain only relative paths
// - Asset integrity verification passes at the new location
//
// Imported from the built `out/node/core/project/*.js` modules with fresh
// temp locations per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/core/project", rel);
for (const rel of ["service.js", "metadata.js", "operations.js", "paths.js", "registry.js", "integrity.js"]) {
  if (!fs.existsSync(built(rel))) {
    throw new Error(`Missing out/node/core/project/${rel} — run 'npm run build' first`);
  }
}

const { createProject, identifyProject } = require(built("service.js"));
const { createProjectMetadata, getProjectMetadata } = require(built("metadata.js"));
const { createProjectAt, listProjects } = require(built("operations.js"));
const { resolveInProject } = require(built("paths.js"));
const { importAsset, listAssets } = require(built("registry.js"));
const { verifyProjectIntegrity } = require(built("integrity.js"));

let parentDir;
beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-port-src-"));
});

function externalFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-external-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function copyProject(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

async function buildProject(name) {
  const { root: projRoot, projectId } = await createProjectAt(parentDir, name, {
    description: "portable",
  });
  await importAsset(projRoot, {
    sourceAbsolutePath: externalFile("v1.png", "version-one"),
    assetType: "artwork",
    destinationRelative: "artwork/v1.png",
  });
  return { projRoot, projectId };
}

async function assertProjectOpens(destRoot) {
  const identified = identifyProject(destRoot);
  expect(identified.ok).toBe(true);
  const metadata = await getProjectMetadata(destRoot);
  expect(metadata.name).toBeTruthy();
  const assets = await listAssets(destRoot);
  for (const asset of assets) {
    // Stored paths stay relative and resolve to real files at the new root.
    expect(path.isAbsolute(asset.relativePath)).toBe(false);
    expect(fs.existsSync(resolveInProject(destRoot, asset.relativePath))).toBe(true);
  }
  const integrity = await verifyProjectIntegrity(destRoot);
  expect(integrity.summary).toMatchObject({ total: assets.length, ok: assets.length, missing: 0, modified: 0 });
  return { metadata, assets };
}

describe("S1.9 project portability", () => {
  it("a copied project opens at a completely different path", async () => {
    const { projRoot } = await buildProject("Portable");
    // Simulate a different machine: unrelated base dir, different nesting depth.
    const destParent = fs.mkdtempSync(path.join(os.tmpdir(), "moved-projects-"));
    const dest = path.join(destParent, "nested", "deep", "Portable");
    copyProject(projRoot, dest);
    await assertProjectOpens(dest);
  });

  it("a moved project still opens after the original is gone", async () => {
    const { projRoot } = await buildProject("Movable");
    const destParent = fs.mkdtempSync(path.join(os.tmpdir(), "destination-"));
    const dest = path.join(destParent, "Movable");
    copyProject(projRoot, dest);
    fs.rmSync(projRoot, { recursive: true, force: true });
    expect(fs.existsSync(projRoot)).toBe(false);
    await assertProjectOpens(dest);
  });

  it("no machine-specific absolute paths are stored inside the project", async () => {
    const { projRoot } = await buildProject("Clean");
    const destParent = fs.mkdtempSync(path.join(os.tmpdir(), "elsewhere-"));
    const dest = path.join(destParent, "Clean");
    copyProject(projRoot, dest);
    const marker = fs.readFileSync(path.join(dest, "project.json"), "utf8");
    expect(marker).not.toContain(parentDir);
    expect(marker).not.toContain(os.tmpdir());
    const metadata = await getProjectMetadata(dest);
    expect(metadata.name).not.toContain(parentDir);
    const { createProjectMetadata } = require(built("metadata.js"));
    void createProjectMetadata;
    const assetRowDump = JSON.stringify(await listAssets(dest));
    expect(assetRowDump).not.toContain(parentDir);
    expect(` ${assetRowDump} `).not.toContain(destParent);
  });

  it("listProjects works at the new location (operations API)", async () => {
    const { projRoot } = await buildProject("Listable");
    const destParent = fs.mkdtempSync(path.join(os.tmpdir(), "library-"));
    const dest = path.join(destParent, "Listable");
    copyProject(projRoot, dest);
    const list = await listProjects(destParent);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ root: dest, name: "Listable" });
  });

  it("project identity and metadata survive the move unchanged", async () => {
    const { projRoot, projectId } = await buildProject("Stable");
    const before = await getProjectMetadata(projRoot);
    const destParent = fs.mkdtempSync(path.join(os.tmpdir(), "moved-"));
    const dest = path.join(destParent, "Stable");
    copyProject(projRoot, dest);
    const after = await getProjectMetadata(dest);
    expect(after.projectId).toBe(projectId);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.name).toBe(before.name);
  });
});
