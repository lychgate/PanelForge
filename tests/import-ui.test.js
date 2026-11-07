// S8U.1 Import UI tests.
//
// Proves the spec acceptance: a manuscript imports fully without
// opening the filesystem; originals preserved byte-for-byte.
//
// - Import IPC channels validate args and route to the existing
//   S3.1/S3.8/S3.9/S3.10/S6.13 core services (txt/md/docx/epub/pdf autodetect).
// - list/verify/OCR round-trip through the envelope with typed codes.
// - The built renderer contains the import view and its shortcut,
//   with no raw IPC or Node access.
//
// Imported from the built `out/node/core/ipc/registry.js` with a mocked
// electron module.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
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

// Mocked electron for the IPC registry (same pattern as tests/ipc.test.js).
// importPickFile additionally needs BrowserWindow + dialog.
const handleCalls = [];
let dialogResult = { canceled: false, filePaths: [] };
let focusedWindow = null;
const fakeElectron = {
  ipcMain: {
    handle: (channel, handler) => {
      handleCalls.push({ channel, handler });
    },
  },
  BrowserWindow: {
    getFocusedWindow: () => focusedWindow,
  },
  dialog: {
    showOpenDialog: async (...args) => {
      void args;
      return dialogResult;
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
  dialogResult = { canceled: false, filePaths: [] };
  focusedWindow = null;
});

function writeSource(name, bytes) {
  const full = path.join(scratch, name);
  fs.writeFileSync(full, bytes);
  return full;
}

// Minimal stored-entry ZIP writer (no dependency) — from S3.8/S3.9.
function buildZip(entries, deflate = false) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const payload = deflate ? zlib.deflateRawSync(data) : data;
    const method = deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, payload);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
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

function buildDocx() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p><w:p><w:r><w:t>Once upon a time.</w:t></w:r></w:p></w:body></w:document>`;
  return buildZip([{ name: "word/document.xml", data: Buffer.from(documentXml, "utf8") }]);
}

function buildEpub() {
  const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const opf = `<?xml version="1.0"?><package><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;
  const xhtml = `<html><head><title>One</title></head><body><h1>Chapter One</h1><p>Once upon a time.</p></body></html>`;
  return buildZip([
    { name: "META-INF/container.xml", data: Buffer.from(containerXml, "utf8") },
    { name: "OEBPS/content.opf", data: Buffer.from(opf, "utf8") },
    { name: "OEBPS/c1.xhtml", data: Buffer.from(xhtml, "utf8") },
  ]);
}

// Minimal hand-written PDF — from S3.10.
function contentStream(ops) {
  return Buffer.from(`BT /F1 24 Tf ${ops} ET`, "latin1");
}
function buildPdf(streams) {
  let body = "";
  for (const [dict, payload] of streams) {
    body += `1 0 obj\n<< ${dict} >>\nstream\n`;
    body += payload.toString("latin1");
    body += "endstream\nendobj\n2 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n3 0 obj\n<< /Type /Pages /Kids [1 0 R] /Count 1 >>\nendobj\n";
  }
  return Buffer.from(`%PDF-1.4\n${body}trailer\n<< /Root 2 0 R >>\n%%EOF\n`, "latin1");
}

