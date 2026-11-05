// S0.6 Configuration and User Paths tests.
//
// Proves the spec acceptance:
// - No hardcoded machine-specific paths (service uses app.getPath("userData"))
// - Configuration can be read and updated safely (defaults, round-trip,
//   atomic write, corrupt-file backup, version migration, traversal guard)
//
// The service is imported from the built `out/node/core/config/service.js`
// with a fresh temp userData dir per test, so tests run in plain Node
// without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/config/service.js");
if (!fs.existsSync(servicePath)) {
  throw new Error("Missing out/node/core/config/service.js — run 'npm run build' first");
}

const { createConfigService, DEFAULT_CONFIG, CONFIG_VERSION } = require(servicePath);

let tmpBase;
let svc;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-config-"));
  svc = createConfigService(tmpBase);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S0.6 configuration service", () => {
  it("returns defaults when no file exists and does not require a display", () => {
    const cfg = svc.loadConfig();
    expect(cfg).toEqual(DEFAULT_CONFIG);
    expect(cfg.version).toBe(CONFIG_VERSION);
  });

  it("ensureConfigDir creates the settings location", () => {
    expect(fs.existsSync(svc.getConfigDir())).toBe(false);
    svc.ensureConfigDir();
    expect(fs.existsSync(svc.getConfigDir())).toBe(true);
  });

  it("settings live under userData/config/config.json (never a hardcoded path)", () => {
    expect(svc.getUserDataDir()).toBe(tmpBase);
    expect(svc.getConfigDir()).toBe(path.join(tmpBase, "config"));
    expect(svc.getConfigPath()).toBe(path.join(tmpBase, "config", "config.json"));
  });

  it("round-trips a save through loadConfig", () => {
    const saved = svc.saveConfig({ ...DEFAULT_CONFIG, theme: "dark", logLevel: "debug" });
    expect(saved.theme).toBe("dark");
    expect(svc.loadConfig()).toEqual(saved);
  });

  it("updateConfig merges a patch and persists safely", () => {
    svc.saveConfig(DEFAULT_CONFIG);
    const next = svc.updateConfig({ theme: "light", launchAtStartup: true });
    expect(next.theme).toBe("light");
    expect(next.launchAtStartup).toBe(true);
    expect(svc.loadConfig().theme).toBe("light");
  });

  it("resetConfig restores defaults", () => {
    svc.saveConfig({ ...DEFAULT_CONFIG, theme: "dark" });
    expect(svc.resetConfig()).toEqual(DEFAULT_CONFIG);
    expect(svc.loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("writes atomically — no tmp residue, file is valid JSON", () => {
    svc.saveConfig(DEFAULT_CONFIG);
    const files = fs.readdirSync(svc.getConfigDir());
    expect(files.filter((f) => f.includes(".tmp-"))).toEqual([]);
    const parsed = JSON.parse(fs.readFileSync(svc.getConfigPath(), "utf8"));
    expect(parsed.version).toBe(CONFIG_VERSION);
  });

  it("corrupt JSON falls back to defaults and preserves a backup", () => {
    svc.ensureConfigDir();
    fs.writeFileSync(svc.getConfigPath(), "{not json", "utf8");
    expect(svc.loadConfig()).toEqual(DEFAULT_CONFIG);
    const backups = fs.readdirSync(svc.getConfigDir()).filter((f) => f.includes(".bak-"));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it("migrates older versions by filling current defaults", () => {
    svc.ensureConfigDir();
    fs.writeFileSync(svc.getConfigPath(), JSON.stringify({ version: 0, theme: "dark" }), "utf8");
    const migrated = svc.loadConfig();
    expect(migrated.version).toBe(CONFIG_VERSION);
    expect(migrated.theme).toBe("dark");
    expect(migrated.logLevel).toBe(DEFAULT_CONFIG.logLevel);
  });

  it("rejects user-data paths that escape the userData directory", () => {
    expect(() => svc.getUserDataSubPath("..", "etc", "passwd")).toThrow(/escapes/);
    expect(svc.getUserDataSubPath("projects").startsWith(tmpBase)).toBe(true);
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/config/service.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
    expect(code).toContain('app.getPath("userData")');
  });

  it("main creates the settings location on startup", () => {
    const mainCode = stripLineComments(fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8"));
    // Built main imports the config service and ensures the dir on ready.
    expect(mainCode).toContain("defaultConfigService");
    expect(mainCode).toContain("ensureConfigDir");
  });
});
