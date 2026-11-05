// S1.4 Relative Asset Path Service tests.
//
// Proves the spec acceptance:
// - Valid project paths resolve correctly (canonical form → fs boundary)
// - Unsafe paths are rejected (traversal, absolute, backslashes, and
//   symlink escapes)
// - Native separators/symlinks are resolved only at the fs boundary
//
// Imported from the built `out/node/core/project/paths.js` with a fresh
// temp project root per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pathsPath = path.join(root, "out/node/core/project/paths.js");
if (!fs.existsSync(pathsPath)) {
  throw new Error("Missing out/node/core/project/paths.js — run 'npm run build' first");
}

const { normalizeRelative, resolveInProject, toStoragePath } = require(pathsPath);

let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-paths-"));
  fs.mkdirSync(path.join(tmpRoot, "characters", "robert"), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, "characters", "robert", "profile.json"), "{}", "utf8");
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S1.4 relative path service", () => {
  it("resolves valid canonical paths against the project root", () => {
    expect(resolveInProject(tmpRoot, "characters/robert/profile.json")).toBe(
      fs.realpathSync(path.join(tmpRoot, "characters/robert/profile.json"))
    );
  });

  it("normalizes duplicate separators, dots, and internal .. (fs boundary only)", () => {
    expect(normalizeRelative("a//b/./c")).toBe("a/b/c");
    expect(normalizeRelative("characters/../locations/x.png")).toBe("locations/x.png");
    expect(resolveInProject(tmpRoot, "characters//robert/../robert/profile.json")).toBe(
      fs.realpathSync(path.join(tmpRoot, "characters/robert/profile.json"))
    );
  });

  it("rejects traversal escapes", () => {
    expect(() => normalizeRelative("../../outside.txt")).toThrow(expect.objectContaining({ code: "ESCAPES_ROOT" }));
    expect(() => normalizeRelative("ok/../../outside.txt")).toThrow(expect.objectContaining({ code: "ESCAPES_ROOT" }));
  });

  it("rejects absolute paths", () => {
    expect(() => normalizeRelative("/etc/passwd")).toThrow(expect.objectContaining({ code: "NOT_RELATIVE" }));
    expect(() => normalizeRelative("C:/windows/evil.txt")).toThrow(expect.objectContaining({ code: "NOT_RELATIVE" }));
  });

  it("rejects non-canonical separators", () => {
    expect(() => normalizeRelative("characters\\robert\\profile.json")).toThrow(
      expect.objectContaining({ code: "INVALID_PATH" })
    );
    expect(() => normalizeRelative("")).toThrow(expect.objectContaining({ code: "INVALID_PATH" }));
  });

  it("rejects symlink escapes: a link inside the project pointing outside", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-outside-"));
    const secret = path.join(outside, "secret.txt");
    fs.writeFileSync(secret, "secret", "utf8");
    const linkDir = path.join(tmpRoot, "characters", "linked");
    fs.symlinkSync(secret, linkDir, "file");
    // The spelling looks valid, but the canonical target is outside the root.
    expect(() => resolveInProject(tmpRoot, "characters/linked")).toThrow(
      expect.objectContaining({ code: "ESCAPES_ROOT" })
    );
  });

  it("accepts symlink targets that stay inside the project", () => {
    const link = path.join(tmpRoot, "characters", "self-link");
    fs.symlinkSync(path.join(tmpRoot, "characters", "robert", "profile.json"), link, "file");
    expect(resolveInProject(tmpRoot, "characters/self-link")).toBe(
      fs.realpathSync(path.join(tmpRoot, "characters/robert/profile.json"))
    );
  });

  it("resolves non-existent files by parent (import flows)", () => {
    const resolved = resolveInProject(tmpRoot, "characters/new-folder/new.png");
    expect(resolved).toBe(path.resolve(tmpRoot, "characters/new-folder/new.png"));
  });

  it("toStoragePath is the inverse of resolveInProject", () => {
    const abs = path.join(tmpRoot, "characters/robert/profile.json");
    expect(toStoragePath(tmpRoot, abs)).toBe("characters/robert/profile.json");
    expect(() => toStoragePath(tmpRoot, "/etc/hostname")).toThrow(
      expect.objectContaining({ code: "ESCAPES_ROOT" })
    );
    expect(() => toStoragePath(tmpRoot, "characters/x")).toThrow(
      expect.objectContaining({ code: "NOT_RELATIVE" })
    );
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/project/paths.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
