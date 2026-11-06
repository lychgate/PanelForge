// S7.2 Workflow template tests.
//
// Proves the spec acceptance: templates round-trip through
// copy/backup/restore; hash mismatch rejects; missing
// templates reject.
//
// - save/get round-trips the workflow object + registry row
//   (name, relative path under workflows/, hash, version).
// - Re-saving a name replaces file + row (new version).
// - Tampered file → TEMPLATE_TAMPERED; deleted file →
//   TEMPLATE_MISSING; unknown name → NOT_FOUND.
// - Backup snapshot + project copy carry the template end
//   to end (getTemplate verifies after restore/copy).
//
// Imported from the built `out/node/core/project/workflow-templates.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const templatesPath = path.join(root, "out/node/core/project/workflow-templates.js");
if (!fs.existsSync(templatesPath)) {
  throw new Error("Missing out/node/core/project/workflow-templates.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const backupPath = path.join(root, "out/node/core/project/backup.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createProjectAt } = require(servicePath.replace("service.js", "operations.js"));
const { createSnapshot, restoreSnapshot } = require(backupPath);
const { saveTemplate, getTemplate, listTemplates } = require(templatesPath);

const WORKFLOW = {
  "1": { class_type: "KSampler", inputs: { seed: 7, width: 512, height: 512 } },
  "2": { class_type: "SaveImage", inputs: { filename_prefix: "panel" } },
};

let projectRoot;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
});

describe("S7.2 workflow templates", () => {
  it("save/get round-trips workflow + registry; re-save replaces version", async () => {
    const saved = await saveTemplate(projectRoot, { name: "Ink Panel", workflow: WORKFLOW, version: "v1" });
    expect(saved.relativePath).toBe("workflows/ink-panel.json");
    expect(saved.version).toBe("v1");
    expect(saved.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(path.join(projectRoot, "workflows/ink-panel.json"))).toBe(true);

    const loaded = await getTemplate(projectRoot, "Ink Panel");
    expect(loaded.workflow).toEqual(WORKFLOW);
    expect(loaded.hash).toBe(saved.hash);
    expect(await listTemplates(projectRoot)).toHaveLength(1);

    const resaved = await saveTemplate(projectRoot, {
      name: "Ink Panel",
      workflow: { ...WORKFLOW, "1": { class_type: "KSampler", inputs: { seed: 8 } } },
      version: "v2",
    });
    expect(resaved.version).toBe("v2");
    expect(resaved.hash).not.toBe(saved.hash);
    expect((await getTemplate(projectRoot, "Ink Panel")).version).toBe("v2");
  });

  it("tampered and missing files refuse with typed errors", async () => {
    await saveTemplate(projectRoot, { name: "Ink Panel", workflow: WORKFLOW });
    const file = path.join(projectRoot, "workflows/ink-panel.json");
    fs.writeFileSync(file, JSON.stringify({ "1": { class_type: "Evil" } }));
    await expect(getTemplate(projectRoot, "Ink Panel")).rejects.toMatchObject({ code: "TEMPLATE_TAMPERED" });

    await saveTemplate(projectRoot, { name: "Ink Panel", workflow: WORKFLOW });
    fs.rmSync(file);
    await expect(getTemplate(projectRoot, "Ink Panel")).rejects.toMatchObject({ code: "TEMPLATE_MISSING" });
    await expect(getTemplate(projectRoot, "No Such")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveTemplate(projectRoot, { name: "../escape", workflow: WORKFLOW })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("backup snapshot + project copy carry templates end to end", async () => {
    await saveTemplate(projectRoot, { name: "Ink Panel", workflow: WORKFLOW, version: "v1" });
    const snapshot = await createSnapshot(projectRoot);
    const restoredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-restored-"));
    fs.rmSync(restoredRoot, { recursive: true, force: true });
    await restoreSnapshot(projectRoot, snapshot.snapshotId, { targetRoot: restoredRoot });
    expect((await getTemplate(restoredRoot, "Ink Panel")).workflow).toEqual(WORKFLOW);

    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-parent-"));
    const { root: copiedRoot } = await createProjectAt(parentDir, "copied", { description: "copy dest" });
    fs.rmSync(copiedRoot, { recursive: true, force: true });
    fs.cpSync(projectRoot, copiedRoot, { recursive: true, dereference: true });
    expect((await getTemplate(copiedRoot, "Ink Panel")).workflow).toEqual(WORKFLOW);
  });

  it("migration v39 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(39);
    } finally {
      db.close();
    }
  });
});
