// S1.6 Asset Integrity Checking tests.
//
// Proves the spec acceptance:
// - Missing asset detection (deleted file reported, with expected hash)
// - Hash verification (tampered file reported as modified, with actual hash)
// - Integrity report (per-asset statuses + summary counts)
//
// Imports the built modules with a fresh temp project per test, so tests
// run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/project/service.js");
const registryPath = path.join(root, "out/node/core/project/registry.js");
const integrityPath = path.join(root, "out/node/core/project/integrity.js");
if (!fs.existsSync(integrityPath)) {
  throw new Error("Missing out/node/core/project/integrity.js — run 'npm run build' first");
}

const { createProject } = require(servicePath);
const { importAsset } = require(registryPath);
const { verifyProjectIntegrity } = require(integrityPath);

let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-integrity-"));
  createProject(tmpRoot);
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

async function buildProjectWithThree() {
  const a = await importAsset(tmpRoot, {
    sourceAbsolutePath: externalFile("a.txt", "alpha"),
    assetType: "t",
    destinationRelative: "safe/a.txt",
  });
  const b = await importAsset(tmpRoot, {
    sourceAbsolutePath: externalFile("b.txt", "beta"),
    assetType: "t",
    destinationRelative: "safe/b.txt",
  });
  const c = await importAsset(tmpRoot, {
    sourceAbsolutePath: externalFile("c.txt", "gamma"),
    assetType: "t",
    destinationRelative: "safe/c.txt",
  });
  return { a, b, c };
}

describe("S1.6 asset integrity", () => {
  it("a clean project verifies fully ok", async () => {
    await buildProjectWithThree();
    const report = await verifyProjectIntegrity(tmpRoot);
    expect(report.summary).toEqual({ total: 3, ok: 3, missing: 0, modified: 0, unreadable: 0 });
    for (const entry of report.entries) {
      expect(entry.status).toBe("ok");
      expect(entry.actualHash).toBe(entry.expectedHash);
    }
    expect(typeof report.projectId).toBe("string");
    expect(typeof report.checkedAt).toBe("string");
  });

  it("a deleted file is reported missing with the expected hash", async () => {
    const { b } = await buildProjectWithThree();
    fs.rmSync(path.join(tmpRoot, "safe/b.txt"));
    const report = await verifyProjectIntegrity(tmpRoot);
    expect(report.summary).toMatchObject({ total: 3, ok: 2, missing: 1 });
    const entry = report.entries.find((e) => e.assetId === b.assetId);
    expect(entry).toMatchObject({ status: "missing", expectedHash: sha("beta"), actualHash: null });
  });

  it("a modified file is reported modified with the actual hash", async () => {
    const { c } = await buildProjectWithThree();
    fs.writeFileSync(path.join(tmpRoot, "safe/c.txt"), "GAMMA", "utf8");
    const report = await verifyProjectIntegrity(tmpRoot);
    expect(report.summary).toMatchObject({ total: 3, ok: 2, modified: 1 });
    const entry = report.entries.find((e) => e.assetId === c.assetId);
    expect(entry).toMatchObject({
      status: "modified",
      expectedHash: sha("gamma"),
      actualHash: sha("GAMMA"),
    });
  });

  it("mixed damage yields accurate per-asset statuses", async () => {
    const { a, b, c } = await buildProjectWithThree();
    fs.rmSync(path.join(tmpRoot, "safe/a.txt"));
    fs.writeFileSync(path.join(tmpRoot, "safe/b.txt"), "BETA", "utf8");
    const report = await verifyProjectIntegrity(tmpRoot);
    const byId = Object.fromEntries(report.entries.map((e) => [e.assetId, e.status]));
    expect(byId[a.assetId]).toBe("missing");
    expect(byId[b.assetId]).toBe("modified");
    expect(byId[c.assetId]).toBe("ok");
    expect(report.summary).toMatchObject({ total: 3, ok: 1, missing: 1, modified: 1, unreadable: 0 });
  });

  it("an empty registry verifies trivially ok", async () => {
    const report = await verifyProjectIntegrity(tmpRoot);
    expect(report.summary).toEqual({ total: 0, ok: 0, missing: 0, modified: 0, unreadable: 0 });
    expect(report.entries).toEqual([]);
  });

  it("requires a valid project marker", async () => {
    const bare = path.join(tmpRoot, "bare");
    fs.mkdirSync(bare);
    await expect(verifyProjectIntegrity(bare)).rejects.toMatchObject({ code: "NOT_A_PROJECT" });
  });

  it("verification never mutates the registry or the files", async () => {
    const { a } = await buildProjectWithThree();
    fs.writeFileSync(path.join(tmpRoot, "safe/a.txt"), "CHANGED", "utf8");
    await verifyProjectIntegrity(tmpRoot);
    expect(fs.readFileSync(path.join(tmpRoot, "safe/a.txt"), "utf8")).toBe("CHANGED");
    const again = await importAsset(tmpRoot, {
      sourceAbsolutePath: externalFile("z.txt", "z"),
      assetType: "t",
      destinationRelative: "safe/z.txt",
    });
    expect(typeof again.assetId).toBe("string");
  });
});
