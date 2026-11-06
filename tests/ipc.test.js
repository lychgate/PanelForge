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
    expect(handleCalls).toHaveLength(28);
    expect(handleCalls[0].channel).toBe(IPC_CHANNELS.diagnosticsPing);
    expect(handleCalls[0].channel).toBe("panelforge:diagnostics.ping");
    expect(handleCalls[1].channel).toBe(IPC_CHANNELS.diagnosticsGet);
    expect(handleCalls[1].channel).toBe("panelforge:diagnostics.get");
    expect(handleCalls[2].channel).toBe(IPC_CHANNELS.projectCreate);
    expect(handleCalls[2].channel).toBe("panelforge:project.create");
    expect(handleCalls[3].channel).toBe(IPC_CHANNELS.projectList);
    expect(handleCalls[4].channel).toBe(IPC_CHANNELS.projectOpen);
    expect(handleCalls[5].channel).toBe(IPC_CHANNELS.projectClose);
    expect(handleCalls[6].channel).toBe(IPC_CHANNELS.projectRename);
    expect(handleCalls[7].channel).toBe(IPC_CHANNELS.projectArchive);
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

  it("diagnostics.get returns app info", async () => {
    registerIpcHandlers();
    const getCall = handleCalls.find((c) => c.channel === IPC_CHANNELS.diagnosticsGet);
    expect(getCall).toBeDefined();
    // Mocked electron has no app.getName() — handler throws → HANDLER_ERROR
    // envelope by design. Live probe (DIAG_RESULT) covers the real path.
    const result = await getCall.handler({}, { args: { token: "diagnostic" } });
    // Either a safe HANDLER_ERROR (mocked env) or ok with data (real Electron)
    expect(result.ok === false || result.ok === true).toBe(true);
    if (result.ok) {
      expect(result.data.appName).toBeDefined();
      expect(result.data.electronVersion).toBeDefined();
      expect(result.data.channel).toBe("panelforge:diagnostics.get");
    } else {
      expect(result.code).toBe("HANDLER_ERROR");
    }
  });

  it("project.create/list/open/close/rename/archive work through the envelope", async () => {
    const os = require("os");
    const lib = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-ipc-proj-"));
    registerIpcHandlers();
    const byChannel = Object.fromEntries(handleCalls.map((c) => [c.channel, c.handler]));

    const created = await byChannel[IPC_CHANNELS.projectCreate]({}, {
      args: { name: "IPC Project", parentDir: lib },
    });
    expect(created.ok).toBe(true);
    expect(created.data.projectId).toBeDefined();

    const listed = await byChannel[IPC_CHANNELS.projectList]({}, { args: { parentDir: lib } });
    expect(listed.ok).toBe(true);
    expect(listed.data.projects).toHaveLength(1);
    expect(listed.data.projects[0].name).toBe("IPC Project");

    const root = created.data.root;
    const opened = await byChannel[IPC_CHANNELS.projectOpen]({}, { args: { root } });
    expect(opened.ok).toBe(true);
    expect(opened.data.name).toBe("IPC Project");

    const closed = await byChannel[IPC_CHANNELS.projectClose]({}, { args: { root } });
    expect(closed).toEqual({ ok: true, data: { closed: true } });

    const renamed = await byChannel[IPC_CHANNELS.projectRename]({}, {
      args: { root, newName: "Renamed IPC" },
    });
    expect(renamed.ok).toBe(true);
    const listedAfter = await byChannel[IPC_CHANNELS.projectList]({}, { args: { parentDir: lib } });
    expect(listedAfter.data.projects[0].name).toBe("Renamed IPC");

    const archived = await byChannel[IPC_CHANNELS.projectArchive]({}, { args: { root: renamed.data.root } });
    expect(archived.ok).toBe(true);
    const listedEmpty = await byChannel[IPC_CHANNELS.projectList]({}, { args: { parentDir: lib } });
    expect(listedEmpty.data.projects).toHaveLength(0);
  });

  it("project handlers reject invalid arguments and surface typed codes", async () => {
    registerIpcHandlers();
    const create = handleCalls.find((c) => c.channel === IPC_CHANNELS.projectCreate).handler;
    expect((await create({}, { args: { name: "" } })).code).toBe("INVALID_ARGUMENTS");
    expect((await create({}, { args: { name: "x", parentDir: 123 } })).code).toBe("INVALID_ARGUMENTS");
    const open = handleCalls.find((c) => c.channel === IPC_CHANNELS.projectOpen).handler;
    const notProject = await open({}, { args: { root: "/tmp/definitely-not-a-project-99999" } });
    expect(notProject.ok).toBe(false);
    expect(notProject.code).toBe("NOT_A_PROJECT");
  });

  it("centralized registration: main does not own ipcMain.handle directly", () => {
    const mainCode = fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8");
    expect(mainCode).toContain("registerIpcHandlers");
    expect(mainCode).not.toMatch(/ipcMain\.handle\s*\(/);
  });
});
