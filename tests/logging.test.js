// S0.7 Logging and Error Handling tests.
//
// Proves the spec acceptance:
// - Errors are recorded (structured JSON lines; logError captures name+message)
// - Logs remain within configured size limits (rotation into numbered backups)
// - Sensitive information is not unnecessarily logged (redaction, no stacks)
//
// The service is imported from the built `out/node/core/logging/service.js`
// with a fresh temp userData dir per test, so tests run in plain Node
// without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/logging/service.js");
if (!fs.existsSync(servicePath)) {
  throw new Error("Missing out/node/core/logging/service.js — run 'npm run build' first");
}

const {
  createLogService,
  redactSensitive,
  isLogLevel,
  LOG_FILE_NAME,
  DEFAULT_MAX_FILE_BYTES,
  MAX_BACKUPS,
} = require(servicePath);

let tmpBase;
let svc;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-logging-"));
  svc = createLogService(tmpBase);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

function readEntries() {
  return fs
    .readFileSync(svc.getLogPath(), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

describe("S0.7 logging service", () => {
  it("writes consistent JSON entries to userData/logs/panelforge.log", () => {
    expect(svc.getLogDir()).toBe(path.join(tmpBase, "logs"));
    expect(svc.getLogPath()).toBe(path.join(tmpBase, "logs", LOG_FILE_NAME));
    svc.info("hello world");
    const entries = readEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("hello world");
    expect(typeof entries[0].timestamp).toBe("string");
  });

  it("ensureLogDir creates the log location", () => {
    expect(fs.existsSync(svc.getLogDir())).toBe(false);
    svc.ensureLogDir();
    expect(fs.existsSync(svc.getLogDir())).toBe(true);
  });

  it("records errors via logError with name and message, no stack", () => {
    svc.logError(new Error("boom"), "startup");
    const entry = readEntries()[0];
    expect(entry.level).toBe("error");
    expect(entry.message).toContain("startup");
    expect(entry.message).toContain("boom");
    expect(entry.errorName).toBe("Error");
    expect(entry.message).not.toContain("at Object");
    expect(entry.stack).toBeUndefined();
  });

  it("logError handles non-Error values and never throws", () => {
    expect(() => svc.logError(null)).not.toThrow();
    expect(() => svc.logError(undefined)).not.toThrow();
    expect(() => svc.logError({ code: 42 })).not.toThrow();
    expect(readEntries().length).toBeGreaterThanOrEqual(3);
  });

  it("filters entries below the minimum level; setMinLevel works", () => {
    expect(svc.getMinLevel()).toBe("info");
    expect(svc.debug("noisy")).toBeNull();
    expect(fs.existsSync(svc.getLogPath())).toBe(false);
    svc.setMinLevel("debug");
    svc.debug("now visible");
    expect(readEntries()).toHaveLength(1);
    svc.setMinLevel("error");
    expect(svc.warn("hidden")).toBeNull();
    expect(isLogLevel("error")).toBe(true);
    expect(isLogLevel("verbose")).toBe(false);
  });

  it("rotates the active log when it would exceed the size limit", () => {
    const tiny = createLogService(tmpBase, { maxFileBytes: 200, maxBackups: 2 });
    // Each line is ~80 bytes; two writes fit, the third must rotate.
    tiny.info("first line here");
    tiny.info("second line here");
    tiny.info("third line here");
    expect(fs.existsSync(tiny.getLogPath())).toBe(true);
    expect(fs.existsSync(path.join(tiny.getLogDir(), "panelforge-1.log"))).toBe(true);
    const active = fs.readFileSync(tiny.getLogPath(), "utf8");
    expect(active).toContain("third line here");
    const rotated = fs.readFileSync(path.join(tiny.getLogDir(), "panelforge-1.log"), "utf8");
    expect(rotated).toContain("first line here");
  });

  it("keeps at most MAX_BACKUPS rotated files (oldest deleted)", () => {
    const tiny = createLogService(tmpBase, { maxFileBytes: 120, maxBackups: 2 });
    for (let i = 0; i < 8; i++) tiny.info(`entry number ${i} padding`);
    const files = fs.readdirSync(tiny.getLogDir()).sort();
    expect(files).toEqual(["panelforge-1.log", "panelforge-2.log", "panelforge.log"]);
    expect(MAX_BACKUPS).toBeGreaterThan(0);
    expect(DEFAULT_MAX_FILE_BYTES).toBeGreaterThan(0);
  });

  it("redacts credential values and the home directory", () => {
    expect(redactSensitive("connect token=abc123 done")).not.toContain("abc123");
    expect(redactSensitive("connect token=abc123 done")).toContain("[REDACTED]");
    expect(redactSensitive("password: hunter2")).not.toContain("hunter2");
    const home = process.env.HOME || "";
    if (home) {
      expect(redactSensitive(`at ${home}/secret`)).not.toContain(home);
      expect(redactSensitive(`at ${home}/secret`)).toContain("<home>");
    }
  });

  it("never logs sensitive values even via logError", () => {
    svc.logError(new Error("failed token=supersecretvalue"), "ipc");
    const raw = fs.readFileSync(svc.getLogPath(), "utf8");
    expect(raw).not.toContain("supersecretvalue");
    expect(raw).toContain("[REDACTED]");
  });

  it("caps very long messages", () => {
    const long = "x".repeat(5000);
    svc.info(long);
    const entry = readEntries()[0];
    expect(entry.message.length).toBeLessThan(1100);
    expect(entry.message).toContain("[truncated]");
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/core/logging/service.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
    expect(code).toContain('app.getPath("userData")');
  });

  it("main starts the log service from config; registry records handler errors", () => {
    const mainCode = stripLineComments(
      fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8")
    );
    expect(mainCode).toContain("defaultLogService");
    expect(mainCode).toContain("setMinLevel");
    const registryCode = stripLineComments(
      fs.readFileSync(path.join(root, "out/node/core/ipc/registry.js"), "utf8")
    );
    expect(registryCode).toContain("defaultLogService");
    expect(registryCode).toContain("logError");
  });
});
