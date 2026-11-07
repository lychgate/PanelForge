// S8U.2 Text/Chapters UI tests.
//
// Proves the spec acceptance: normalized text + chapters read and
// derive fully without opening the filesystem; originals preserved.
//
// - Text IPC channels validate args and route to the existing
//   S3.2/S3.3 core services (get/normalize + list/derive).
// - text.get returns null before normalize; normalize derives txt/md;
//   chapters derive from stored normalization and list in order;
//   unknown ids and docx-normalize surface typed codes.
// - The built renderer contains the text view and its shortcut,
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

// Mocked electron for the IPC registry (same pattern as tests/import-ui.test.js).
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

describe("S8U.2 text/chapters view model + IPC", () => {
  it("IPC: text/chapters channels registered and validate args", async () => {
    const channels = byChannel();
    const textChannels = handleCalls.filter(
      (c) => c.channel.startsWith("panelforge:text.") || c.channel.startsWith("panelforge:chapters.")
    );
    expect(textChannels).toHaveLength(4);
    expect(channels[IPC_CHANNELS.textGet]).toBeDefined();
    expect(channels[IPC_CHANNELS.textNormalize]).toBeDefined();
    expect(channels[IPC_CHANNELS.chaptersList]).toBeDefined();
    expect(channels[IPC_CHANNELS.chaptersDerive]).toBeDefined();
    expect((await channels[IPC_CHANNELS.textGet]({}, { args: {} })).code).toBe("INVALID_ARGUMENTS");
    expect((await channels[IPC_CHANNELS.textGet]({}, { args: { root: projectRoot, manuscriptId: "" } })).code).toBe(
      "INVALID_ARGUMENTS"
    );
    expect((await channels[IPC_CHANNELS.chaptersDerive]({}, { args: { root: projectRoot } })).code).toBe(
      "INVALID_ARGUMENTS"
    );
  });

  it("IPC: txt manuscript — null text, normalize derives, chapters derive + list", async () => {
    const channels = byChannel();
    const source = writeSource(
      "book.md",
      Buffer.from("# Title\n\nIntro paragraph.\n\nCHAPTER 1\n\nFirst body.\n\nCHAPTER 2\n\nSecond body.\n", "utf8")
    );
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source, title: "Book" },
    });
    expect(imported.ok).toBe(true);
    const manuscriptId = imported.data.manuscript.manuscriptId;

    const before = await channels[IPC_CHANNELS.textGet]({}, { args: { root: projectRoot, manuscriptId } });
    expect(before.ok).toBe(true);
    expect(before.data.normalization).toBeNull();

    const beforeChapters = await channels[IPC_CHANNELS.chaptersList]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(beforeChapters.ok).toBe(true);
    expect(beforeChapters.data.chapters).toHaveLength(0);

    const normalized = await channels[IPC_CHANNELS.textNormalize]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(normalized.ok).toBe(true);
    expect(normalized.data.normalization.normalizedText).toContain("Title");
    expect(normalized.data.normalization.normalizedText).not.toContain("\r");
    expect(normalized.data.normalization.byteLength).toBeGreaterThan(0);
    // Offset map is projected away from the renderer payload.
    expect(normalized.data.normalization.offsetMap).toBeUndefined();

    const derived = await channels[IPC_CHANNELS.chaptersDerive]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(derived.ok).toBe(true);
    const titles = derived.data.chapters.map((c) => c.title);
    expect(titles).toEqual(["Title", "CHAPTER 1", "CHAPTER 2"]);
    for (let i = 0; i < derived.data.chapters.length; i++) {
      expect(derived.data.chapters[i].sortOrder).toBe(i);
      expect(derived.data.chapters[i].normEnd).toBeGreaterThan(derived.data.chapters[i].normStart);
    }
    // Spans tile the normalized text in order.
    const expected = normalized.data.normalization.normalizedText;
    const joined = derived.data.chapters
      .map((c) => expected.slice(c.normStart, c.normEnd))
      .join("");
    expect(joined).toBe(expected);

    const listed = await channels[IPC_CHANNELS.chaptersList]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(listed.ok).toBe(true);
    expect(listed.data.chapters.map((c) => c.title)).toEqual(["Title", "CHAPTER 1", "CHAPTER 2"]);
  });

  it("IPC: docx import carries normalization but normalize rejects typed; unknown id rejects", async () => {
    const channels = byChannel();
    const zlib = require("zlib");
    function buildZip(entries) {
      const locals = [];
      const centrals = [];
      let offset = 0;
      for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, "utf8");
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 8);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        locals.push(local, nameBuf, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(0, 10);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuf);
        offset += local.length + nameBuf.length + data.length;
      }
      const centralSize = centrals.reduce((n, b) => n + b.length, 0);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(entries.length, 8);
      eocd.writeUInt16LE(entries.length, 10);
      eocd.writeUInt32LE(centralSize, 12);
      eocd.writeUInt32LE(offset, 16);
      return Buffer.concat([...locals, ...centrals, eocd]);
    }
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>CHAPTER 1</w:t></w:r></w:p><w:p><w:r><w:t>Body one.</w:t></w:r></w:p></w:body></w:document>`;
    const source = writeSource("book.docx", buildZip([{ name: "word/document.xml", data: Buffer.from(documentXml, "utf8") }]));
    void zlib;
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source },
    });
    expect(imported.ok).toBe(true);
    const manuscriptId = imported.data.manuscript.manuscriptId;

    const text = await channels[IPC_CHANNELS.textGet]({}, { args: { root: projectRoot, manuscriptId } });
    expect(text.ok).toBe(true);
    expect(text.data.normalization.normalizedText).toContain("CHAPTER 1");

    const rejected = await channels[IPC_CHANNELS.textNormalize]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.code).toBe("INVALID_FORMAT");

    const missing = await channels[IPC_CHANNELS.textGet]({}, { args: { root: projectRoot, manuscriptId: "missing" } });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe("NOT_FOUND");

    const missingChapters = await channels[IPC_CHANNELS.chaptersList]({}, {
      args: { root: projectRoot, manuscriptId: "missing" },
    });
    expect(missingChapters.ok).toBe(false);
    expect(missingChapters.code).toBe("NOT_FOUND");

    const derived = await channels[IPC_CHANNELS.chaptersDerive]({}, {
      args: { root: projectRoot, manuscriptId },
    });
    expect(derived.ok).toBe(true);
    expect(derived.data.chapters.length).toBeGreaterThanOrEqual(1);
  });

  it("IPC: chapters derive without normalization surfaces typed NOT_FOUND", async () => {
    const channels = byChannel();
    const source = writeSource("plain.txt", Buffer.from("Just prose.\n", "utf8"));
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source },
    });
    expect(imported.ok).toBe(true);
    const failed = await channels[IPC_CHANNELS.chaptersDerive]({}, {
      args: { root: projectRoot, manuscriptId: imported.data.manuscript.manuscriptId },
    });
    expect(failed.ok).toBe(false);
    expect(failed.code).toBe("NOT_FOUND");
  });

  it("built renderer carries the text view and no raw IPC", () => {
    const renderer = fs.readFileSync(rendererPath, "utf8");
    expect(renderer).toContain("text");
    expect(renderer).toContain("Alt+7");
    expect(renderer).toContain("Load manuscripts");
    expect(renderer).toContain("Normalize");
    expect(renderer).toContain("Derive chapters");
    expect(renderer).toContain("No normalized text for this manuscript.");
    expect(renderer).toContain("No chapters yet.");
    expect(renderer).toContain("text-status");
    expect(renderer).toContain("text-chapters");
    expect(renderer).toContain("Show chapter:");
    // No raw IPC or Node access in the renderer.
    expect(renderer).not.toContain("ipcRenderer.invoke");
    expect(renderer).not.toContain("ipcRenderer.on");
    expect(renderer).not.toContain('require("fs")');
    expect(renderer).not.toContain('require("path")');
    expect(renderer).not.toContain('from "electron"');
  });
});
