// S0.11 Initial Packaging tests.
//
// Proves the spec acceptance prerequisites that can be checked without a
// full GUI launch (the packaged binary itself is launched live in the
// session that produces the build — see register §10):
// - Linux packaging configuration exists (Electron Forge) with a .deb
//   maker; the Forge output dir does not collide with the compiled out/
// - Scripts exist to produce development + packaged builds
// - No native add-on is required (node:sqlite only), so the package is
//   self-contained

const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S0.11 initial packaging", () => {
  it("forge config exists with a Linux .deb maker", () => {
    const configPath = path.join(root, "forge.config.js");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = stripLineComments(fs.readFileSync(configPath, "utf8"));
    expect(config).toContain("@electron-forge/maker-deb");
    expect(config).toContain("outDir");
  });

  it("forge outDir does not collide with the compiled app dir", () => {
    const config = stripLineComments(fs.readFileSync(path.join(root, "forge.config.js"), "utf8"));
    // The compiled app lives in out/ (package.json main) — Forge must not
    // use out/ as its output dir or packager would exclude the app code.
    expect(config).toMatch(/outDir:\s*["']forge-out["']/);
  });

  it("package.json wires the packaging scripts and keeps the canonical launch", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.scripts.package).toBe("electron-forge package");
    expect(pkg.scripts.make).toBe("electron-forge make");
    expect(pkg.scripts.start).toBe("electron .");
    expect(pkg.main).toContain("out/node/main");
    expect(pkg.devDependencies).toHaveProperty("@electron-forge/cli");
    expect(pkg.devDependencies).toHaveProperty("@electron-forge/maker-deb");
  });

  it("no native add-on dependencies that would need a rebuild", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    expect("better-sqlite3" in deps).toBe(false);
    expect("node-gyp" in deps).toBe(false);
  });

  it("forge-out is gitignored (packaged artifacts are not committed)", () => {
    const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    expect(ignore).toContain("forge-out/");
  });
});
