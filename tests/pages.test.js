// S8.1 Page records tests.
//
// Proves the spec acceptance: pages persist and list per
// manuscript; invalid formats reject typed.
//
// - create/get/list round-trips per manuscript (both
//   formats, size + margin stored).
// - update edits fields; delete removes; unknown ids
//   reject NOT_FOUND.
// - Invalid format/size/margin and unknown manuscripts
//   reject typed; migration v50.
//
// Imported from the built `out/node/core/project/pages.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pagesPath = path.join(root, "out/node/core/project/pages.js");
if (!fs.existsSync(pagesPath)) {
  throw new Error("Missing out/node/core/project/pages.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const metadataPath = path.join(root, "out/node/core/project/metadata.js");

const { createProject } = require(servicePath);
const { importManuscript } = require(manuscriptsPath);
const { createPage, updatePage, deletePage, getPage, listPages } = require(pagesPath);

let projectRoot;
let manuscriptId;
let otherManuscriptId;

async function importBook(title) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
  const source = path.join(scratch, "book.md");
  fs.writeFileSync(source, "# Prologue\n\nOnce.");
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source, title });
  return record.manuscriptId;
}

beforeEach(async () => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  manuscriptId = await importBook("Ravenholt");
  otherManuscriptId = await importBook("Moonlit");
});

describe("S8.1 page records", () => {
  it("pages persist and list per manuscript (both formats)", async () => {
    const traditional = await createPage(projectRoot, {
      manuscriptId,
      title: "Page 1",
      format: "traditional",
      width: 200,
      height: 280,
      margin: 12,
    });
    const webtoon = await createPage(projectRoot, {
      manuscriptId,
      title: "Strip 1",
      format: "webtoon",
      width: 160,
      height: 800,
    });
    expect(webtoon.margin).toBe(10);
    const listed = await listPages(projectRoot, manuscriptId);
    expect(listed.map((page) => page.title)).toEqual(["Page 1", "Strip 1"]);
    expect((await getPage(projectRoot, traditional.pageId)).format).toBe("traditional");
    expect((await getPage(projectRoot, webtoon.pageId)).height).toBe(800);
    expect(await listPages(projectRoot, otherManuscriptId)).toHaveLength(0);
  });

  it("update edits fields; delete removes; unknown ids reject", async () => {
    const created = await createPage(projectRoot, { manuscriptId, title: "Page 1", format: "traditional", width: 200, height: 280 });
    const updated = await updatePage(projectRoot, created.pageId, { title: "Page One", margin: 15 });
    expect(updated.title).toBe("Page One");
    expect(updated.margin).toBe(15);
    expect(updated.format).toBe("traditional");
    await deletePage(projectRoot, created.pageId);
    expect(await getPage(projectRoot, created.pageId)).toBeNull();
    await expect(deletePage(projectRoot, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updatePage(projectRoot, "missing", { title: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("invalid format/size/margin and unknown manuscripts reject typed", async () => {
    await expect(createPage(projectRoot, { manuscriptId, title: "x", format: "scroll", width: 100, height: 100 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(createPage(projectRoot, { manuscriptId, title: "x", format: "traditional", width: 0, height: 100 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(createPage(projectRoot, { manuscriptId, title: "x", format: "traditional", width: 100, height: 100, margin: 60 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(createPage(projectRoot, { manuscriptId: "missing", title: "x", format: "traditional", width: 100, height: 100 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("migration v50 present", async () => {
    const { openProjectDatabase } = require(metadataPath);
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version));
      expect(versions).toContain(50);
    } finally {
      db.close();
    }
  });
});