describe("S8U.1 import view model + IPC", () => {
  it("IPC: import channels registered and validate args", async () => {
    const channels = byChannel();
    const importChannels = handleCalls.filter((c) => c.channel.startsWith("panelforge:import."));
    expect(importChannels).toHaveLength(6);
    expect(channels[IPC_CHANNELS.importPickFile]).toBeDefined();
    expect(channels[IPC_CHANNELS.importList]).toBeDefined();
    expect(channels[IPC_CHANNELS.importImport]).toBeDefined();
    expect(channels[IPC_CHANNELS.importVerify]).toBeDefined();
    expect(channels[IPC_CHANNELS.importOcrGet]).toBeDefined();
    expect(channels[IPC_CHANNELS.importOcrUpdate]).toBeDefined();
    expect((await channels[IPC_CHANNELS.importList]({}, { args: {} })).code).toBe("INVALID_ARGUMENTS");
    expect((await channels[IPC_CHANNELS.importImport]({}, { args: { root: projectRoot, sourceAbsolutePath: "relative.txt" } })).code).toBe("INVALID_ARGUMENTS");
    expect((await channels[IPC_CHANNELS.importVerify]({}, { args: { root: projectRoot, manuscriptId: "" } })).code).toBe("INVALID_ARGUMENTS");
    expect((await channels[IPC_CHANNELS.importOcrUpdate]({}, { args: { root: projectRoot, manuscriptId: "x", ocrText: "   " } })).code).toBe("INVALID_ARGUMENTS");
  });

  it("IPC: txt import round-trips through list and verify", async () => {
    const channels = byChannel();
    const source = writeSource("story.txt", Buffer.from("Chapter One\n\nOnce.", "utf8"));
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source, title: "Story" },
    });
    expect(imported.ok).toBe(true);
    expect(imported.data.manuscript.title).toBe("Story");
    expect(imported.data.manuscript.format).toBe("txt");
    expect(imported.data.ocr).toBeNull();
    const listed = await channels[IPC_CHANNELS.importList]({}, { args: { root: projectRoot } });
    expect(listed.ok).toBe(true);
    expect(listed.data.manuscripts).toHaveLength(1);
    expect(listed.data.manuscripts[0].manuscriptId).toBe(imported.data.manuscript.manuscriptId);
    const verified = await channels[IPC_CHANNELS.importVerify]({}, {
      args: { root: projectRoot, manuscriptId: imported.data.manuscript.manuscriptId },
    });
    expect(verified.ok).toBe(true);
    expect(verified.data.status).toBe("ok");
    const missing = await channels[IPC_CHANNELS.importVerify]({}, {
      args: { root: projectRoot, manuscriptId: "missing" },
    });
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe("NOT_FOUND");
  });

  it("IPC: docx and epub import through the same envelope", async () => {
    const channels = byChannel();
    const docxSource = writeSource("book.docx", buildDocx());
    const docx = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: docxSource },
    });
    expect(docx.ok).toBe(true);
    expect(docx.data.manuscript.format).toBe("docx");
    expect(docx.data.ocr).toBeNull();
    const epubSource = writeSource("book.epub", buildEpub());
    const epub = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: epubSource },
    });
    expect(epub.ok).toBe(true);
    expect(epub.data.manuscript.format).toBe("epub");
    const listed = await channels[IPC_CHANNELS.importList]({}, { args: { root: projectRoot } });
    expect(listed.data.manuscripts).toHaveLength(2);
  });

  it("IPC: pdf autodetect imports text PDFs without OCR", async () => {
    const channels = byChannel();
    const pdf = buildPdf([["/Length 0", contentStream("(Hello PDF) Tj")]]);
    const source = writeSource("note.pdf", pdf);
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source, title: "PDF Note" },
    });
    expect(imported.ok).toBe(true);
    expect(imported.data.manuscript.format).toBe("pdf");
    expect(imported.data.ocr).toBeNull();
    const ocr = await channels[IPC_CHANNELS.importOcrGet]({}, {
      args: { root: projectRoot, manuscriptId: imported.data.manuscript.manuscriptId },
    });
    expect(ocr.ok).toBe(true);
    expect(ocr.data.ocr).toBeNull();
  });

  it("IPC: OCR get/update surface typed codes; unknown format rejects", async () => {
    const channels = byChannel();
    const source = writeSource("story.txt", Buffer.from("plain", "utf8"));
    const imported = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: source },
    });
    expect(imported.ok).toBe(true);
    const updateMissing = await channels[IPC_CHANNELS.importOcrUpdate]({}, {
      args: { root: projectRoot, manuscriptId: imported.data.manuscript.manuscriptId, ocrText: "corrected" },
    });
    expect(updateMissing.ok).toBe(false);
    expect(updateMissing.code).toBe("NOT_FOUND");
    const badExt = writeSource("book.exe", Buffer.from("MZ", "utf8"));
    const rejected = await channels[IPC_CHANNELS.importImport]({}, {
      args: { root: projectRoot, sourceAbsolutePath: badExt },
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.code).toBe("INVALID_FORMAT");
  });

  it("built renderer carries the import view and no raw IPC", () => {
    const renderer = fs.readFileSync(rendererPath, "utf8");
    expect(renderer).toContain("import");
    expect(renderer).toContain("Alt+6");
    expect(renderer).toContain("Load manuscripts");
    expect(renderer).toContain("Choose file...");
    expect(renderer).toContain("Verify");
    expect(renderer).toContain("View OCR");
    expect(renderer).toContain("Save OCR");
    expect(renderer).toContain("No manuscripts yet.");
    expect(renderer).toContain("No OCR text for this manuscript.");
    expect(renderer).toContain("import-status");
    expect(renderer).toContain("import-list");
    // No raw IPC or Node access in the renderer.
    expect(renderer).not.toContain("ipcRenderer.invoke");
    expect(renderer).not.toContain("ipcRenderer.on");
    expect(renderer).not.toContain('require("fs")');
    expect(renderer).not.toContain('require("path")');
    expect(renderer).not.toContain('from "electron"');
  });
});
