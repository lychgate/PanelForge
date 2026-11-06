// S3.13 Style variants + priority resolution tests.
//
// Proves the spec acceptance (§9.1/§9.2): a contested scene resolves to
// the same winner every time; lock strength + conflicts are visible;
// styles remain guidance, not guarantees.
//
// - Variant CRUD validates style/scope/scopeRef/priority/lock.
// - Priority order panel > character > scene > project; lower number
//   wins inside a scope; total order keeps resolution deterministic.
// - Locked/strong lower variants produce visible warnings.
// - Conflicting style fields are reported; identical ones are silent.
// - No match falls back to the canonical default.
//
// Imported from the built `out/node/core/project/style-variants.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const variantsPath = path.join(root, "out/node/core/project/style-variants.js");
if (!fs.existsSync(variantsPath)) {
  throw new Error("Missing out/node/core/project/style-variants.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const stylesPath = path.join(root, "out/node/core/project/styles.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createStyle } = require(stylesPath);
const { createVariant, listVariants, deleteVariant, resolveStyle } = require(variantsPath);

let projectRoot;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
});

describe("S3.13 style variants + priority resolution", () => {
  it("variant CRUD validates style, scope, scopeRef, priority, lock", async () => {
    const style = await createStyle(projectRoot, { name: "Main" });
    await expect(createVariant(projectRoot, { styleId: "missing", scope: "project" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createVariant(projectRoot, { styleId: style.styleId, scope: "book" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariant(projectRoot, { styleId: style.styleId, scope: "scene" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariant(projectRoot, { styleId: style.styleId, scope: "project", scopeRef: "x" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariant(projectRoot, { styleId: style.styleId, scope: "project", priority: -1 })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(createVariant(projectRoot, { styleId: style.styleId, scope: "project", lockStrength: "iron" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    const variant = await createVariant(projectRoot, { styleId: style.styleId, scope: "scene", scopeRef: "scene-1", priority: 2, lockStrength: "strong" });
    expect(variant).toMatchObject({ styleId: style.styleId, scope: "scene", scopeRef: "scene-1", priority: 2, lockStrength: "strong" });
    expect(await listVariants(projectRoot)).toHaveLength(1);
    expect(await listVariants(projectRoot, { scope: "scene" })).toHaveLength(1);
    expect(await listVariants(projectRoot, { scope: "panel" })).toHaveLength(0);
    await expect(deleteVariant(projectRoot, variant.variantId)).resolves.toBeUndefined();
    expect(await listVariants(projectRoot)).toHaveLength(0);
    await expect(deleteVariant(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("priority order panel > character > scene > project, lower number wins", async () => {
    const projectStyle = await createStyle(projectRoot, { name: "Project" });
    const sceneStyle = await createStyle(projectRoot, { name: "Scene" });
    const characterStyle = await createStyle(projectRoot, { name: "Character" });
    const panelStyle = await createStyle(projectRoot, { name: "Panel" });
    await createVariant(projectRoot, { styleId: projectStyle.styleId, scope: "project", priority: 0 });
    await createVariant(projectRoot, { styleId: sceneStyle.styleId, scope: "scene", scopeRef: "scene-1", priority: 0 });
    await createVariant(projectRoot, { styleId: characterStyle.styleId, scope: "character", scopeRef: "char-1", priority: 0 });
    await createVariant(projectRoot, { styleId: panelStyle.styleId, scope: "panel", scopeRef: "panel-1", priority: 5 });
    const resolved = await resolveStyle(projectRoot, { sceneId: "scene-1", characterId: "char-1", panelId: "panel-1" });
    expect(resolved.styleId).toBe(panelStyle.styleId);
    expect(resolved.scope).toBe("panel");
    expect(resolved.candidates.map((c) => c.scope)).toEqual(["panel", "character", "scene", "project"]);
    const sceneOnly = await resolveStyle(projectRoot, { sceneId: "scene-1" });
    expect(sceneOnly.styleId).toBe(sceneStyle.styleId);
    const none = await resolveStyle(projectRoot, {});
    expect(none.styleId).toBe(projectStyle.styleId);
    expect(none.scope).toBe("project");
  });

  it("contested scene resolves to the same winner every time", async () => {
    const first = await createStyle(projectRoot, { name: "Low" });
    const second = await createStyle(projectRoot, { name: "High" });
    await createVariant(projectRoot, { styleId: second.styleId, scope: "scene", scopeRef: "scene-1", priority: 5 });
    await createVariant(projectRoot, { styleId: first.styleId, scope: "scene", scopeRef: "scene-1", priority: 1 });
    const a = await resolveStyle(projectRoot, { sceneId: "scene-1" });
    const b = await resolveStyle(projectRoot, { sceneId: "scene-1" });
    expect(a.styleId).toBe(first.styleId);
    expect(b.styleId).toBe(first.styleId);
    expect(a.variantId).toBe(b.variantId);
  });

  it("lock strength and conflicts are visible; guidance stays explicit", async () => {
    const winner = await createStyle(projectRoot, { name: "Panel", lighting: "high-key" });
    const locked = await createStyle(projectRoot, { name: "Scene", lighting: "low-key" });
    await createVariant(projectRoot, { styleId: locked.styleId, scope: "scene", scopeRef: "scene-1", lockStrength: "locked" });
    await createVariant(projectRoot, { styleId: winner.styleId, scope: "panel", scopeRef: "panel-1", lockStrength: "none" });
    const resolved = await resolveStyle(projectRoot, { sceneId: "scene-1", panelId: "panel-1" });
    expect(resolved.styleId).toBe(winner.styleId);
    expect(resolved.lockStrength).toBe("none");
    expect(resolved.guidance).toBe("guidance-only");
    expect(resolved.warnings.some((w) => w.includes("locked") && w.includes("overridden"))).toBe(true);
    const lighting = resolved.conflicts.find((c) => c.field === "lighting");
    expect(lighting).toBeTruthy();
    expect(lighting.values).toEqual(["high-key", "low-key"]);
  });

  it("identical styles produce no conflicts; no match falls back to default", async () => {
    const main = await createStyle(projectRoot, { name: "Main", lighting: "flat" });
    const twin = await createStyle(projectRoot, { name: "Twin", lighting: "flat" });
    await createVariant(projectRoot, { styleId: main.styleId, scope: "project" });
    await createVariant(projectRoot, { styleId: twin.styleId, scope: "scene", scopeRef: "scene-1" });
    const resolved = await resolveStyle(projectRoot, { sceneId: "scene-1" });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.warnings).toEqual([]);
    const fallback = await resolveStyle(projectRoot, { sceneId: "other" });
    expect(fallback.styleId).toBe(main.styleId);
    expect(fallback.scope).toBe("project");
    expect(fallback.variantId).not.toBeNull();
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(10);
    } finally {
      db.close();
    }
  });

  it("no variants at all falls back to the canonical default", async () => {
    const only = await createStyle(projectRoot, { name: "Only" });
    const resolved = await resolveStyle(projectRoot, { sceneId: "scene-1" });
    expect(resolved.styleId).toBe(only.styleId);
    expect(resolved.variantId).toBeNull();
    expect(resolved.candidates).toEqual([]);
    expect(resolved.guidance).toBe("guidance-only");
    expect(await listVariants(projectRoot)).toEqual([]);
  });
});
