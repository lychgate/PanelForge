// S3.1 Source document records tests.
//
// Proves the spec acceptance: imported originals are preserved
// byte-for-byte, hash-verifiable, and re-openable from project storage.
//
// - import copies the original into manuscripts/original/, registers
//   the asset, and inserts the row (title/format/size/hash/timestamps).
// - get/list round-trip; unknown IDs return null.
// - re-open reads back the exact bytes; verify detects ok/modified/
//   missing/unreadable without mutating.
// - invalid format/missing source reject with typed errors.
//
// Imported from the built `out/node/core/project/manuscripts.js` with
// fresh temp projects per test, so tests run in plain Node.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
if (!fs.existsSync(manuscriptsPath)) {
  throw new Error("Missing out/node/core/project/manuscripts.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
if (!fs.existsSync(servicePath)) {
  throw new Error("Missing out/node/core/project/service.js — run 'npm run build' first");
}

const { createProject } = require(servicePath);
const {
  importManuscript,
  getManuscript,
  listManuscripts,
  readManuscriptOriginal,
  verifyManuscript,
  detectManuscriptFormat,
} = require(manuscriptsPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

function writeSource(name, bytes) {
  const full = path.join(scratch, name);
  fs.writeFileSync(full, bytes);
  return full;
}

describe("S3.1 source document records", () => {
  it("imports preserve the original byte-for-byte with hash + metadata", async () => {
    const bytes = Buffer.from("Chapter One\n\nThere was a girl.", "utf8");
    const source = writeSource("story.txt", bytes);
    const record = await importManuscript(projectRoot, { sourceAbsolutePath: source });
    expect(record.title).toBe("story");
    expect(record.format).toBe("txt");
    expect(record.byteSize).toBe(bytes.length);
    expect(record.contentHash).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));
    expect(record.relativePath).toMatch(/^manuscripts\/original\//);
    expect(record.manuscriptId).toBeTruthy();
    expect(record.createdAt).toBeTruthy();
    // Re-openable byte-for-byte; source file untouched.
    expect(readManuscriptOriginal(projectRoot, record).equals(bytes)).toBe(true);
    expect(fs.readFileSync(source).equals(bytes)).toBe(true);
    expect(verifyManuscript(projectRoot, record).status).toBe("ok");
  });

  it("get/list round-trip; formats detect by extension", async () => {
    expect(detectManuscriptFormat("a.md")).toBe("md");
    expect(detectManuscriptFormat("a.markdown")).toBe("md");
    expect(detectManuscriptFormat("a.docx")).toBe("docx");
    expect(detectManuscriptFormat("a.exe")).toBe(null);
    const a = await importManuscript(projectRoot, { sourceAbsolutePath: writeSource("one.txt", "one") });
    const b = await importManuscript(projectRoot, { sourceAbsolutePath: writeSource("two.md", "# Two"), title: "Custom Title" });
    expect((await getManuscript(projectRoot, a.manuscriptId))?.title).toBe("one");
    expect(b.title).toBe("Custom Title");
    expect(await getManuscript(projectRoot, "missing")).toBeNull();
    const listed = await listManuscripts(projectRoot);
    expect(listed.map((r) => r.title)).toEqual(["one", "Custom Title"]);
  });

  it("verify detects modified, missing, and unreadable without mutating", async () => {
    const record = await importManuscript(projectRoot, {
      sourceAbsolutePath: writeSource("victim.txt", "original"),
    });
    const abs = path.join(projectRoot, record.relativePath);
    expect(verifyManuscript(projectRoot, record).status).toBe("ok");
    fs.writeFileSync(abs, "tampered");
    expect(verifyManuscript(projectRoot, record)).toMatchObject({ status: "modified" });
    expect(readManuscriptOriginal(projectRoot, record).toString()).toBe("tampered"); // still readable
    fs.rmSync(abs);
    expect(verifyManuscript(projectRoot, record)).toMatchObject({ status: "missing" });
    expect(() => readManuscriptOriginal(projectRoot, record)).toThrow(/missing/);
  });

  it("invalid formats and missing sources reject with typed errors", async () => {
    await expect(
      importManuscript(projectRoot, { sourceAbsolutePath: writeSource("x.exe", "MZ") })
    ).rejects.toMatchObject({ code: "INVALID_FORMAT" });
    await expect(
      importManuscript(projectRoot, { sourceAbsolutePath: path.join(scratch, "absent.txt") })
    ).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
    // Explicit unknown format also rejects even for readable extensions.
    await expect(
      importManuscript(projectRoot, { sourceAbsolutePath: writeSource("y.txt", "hi"), format: "pdf", title: " " })
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("manuscripts table migrates into existing projects (v3)", async () => {
    const { openProjectDatabase } = require(path.join(root, "out/node/core/project/metadata.js"));
    const { db } = openProjectDatabase(projectRoot);
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations").all().map((r) => Number(r.version));
      expect(versions).toContain(3);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => String(r.name));
      expect(tables).toContain("manuscripts");
    } finally {
      db.close();
    }
  });
});
