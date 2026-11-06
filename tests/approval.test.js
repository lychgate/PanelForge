// S4.8 Generation approval tests.
//
// Proves the spec acceptance: pending/rejected versions cannot be
// bound; approval decisions are recorded; existing bindings on a
// later-rejected version warn.
//
// - setApproval records status + rationale + timestamp; rationale
//   required; unknown versions reject.
// - bindVersion refuses pending and rejected versions (NOT_APPROVED).
// - rejection after binding keeps the binding but verifyBindingEra warns.
// - approval steps never touch references or versions.
//
// Imported from the built `out/node/core/project/approval.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const approvalPath = path.join(root, "out/node/core/project/approval.js");
if (!fs.existsSync(approvalPath)) {
  throw new Error("Missing out/node/core/project/approval.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const charactersPath = path.join(root, "out/node/core/project/characters.js");
const versionsPath = path.join(root, "out/node/core/project/character-versions.js");
const bindingPath = path.join(root, "out/node/core/project/version-binding.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { createCharacter } = require(charactersPath);
const { createVersion, getVersion } = require(versionsPath);
const { bindVersion, getBinding, verifyBindingEra } = require(bindingPath);
const { setApproval, getApproval } = require(approvalPath);

let projectRoot;
let robby;
let v7;

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  robby = await createCharacter(projectRoot, { name: "Robby", age: "8" });
  v7 = await createVersion(projectRoot, { characterId: robby.characterId, label: "Robert, age 7", age: "7" });
});

describe("S4.8 generation approval", () => {
  it("versions start pending; decisions record rationale + timestamp", async () => {
    expect(await getApproval(projectRoot, v7.versionId)).toMatchObject({ status: "pending", rationale: "", decidedAt: null });
    const decided = await setApproval(projectRoot, v7.versionId, "approved", "matches approved reference sheet");
    expect(decided.status).toBe("approved");
    expect(decided.rationale).toBe("matches approved reference sheet");
    expect(decided.decidedAt).toBeTruthy();
    expect(await getApproval(projectRoot, v7.versionId)).toMatchObject({ status: "approved" });
  });

  it("rationale is required; unknown statuses and versions reject", async () => {
    await expect(setApproval(projectRoot, v7.versionId, "approved", "")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setApproval(projectRoot, v7.versionId, "maybe", "x")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(setApproval(projectRoot, "missing", "approved", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("pending and rejected versions cannot bind; approved can", async () => {
    await expect(bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await setApproval(projectRoot, v7.versionId, "rejected", "wrong proportions");
    await expect(bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await setApproval(projectRoot, v7.versionId, "approved", "corrected and re-approved");
    const binding = await bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId);
    expect(binding.versionId).toBe(v7.versionId);
  });

  it("a later rejection keeps the binding but warns; references untouched", async () => {
    await setApproval(projectRoot, v7.versionId, "approved", "fixture approval");
    await bindVersion(projectRoot, "panel-1", robby.characterId, v7.versionId);
    await setApproval(projectRoot, v7.versionId, "rejected", "owner revocation");
    expect(await getBinding(projectRoot, "panel-1", robby.characterId)).toMatchObject({ versionId: v7.versionId });
    const era = await verifyBindingEra(projectRoot, "panel-1", robby.characterId, "7");
    expect(era.mismatch).toBe(false);
    expect(era.warnings.some((w) => w.includes("no longer approved"))).toBe(true);
    expect(await getVersion(projectRoot, v7.versionId)).toMatchObject({ label: "Robert, age 7" });
  });

  it("migration v17 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(17);
    } finally {
      db.close();
    }
  });
});
