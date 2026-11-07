// S8U.3 Scenes UI tests.
//
// Proves the spec acceptance: scenes read and derive fully without
// opening the filesystem; originals preserved.
//
// - Scenes IPC channels validate args and route to the existing S3.4
//   core services (list/derive).
// - list is empty before derive; derive segments every chapter in
//   reading order with tiling spans; unknown ids and derive without
//   normalization/chapters surface typed codes.
// - The built renderer contains the scenes view and its shortcut,
//   with no raw IPC or Node access.
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

// Mocked electron for the IPC registry (same pattern as tests/text-ui.test.js).
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

describe("S8U.3 scenes view model + IPC", () => {
  it("IPC: scenes channels registered and validate args", async () => {
    const channels = byChannel();
    const scenesChannels = handleCalls.filter((c) => c.channel.startsWith("panelforge:scenes."));
    expect(scenesChannels).toHaveLength(2);
    expect(channels[IPC_CHANNELS.scenesList]).toBeDefined();
    expect(channels[IPC_CHANNELS.scenesDerive]).toBeDefined();
    expect((await channels[IPC_CHANNELS.scenesList]({}, { args: {} })).code).toBe("INVALID_ARGUMENTS");
    expect((await channels[IPC_CHANNELS.scenesList]({}, { args: { root: projectRoot, manuscriptId: "" } })).code).toBe(
      "INVALID_ARGUMENTS"
    );
    expect((await channels[IPC_CHANNELS.scenesDerive]({}, { args: { root: projectRoot } })).code).toBe(
      "INVALID_ARGUMENTS"
    );
  });

  it("IPC: txt manuscript — empty list, normalize + chapters, derive tiles every chapter", async () => {
    const channels = byChannel();
    const source = writeSource(
      "book.md",
      Buffer.from(
        "# One\n\nIntro one.\n\nINT. HOUSE - DAY\n\nBody A.\n\n***\n\nAfter break.\n\nCHAPTER 2\n\nBeta body.\n",
        "utf8"
      )
    );
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source, title: "Book" },
    });
    expect(imported.ok).toBe(true);
    const manuscriptId = imported.data.manuscript.manuscriptId;

    const before = await channels[IPC_CHANNELS.scenesList]({}, { args: { root: projectRoot, manuscriptId } });
    expect(before.ok).toBe(true);
    expect(before.data.scenes).toHaveLength(0);

    const normalized = await channels[IPC_CHANNELS.textNormalize]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(normalized.ok).toBe(true);
    const derived = await channels[IPC_CHANNELS.chaptersDerive]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(derived.ok).toBe(true);
    expect(derived.data.chapters.map((c) => c.title)).toEqual(["One", "CHAPTER 2"]);

    const scenes = await channels[IPC_CHANNELS.scenesDerive]({}, { args: { root: projectRoot, manuscriptId } });
    expect(scenes.ok).toBe(true);
    expect(scenes.data.scenes.length).toBeGreaterThanOrEqual(3);
    const titles = scenes.data.scenes.map((s) => s.title);
    expect(titles).toContain("INT. HOUSE - DAY");
    for (const scene of scenes.data.scenes) {
      expect(scene.source).toBe("auto");
      expect(scene.normEnd).toBeGreaterThan(scene.normStart);
      expect(scene.chapterId).toBeDefined();
    }
    // Scenes of each chapter tile that chapter's span contiguously.
    const text = normalized.data.normalization.normalizedText;
    for (const chapter of derived.data.chapters) {
      const own = scenes.data.scenes.filter((s) => s.chapterId === chapter.chapterId);
      expect(own.length).toBeGreaterThan(0);
      expect(own[0].normStart).toBe(chapter.normStart);
      expect(own[own.length - 1].normEnd).toBe(chapter.normEnd);
      for (let i = 1; i < own.length; i++) {
        expect(own[i].normStart).toBe(own[i - 1].normEnd);
      }
      const joined = own.map((s) => text.slice(s.normStart, s.normEnd)).join("");
      expect(joined).toBe(text.slice(chapter.normStart, chapter.normEnd));
    }

    const listed = await channels[IPC_CHANNELS.scenesList]({}, { args: { root: projectRoot, manuscriptId } });
    expect(listed.ok).toBe(true);
    expect(listed.data.scenes).toHaveLength(scenes.data.scenes.length);
    expect(listed.data.scenes.map((s) => s.sceneId)).toEqual(scenes.data.scenes.map((s) => s.sceneId));
  });

  it("IPC: unknown id rejects; derive without chapters surfaces typed NOT_FOUND", async () => {
    const channels = byChannel();
    const source = writeSource("plain.txt", Buffer.from("Just prose.\n", "utf8"));
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source },
    });
    expect(imported.ok).toBe(true);
    const manuscriptId = imported.data.manuscript.manuscriptId;

    const missing = await channels[IPC_CHANNELS.scenesList]({}, { args: { root: projectRoot, manuscriptId: "missing" } });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe("NOT_FOUND");

    // No normalization yet: derive must report NOT_FOUND, never silently empty.
    const noNorm = await channels[IPC_CHANNELS.scenesDerive]({}, { args: { root: projectRoot, manuscriptId } });
    expect(noNorm.ok).toBe(false);
    expect(noNorm.code).toBe("NOT_FOUND");

    await channels[IPC_CHANNELS.textNormalize]({}, { args: { root: projectRoot, manuscriptId } });
    const noChapters = await channels[IPC_CHANNELS.scenesDerive]({}, { args: { root: projectRoot, manuscriptId } });
    expect(noChapters.ok).toBe(false);
    expect(noChapters.code).toBe("NOT_FOUND");
  });

  it("built renderer carries the scenes view and no raw IPC", () => {
    const renderer = fs.readFileSync(rendererPath, "utf8");
    expect(renderer).toContain("scenes");
    expect(renderer).toContain("Alt+8");
    expect(renderer).toContain("Load manuscripts");
    expect(renderer).toContain("Derive scenes");
    expect(renderer).toContain("No scenes yet.");
    expect(renderer).toContain("scenes-status");
    expect(renderer).toContain("scenes-list");
    expect(renderer).toContain("Show scene:");
    // No raw IPC or Node access in the renderer.
    expect(renderer).not.toContain("ipcRenderer.invoke");
    expect(renderer).not.toContain("ipcRenderer.on");
    expect(renderer).not.toContain('require("fs")');
    expect(renderer).not.toContain('require("path")');
    expect(renderer).not.toContain('from "electron"');
  });
});
