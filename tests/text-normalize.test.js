// S3.2 TXT/Markdown normalization tests.
//
// Proves the spec acceptance: splitting and joining normalized spans
// reconstructs source offsets exactly; originals untouched.
//
// - CRLF/CR fold to LF with exact byte-offset maps (multi-byte aware).
// - Normalized spans map back to exact original slices in both dirs.
// - store/get round-trips through the DB + processed mirror; codec
//   round-trip preserves originals byte-for-byte.
//
// Imported from the built `out/node/core/project/text-normalize.js`
// with fresh temp projects per test.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");
if (!fs.existsSync(normalizePath)) {
  throw new Error("Missing out/node/core/project/text-normalize.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");

const { createProject } = require(servicePath);
const { importManuscript, readManuscriptOriginal } = require(manuscriptsPath);
const {
  normalizeManuscriptBytes,
  sourceSpanFor,
  spansReconstructOriginal,
  storeNormalization,
  getNormalization,
} = require(normalizePath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

describe("S3.2 TXT/Markdown normalization", () => {
  it("CRLF/CR fold to LF with byte offsets that reconstruct exactly", () => {
    const original = Buffer.from("a\r\nb\rc\r\nd", "utf8");
    const { normalized, offsetMap } = normalizeManuscriptBytes(original);
    expect(normalized).toBe("a\nb\nc\nd");
    expect(offsetMap).toHaveLength(normalized.length + 1);
    // Every split/join span reconstructs exactly.
    for (let s = 0; s <= normalized.length; s++) {
      for (let e = s; e <= normalized.length; e++) {
        expect(spansReconstructOriginal(original, normalized, offsetMap, s, e)).toBe(true);
      }
    }
    // Full span is the whole original.
    expect(sourceSpanFor(original, offsetMap, 0, normalized.length).equals(original)).toBe(true);
  });

  it("multi-byte characters map by bytes, not chars", () => {
    const original = Buffer.from("café\r\n×", "utf8"); // é = 2 bytes, × = 2 bytes
    const { normalized, offsetMap } = normalizeManuscriptBytes(original);
    expect(normalized).toBe("café\n×");
    expect(offsetMap[offsetMap.length - 1]).toBe(original.length);
    expect(sourceSpanFor(original, offsetMap, 0, normalized.length).equals(original)).toBe(true);
  });

  it("empty and LF-only inputs pass through unchanged", () => {
    expect(normalizeManuscriptBytes(Buffer.from(""))).toMatchObject({ normalized: "", offsetMap: [0] });
    const lf = Buffer.from("one\ntwo\n", "utf8");
    const { normalized, offsetMap } = normalizeManuscriptBytes(lf);
    expect(normalized).toBe("one\ntwo\n");
    expect(offsetMap).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("store + get round-trips; mirror file matches; original untouched", async () => {
    const bytes = Buffer.from("# Title\r\n\r\nBody\r\nMore.", "utf8");
    const source = path.join(scratch, "book.md");
    fs.writeFileSync(source, bytes);
    const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
    expect(record.format).toBe("md");
    const stored = await storeNormalization(projectRoot, record.manuscriptId);
    expect(stored.normalizedText).toBe("# Title\n\nBody\nMore.");
    expect(stored.processedRelativePath).toMatch(/^manuscripts\/processed\//);
    const mirror = fs.readFileSync(path.join(projectRoot, stored.processedRelativePath), "utf8");
    expect(mirror).toBe(stored.normalizedText);
    // Original preserved untouched + re-open exact.
    expect(readManuscriptOriginal(projectRoot, record).equals(bytes)).toBe(true);
    const loaded = await getNormalization(projectRoot, record.manuscriptId);
    expect(loaded.normalizedText).toBe(stored.normalizedText);
    expect(loaded.offsetMap).toEqual(stored.offsetMap);
    const original = readManuscriptOriginal(projectRoot, record);
    expect(
      sourceSpanFor(original, loaded.offsetMap, 0, loaded.normalizedText.length).equals(original)
    ).toBe(true);
  });

  it("non-text formats reject normalization", async () => {
    const source = path.join(scratch, "book.pdf");
    fs.writeFileSync(source, Buffer.from("%PDF-1.4"));
    const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
    expect(record.format).toBe("pdf");
    await expect(storeNormalization(projectRoot, record.manuscriptId)).rejects.toMatchObject({
      code: "INVALID_FORMAT",
    });
    expect(await getNormalization(projectRoot, "missing")).toBeNull();
  });
});
