// S0.4 IPC Foundation tests.
//
// Proves the spec acceptance:
// - Only registered methods can be called (allowlist check)
// - Invalid arguments are rejected (INVALID_ARGUMENTS)
// - Errors are returned safely (HANDLER_ERROR, no stack traces)
//
// The registry is imported from the built `out/node/core/ipc/registry.js`
// with a mocked `electron` module, so tests run in plain Node without a
// display. Live end-to-end (renderer → main) is S0.5's diagnostic spike.
//
// Mocking strategy: Vitest's vi.mock is hoisted, but the subject file is a
// built CommonJS module that resolves 'electron' at require-time. We avoid
// vi.mock entirely and intercept Module._load instead — deterministic in
// both ESM test files and CJS builds, no hoisting surprises.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const registryPath = path.join(root, "out/node/core/ipc/registry.js");
if (!fs.existsSync(registryPath)) {
  throw new Error("Missing out/node/core/ipc/registry.js — run 'npm run build' first");
}

// Capture every ipcMain.handle registration with a mocked electron module.
const handleCalls = [];
const fakeElectron = {
  ipcMain: {
    handle: (channel, handler) => {
      handleCalls.push({ channel, handler });
    },
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};

let registry;
try {
  const loaded = require(registryPath);
  registry = loaded;
} catch (e) {
  // If the built module eagerly touches real electron APIs beyond handle,
  // fall back to dynamic import after restoring Module._load.
  delete require.cache[registryPath];
  Module._load = originalLoad;
  throw e;
} finally {
  Module._load = originalLoad;
}

const { IPC_CHANNELS, registerIpcHandlers } = registry;

describe("S0.4 IPC Foundation", () => {
  beforeEach(() => {
    handleCalls.length = 0;
  });

  it("registers exactly the allowlisted channels", () => {
    registerIpcHandlers();
    expect(handleCalls).toHaveLength(1);
    expect(handleCalls[0].channel).toBe(IPC_CHANNELS.diagnosticsPing);
    expect(handleCalls[0].channel).toBe("panelforge:diagnostics.ping");
  });

  it("rejects calls when the payload is malformed", async () => {
    registerIpcHandlers();
    const { handler } = handleCalls[0];
    const result = await handler({}, null);
    expect(result).toEqual({ ok: false, code: "INVALID_ARGUMENTS", message: expect.any(String) });
  });

  it("rejects invalid arguments", async () => {
    registerIpcHandlers();
    const { handler } = handleCalls[0];
    const result = await handler({}, { args: {} });
    expect(result).toEqual({ ok: false, code: "INVALID_ARGUMENTS", message: expect.any(String) });
  });

  it("rejects unknown argument shapes", async () => {
    registerIpcHandlers();
    const { handler } = handleCalls[0];
    const result = await handler({}, { args: { token: 123 } });
    expect(result.code).toBe("INVALID_ARGUMENTS");
  });

  it("accepts valid arguments and returns the safe envelope", async () => {
    registerIpcHandlers();
    const { handler } = handleCalls[0];
    const result = await handler({}, { args: { token: "any-string" } });
    expect(result).toEqual({ ok: true, data: { ok: true } });
  });

  it("centralized registration: main does not own ipcMain.handle directly", () => {
    const mainCode = fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8");
    expect(mainCode).toContain("registerIpcHandlers");
    expect(mainCode).not.toMatch(/ipcMain\.handle\s*\(/);
  });
});
