// S3.4 Scene extraction tests.
//
// Proves the spec acceptance: a fixture segments into expected scenes;
// overrides correct boundaries without changing source text.
//
// - Rules (*** / ### / location cues) segment the fixture exactly.
// - Scenes link to chapters and tile the chapter slice.
// - Recuts from explicit splits mark rows override; invalid splits
//   reject with typed errors; source bytes stay untouched.
//
// Imported from the built `out/node/core/project/scenes.js` with fresh
// temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scenesPath = path.join(root, "out/node/core/project/scenes.js");
if (!fs.existsSync(scenesPath)) {
  throw new Error("Missing out/node/core/project/scenes.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
const chaptersPath = path.join(root, "out/node/core/project/chapters.js");

const { createProject } = require(servicePath);
const { importManuscript, readManuscriptOriginal } = require(manuscriptsPath);
const { storeNormalization, getNormalization, sourceSpanFor } = require(normalizePath);
const { storeChapters, listChapters } = require(chaptersPath);
const { matchSceneHeading, splitChapterIntoScenes, storeScenes, recutScenes, listScenes } = require(scenesPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

async function importNormalized(name, text) {
  const source = path.join(scratch, name);
  fs.writeFileSync(source, text);
  const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
  await storeNormalization(projectRoot, record.manuscriptId);
  return record;
}

describe("S3.4 scene extraction", () => {
  it("rules segment the fixture: *** + ### + location cues", () => {
    const text = "Wake.\n\n***\n\nINT. TAVERN - NIGHT\n\nDrink.\n\n### Rooftop\n\nWind.";
    const spans = splitChapterIntoScenes(text, 0, text.length);
    expect(spans.map((s) => s.title)).toEqual(["(Scene 1)", "INT. TAVERN - NIGHT", "Rooftop"]);
    // Scenes tile the slice (break lines belong to the scene they open).
    expect(spans[0].normStart).toBe(0);
    for (let i = 1; i < spans.length; i++) expect(spans[i].normStart).toBe(spans[i - 1].normEnd);
    expect(spans[spans.length - 1].normEnd).toBe(text.length);
    expect(spans.map((s) => text.slice(s.normStart, s.normEnd)).join("")).toBe(text);
  });

  it("no breaks yields one untitled auto scene", () => {
    const text = "continuous prose";
    expect(splitChapterIntoScenes(text, 0, text.length)).toEqual([
      { title: "(Scene 1)", normStart: 0, normEnd: text.length, sortOrder: 0, source: "auto" },
    ]);
    expect(matchSceneHeading("***")).toBe("(Scene break)");
    expect(matchSceneHeading("LATER")).toBe("LATER");
  });

  it("scenes link to chapters and resolve onto original bytes", async () => {
    const record = await importNormalized("story.md", "# One\n\nWake.\n\n***\n\nINT. TAVERN - NIGHT\n\nDrink.\n\n# Two\n\nSleep.");
    await storeChapters(projectRoot, record.manuscriptId);
    const chapters = await listChapters(projectRoot, record.manuscriptId);
    expect(chapters.map((c) => c.title)).toEqual(["One", "Two"]);
    const scenes = await storeScenes(projectRoot, record.manuscriptId);
    const chapterOne = scenes.filter((s) => s.chapterId === chapters[0].chapterId);
    expect(chapterOne.map((s) => s.title)).toEqual(["(Scene 1)", "INT. TAVERN - NIGHT"]);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const original = readManuscriptOriginal(projectRoot, record);
    for (const scene of scenes) {
      const expected = normalization.normalizedText.slice(scene.normStart, scene.normEnd);
      const actual = sourceSpanFor(original, normalization.offsetMap, scene.normStart, scene.normEnd).toString("utf8");
      expect(actual.replace(/\r\n/g, "\n")).toBe(expected);
    }
    expect((await listScenes(projectRoot, record.manuscriptId)).map((s) => s.title)).toEqual([
      "(Scene 1)",
      "INT. TAVERN - NIGHT",
      "(Scene 1)",
    ]);
  });

  it("recut overrides correct boundaries without changing source text", async () => {
    const text = "# One\n\nWake.\n\n***\n\nINT. TAVERN - NIGHT\n\nDrink.";
    const record = await importNormalized("override.md", text);
    await storeChapters(projectRoot, record.manuscriptId);
    const [chapter] = await listChapters(projectRoot, record.manuscriptId);
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    const mid = normalization.normalizedText.indexOf("Drink");
    const recut = await recutScenes(projectRoot, record.manuscriptId, chapter.chapterId, [mid], ["Cold open", "Tavern"]);
    expect(recut.map((s) => [s.title, s.source])).toEqual([
      ["Cold open", "override"],
      ["Tavern", "override"],
    ]);
    // Source text untouched: spans still tile the chapter slice.
    expect(recut[0].normStart).toBe(chapter.normStart);
    expect(recut[recut.length - 1].normEnd).toBe(chapter.normEnd);
    expect(recut.map((s) => normalization.normalizedText.slice(s.normStart, s.normEnd)).join("")).toBe(
      normalization.normalizedText.slice(chapter.normStart, chapter.normEnd)
    );
    expect(readManuscriptOriginal(projectRoot, record).toString("utf8")).toBe(text);
    // Out-of-range splits reject with typed errors.
    await expect(recutScenes(projectRoot, record.manuscriptId, chapter.chapterId, [chapter.normStart])).rejects.toMatchObject({
      code: "INVALID_ARGUMENTS",
    });
    await expect(recutScenes(projectRoot, record.manuscriptId, "missing", [])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("missing normalization or chapters rejects with NOT_FOUND", async () => {
    const source = path.join(scratch, "bare.txt");
    fs.writeFileSync(source, "x");
    const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
    await expect(storeScenes(projectRoot, record.manuscriptId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listScenes(projectRoot, record.manuscriptId)).toEqual([]);
  });
});
