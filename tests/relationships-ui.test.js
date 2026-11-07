// S8U.4 Relationships UI tests.
//
// Proves the spec acceptance: every extraction links back to source
// from the UI — traversal lands on exact normalized + original text,
// and chain verification reports problems instead of failing silently.
//
// - Relationships IPC channels validate args and route to the existing
//   S3.5 core services (traverse/verify).
// - traverseFromScene round-trips through the envelope with the
//   projected payload (byte length + text, never raw bytes);
//   verifySourceChain passes on well-formed chains and reports
//   problems for missing normalization.
// - The built renderer contains the relationships view and its
//   shortcut, with no raw IPC or Node access.
//
// Imported from the built `out/node/core/ipc/registry.js` with a mocked
// electron module.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const registryPath = path.join(root, "out/node/core/ipc/registry.js");
const rendererPath = path.join(root, "out/web/renderer/index.js");
if (!fs.existsSync(registryPath)) {
  throw new Error("Missing out/node/core/ipc/registry.js — run 'npm run build' first");
}
if (!fs.existsSync(rendererPath)) {
  throw new Error("Missing out/web/renderer/index.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const { createProject } = require(servicePath);

// Mocked electron for the IPC registry (same pattern as tests/scenes-ui.test.js).
const handleCalls = [];
const fakeElectron = {
  ipcMain: {
    handle: (channel, handler) => {
      handleCalls.push({ channel, handler });
    },
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};
let registry;
try {
  registry = require(registryPath);
} finally {
  Module._load = originalLoad;
}
const { IPC_CHANNELS, registerIpcHandlers } = registry;

function byChannel() {
  handleCalls.length = 0;
  registerIpcHandlers();
  return Object.fromEntries(handleCalls.map((c) => [c.channel, c.handler]));
}

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

async function buildChain(channels, name, text) {
  const source = writeSource(name, Buffer.from(text, "utf8"));
  const imported = await channels[IPC_CHANNELS.importImport]({}, {
    args: { root: projectRoot, sourceAbsolutePath: source },
  });
  expect(imported.ok).toBe(true);
  const manuscriptId = imported.data.manuscript.manuscriptId;
  expect((await channels[IPC_CHANNELS.textNormalize]({}, { args: { root: projectRoot, manuscriptId } })).ok).toBe(true);
  expect((await channels[IPC_CHANNELS.chaptersDerive]({}, { args: { root: projectRoot, manuscriptId } })).ok).toBe(true);
  const scenes = await channels[IPC_CHANNELS.scenesDerive]({}, { args: { root: projectRoot, manuscriptId } });
  expect(scenes.ok).toBe(true);
  return { manuscriptId, scenes: scenes.data.scenes };
}

describe("S8U.4 relationships view model + IPC", () => {
  it("IPC: relationships channels registered and validate args", async () => {
    const channels = byChannel();
    const relChannels = handleCalls.filter((c) => c.channel.startsWith("panelforge:relationships."));
    expect(relChannels).toHaveLength(2);
    expect(channels[IPC_CHANNELS.relationshipsTraverse]).toBeDefined();
    expect(channels[IPC_CHANNELS.relationshipsVerifyChain]).toBeDefined();
    expect((await channels[IPC_CHANNELS.relationshipsTraverse]({}, { args: {} })).code).toBe("INVALID_ARGUMENTS");
    expect(
      (await channels[IPC_CHANNELS.relationshipsTraverse]({}, { args: { root: projectRoot, sceneId: "" } })).code
    ).toBe("INVALID_ARGUMENTS");
    expect((await channels[IPC_CHANNELS.relationshipsVerifyChain]({}, { args: { root: projectRoot } })).code).toBe(
      "INVALID_ARGUMENTS"
    );
  });

  it("IPC: every scene traverses to exact normalized + original source text", async () => {
    const channels = byChannel();
    const text = "# One\r\n\r\nWake.\r\n\r\nINT. TAVERN - NIGHT\r\n\r\nDrink.\r\n";
    const { manuscriptId, scenes } = await buildChain(channels, "chain.md", text);
    expect(scenes.length).toBeGreaterThan(0);
    const normalized = await channels[IPC_CHANNELS.textGet]({}, { args: { root: projectRoot, manuscriptId } });
    const fullNormalized = normalized.data.normalization.normalizedText;

    for (const scene of scenes) {
      const trav = await channels[IPC_CHANNELS.relationshipsTraverse]({}, {
        args: { root: projectRoot, sceneId: scene.sceneId },
      });
      expect(trav.ok).toBe(true);
      expect(trav.data.manuscript.manuscriptId).toBe(manuscriptId);
      expect(trav.data.manuscript.title).toBeDefined();
      expect(trav.data.manuscript.format).toBe("md");
      expect(trav.data.chapter.chapterId).toBe(scene.chapterId);
      expect(trav.data.scene.sceneId).toBe(scene.sceneId);
      expect(trav.data.normalizedText).toBe(fullNormalized.slice(scene.normStart, scene.normEnd));
      // Original slice folds back to the normalized slice (CRLF restored).
      expect(trav.data.originalText.replace(/\r\n/g, "\n")).toBe(trav.data.normalizedText);
      expect(trav.data.originalByteLength).toBe(Buffer.byteLength(trav.data.originalText, "utf8"));
      // Raw bytes never cross the wire.
      expect(trav.data.originalBytes).toBeUndefined();
    }
  });

  it("IPC: verify passes on well-formed chains; problems reported, never silent", async () => {
    const channels = byChannel();
    const { manuscriptId } = await buildChain(channels, "ok.md", "# One\n\nWake.\n\nINT. TAVERN - NIGHT\n\nDrink.\n");
    const verified = await channels[IPC_CHANNELS.relationshipsVerifyChain]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(verified.ok).toBe(true);
    expect(verified.data.verification.ok).toBe(true);
    expect(verified.data.verification.problems).toHaveLength(0);

    // Fresh import without normalization: problems, not an error envelope.
    const source = writeSource("bare.txt", Buffer.from("Just prose.\n", "utf8"));
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source, title: "Bare" },
    });
    expect(imported.ok).toBe(true);
    const failed = await channels[IPC_CHANNELS.relationshipsVerifyChain]({}, {
      args: { root: projectRoot, manuscriptId: imported.data.manuscript.manuscriptId },
    });
    expect(failed.ok).toBe(true);
    expect(failed.data.verification.ok).toBe(false);
    expect(failed.data.verification.problems.length).toBeGreaterThan(0);
    expect(failed.data.verification.problems[0].kind).toBe("no-normalization");
  });

  it("IPC: traverse of an unknown scene surfaces typed NOT_FOUND", async () => {
    const channels = byChannel();
    const failed = await channels[IPC_CHANNELS.relationshipsTraverse]({}, {
      args: { root: projectRoot, sceneId: "missing" },
    });
    expect(failed.ok).toBe(false);
    expect(failed.code).toBe("NOT_FOUND");
  });

  it("built renderer carries the relationships view and no raw IPC", () => {
    const renderer = fs.readFileSync(rendererPath, "utf8");
    expect(renderer).toContain("relationships");
    expect(renderer).toContain("Alt+9");
    expect(renderer).toContain("Load manuscripts");
    expect(renderer).toContain("Traverse");
    expect(renderer).toContain("Verify chain");
    expect(renderer).toContain("No scenes yet.");
    expect(renderer).toContain("No problems.");
    expect(renderer).toContain("relationships-status");
    expect(renderer).toContain("relationships-problems");
    // No raw IPC or Node access in the renderer.
    expect(renderer).not.toContain("ipcRenderer.invoke");
    expect(renderer).not.toContain("ipcRenderer.on");
    expect(renderer).not.toContain('require("fs")');
    expect(renderer).not.toContain('require("path")');
    expect(renderer).not.toContain('from "electron"');
  });
});
