// S3.3 Chapter extraction tests.
//
// Proves the spec acceptance: a fixture manuscript segments into
// expected chapters with exact spans; segmentation never alters source
// text.
//
// - Markdown ATX + CHAPTER/PART + all-caps headings segment exactly.
// - Front matter / no-heading fallbacks tile the whole text.
// - Spans tile contiguously (joining reconstructs normalized text).
// - store/list round-trips through the project DB; spans resolve onto
//   original bytes via the S3.2 map.
//
// Imported from the built `out/node/core/project/chapters.js` with
// fresh temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");
if (!fs.existsSync(chaptersPath)) {
  throw new Error("Missing out/node/core/project/chapters.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");

const { createProject } = require(servicePath);
const { importManuscript, readManuscriptOriginal } = require(manuscriptsPath);
const { storeNormalization, getNormalization, sourceSpanFor } = require(normalizePath);
const { matchChapterHeading, extractChapters, storeChapters, listChapters } = require(chaptersPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

function importFixture(name, text) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, text);
  return importManuscript(projectRoot, { sourceAbsolutePath: source });
}

describe("S3.3 chapter extraction", () => {
  it("ATX + CHAPTER/PART + all-caps headings segment into expected chapters", () => {
    const text = "Intro prose.\n\n# First\n\nA\n\nCHAPTER 2\n\nB\n\nANOTHER TITLE\n\nC";
    const spans = extractChapters(text);
    expect(spans.map((s) => s.title)).toEqual(["(Front matter)", "First", "CHAPTER 2", "ANOTHER TITLE"]);
    // Spans tile the whole text contiguously (no text added/removed).
    expect(spans[0].normStart).toBe(0);
    for (let i = 1; i < spans.length; i++) expect(spans[i].normStart).toBe(spans[i - 1].normEnd);
    expect(spans[spans.length - 1].normEnd).toBe(text.length);
    expect(spans.map((s) => text.slice(s.normStart, s.normEnd)).join("")).toBe(text);
  });

  it("free prose with caps never matches; empty text yields no chapters", () => {
    expect(matchChapterHeading("HE yelled across the valley")).toBeNull();
    expect(matchChapterHeading("CHAPTER 5")).toBe("CHAPTER 5");
    expect(matchChapterHeading("## Setup")).toBe("Setup");
    expect(extractChapters("")).toEqual([]);
    expect(extractChapters("plain prose")).toEqual([
      { title: "(Untitled)", normStart: 0, normEnd: 11, sortOrder: 0 },
    ]);
  });

  it("spans resolve onto original bytes exactly (CRLF originals)", async () => {
    const text = "# One\r\n\r\nAlpha\r\n\r\n# Two\r\n\r\nBeta";
    const record = await importFixture("crlf.md", text);
    await storeNormalization(projectRoot, record.manuscriptId);
    const chapters = await storeChapters(projectRoot, record.manuscriptId);
    expect(chapters.map((c) => c.title)).toEqual(["One", "Two"]);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const original = readManuscriptOriginal(projectRoot, record);
    for (const chapter of chapters) {
      const expected = normalization.normalizedText.slice(chapter.normStart, chapter.normEnd);
      const actual = sourceSpanFor(original, normalization.offsetMap, chapter.normStart, chapter.normEnd).toString("utf8");
      // Original slice folds back to the normalized span exactly.
      expect(actual.replace(/\r\n/g, "\n")).toBe(expected);
    }
    // listChapters round-trips in reading order.
    expect((await listChapters(projectRoot, record.manuscriptId)).map((c) => c.title)).toEqual(["One", "Two"]);
  });

  it("segmentation is deterministic (re-run identical)", async () => {
    const record = await importFixture("det.md", "CHAPTER 1\n\nX\n\nCHAPTER 2\n\nY");
    await storeNormalization(projectRoot, record.manuscriptId);
    const first = await storeChapters(projectRoot, record.manuscriptId);
    const second = await storeChapters(projectRoot, record.manuscriptId);
    const strip = (rows) => rows.map(({ title, normStart, normEnd, sortOrder }) => ({ title, normStart, normEnd, sortOrder }));
    expect(strip(second)).toEqual(strip(first));
    expect(await listChapters(projectRoot, record.manuscriptId)).toHaveLength(2);
  });

  it("missing normalization rejects with NOT_FOUND", async () => {
    const record = await importFixture("bare.txt", "CHAPTER 1\n\nx");
    await expect(storeChapters(projectRoot, record.manuscriptId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listChapters(projectRoot, record.manuscriptId)).toEqual([]);
  });
});
