// S1.1 Project Folder Format tests.
//
// Proves the spec acceptance:
// - A valid project can be identified and version-checked
// - Folder specification (full sec. 7.1 tree), version marker, initial metadata
// - D5: project.json is the marker; database/project.db is authoritative
//
// Imported from the built `out/node/core/project/service.js` with a fresh
// temp project root per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/project/service.js");
if (!fs.existsSync(servicePath)) {
  throw new Error("Missing out/node/core/project/service.js — run 'npm run build' first");
}

const {
  PROJECT_FORMAT_VERSION,
  PROJECT_MARKER_FILE,
  PROJECT_DATABASE_DIR,
  PROJECT_DATABASE_FILE,
  PROJECT_DIRECTORIES,
  createProject,
  identifyProject,
  resolveProjectPath,
} = require(servicePath);

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-project-"));
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S1.1 project folder format", () => {
  it("createProject writes the version marker with format version and project ID", () => {
    const metadata = createProject(tmpRoot);
    expect(metadata.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(typeof metadata.projectId).toBe("string");
    expect(metadata.projectId.length).toBeGreaterThan(0);
    expect(typeof metadata.createdAt).toBe("string");
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpRoot, PROJECT_MARKER_FILE), "utf8"));
    expect(onDisk).toEqual(metadata);
  });

  it("createProject creates the full sec. 7.1 directory tree", () => {
    createProject(tmpRoot);
    expect(PROJECT_DIRECTORIES).toContain("manuscripts/original");
    expect(PROJECT_DIRECTORIES).toContain("artwork/approved");
    for (const dir of PROJECT_DIRECTORIES) {
      expect(fs.statSync(path.join(tmpRoot, dir)).isDirectory()).toBe(true);
    }
  });

  it("database/project.db is the authoritative store path (D5)", () => {
    expect(PROJECT_DATABASE_DIR).toBe("database");
    expect(PROJECT_DATABASE_FILE).toBe("project.db");
  });

  it("identifyProject recognizes a created project", () => {
    const metadata = createProject(tmpRoot);
    const result = identifyProject(tmpRoot);
    expect(result.ok).toBe(true);
    expect(result.metadata).toEqual(metadata);
  });

  it("identifyProject rejects missing directories and directories without a marker", () => {
    expect(identifyProject(path.join(tmpRoot, "does-not-exist"))).toMatchObject({
      ok: false,
      code: "NOT_A_PROJECT",
    });
    const bare = path.join(tmpRoot, "bare");
    fs.mkdirSync(bare);
    expect(identifyProject(bare)).toMatchObject({ ok: false, code: "NOT_A_PROJECT" });
  });

  it("identifyProject reports a corrupt marker", () => {
    fs.writeFileSync(path.join(tmpRoot, PROJECT_MARKER_FILE), "{not json", "utf8");
    expect(identifyProject(tmpRoot)).toMatchObject({ ok: false, code: "CORRUPT_MARKER" });
  });

  it("identifyProject rejects a newer unsupported format version", () => {
    fs.writeFileSync(
      path.join(tmpRoot, PROJECT_MARKER_FILE),
      JSON.stringify({
        formatVersion: PROJECT_FORMAT_VERSION + 100,
        projectId: "00000000-0000-0000-0000-000000000000",
        createdAt: new Date().toISOString(),
      }),
      "utf8"
    );
    expect(identifyProject(tmpRoot)).toMatchObject({ ok: false, code: "UNSUPPORTED_VERSION" });
  });

  it("resolveProjectPath resolves relative paths inside the project root", () => {
    expect(resolveProjectPath(tmpRoot, "characters/robert/profile.json")).toBe(
      path.join(tmpRoot, "characters/robert/profile.json")
    );
    expect(resolveProjectPath(tmpRoot, "artwork/approved")).toBe(path.join(tmpRoot, "artwork", "approved"));
  });

  it("resolveProjectPath rejects absolute and escaping paths", () => {
    expect(() => resolveProjectPath(tmpRoot, "/etc/passwd")).toThrow(/relative/);
    expect(() => resolveProjectPath(tmpRoot, "../outside.txt")).toThrow(/escapes/);
    expect(() => resolveProjectPath(tmpRoot, "artwork/../../outside.txt")).toThrow(/escapes/);
  });

  it("marker write is atomic (valid JSON, no tmp residue)", () => {
    createProject(tmpRoot);
    const files = fs.readdirSync(tmpRoot);
    expect(files.filter((f) => f.includes(".tmp-"))).toEqual([]);
    expect(() => JSON.parse(fs.readFileSync(path.join(tmpRoot, PROJECT_MARKER_FILE), "utf8"))).not.toThrow();
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/service.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
