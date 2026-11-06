// S3.9 EPUB import tests.
//
// Proves the spec acceptance: a fixture .epub lands in spine order
// with exact spans; originals preserved.
//
// - container.xml → OPF rootfile → spine order (not filename order).
// - XHTML heading/paragraph extraction; scripts/styles stripped.
// - importEpubManuscript preserves the original and persists
//   normalization through S3.2 storage.
// - Non-EPUB archives reject with typed errors.
//
// Imported from the built `out/node/core/project/epub-import.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const epubPath = path.join(root, "out/node/core/project/epub-import.js");
if (!fs.existsSync(epubPath)) {
  throw new Error("Missing out/node/core/project/epub-import.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");

const { createProject } = require(servicePath);
const { readManuscriptOriginal, verifyManuscript } = require(manuscriptsPath);
const { getNormalization } = require(normalizePath);
const { epubRootfilePath, epubSpineOrder, extractXhtmlText, extractEpubText, importEpubManuscript } = require(epubPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

// Minimal stored-entry ZIP writer (no dependency).
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
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

const CONTAINER = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;

function opf(spineIds) {
  const items = spineIds.map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const refs = spineIds.map((id) => `<itemref idref="${id}"/>`).join("");
  return `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest>${items}</manifest><spine>${refs}</spine></package>`;
}

function xhtml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`;
}

describe("S3.9 EPUB import", () => {
  it("spine order wins over filename order", () => {
    expect(epubRootfilePath(CONTAINER)).toBe("OEBPS/content.opf");
    expect(epubSpineOrder(opf(["ch2", "ch1"]))).toEqual(["ch2.xhtml", "ch1.xhtml"]);
    const entries = [
      { name: "META-INF/container.xml", data: Buffer.from(CONTAINER, "utf8") },
      { name: "OEBPS/content.opf", data: Buffer.from(opf(["ch2", "ch1"]), "utf8") },
      { name: "OEBPS/ch1.xhtml", data: Buffer.from(xhtml("<h1>First</h1>"), "utf8") },
      { name: "OEBPS/ch2.xhtml", data: Buffer.from(xhtml("<h1>Second</h1>"), "utf8") },
    ];
    expect(extractEpubText(entries)).toBe("# Second\n\n# First\n");
  });

  it("XHTML extraction maps headings and strips scripts", () => {
    const blocks = extractXhtmlText(xhtml("<script>evil()</script><h2>Setup</h2><p>Robby &amp; friends</p>"));
    expect(blocks).toEqual(["## Setup", "Robby & friends"]);
  });

  it("import preserves the original and persists normalization", async () => {
    const file = path.join(scratch, "book.epub");
    fs.writeFileSync(
      file,
      buildZip([
        { name: "META-INF/container.xml", data: Buffer.from(CONTAINER, "utf8") },
        { name: "OEBPS/content.opf", data: Buffer.from(opf(["ch1", "ch2"]), "utf8") },
        { name: "OEBPS/ch1.xhtml", data: Buffer.from(xhtml("<h1>Wake up</h1><p>Robby smiled.</p>"), "utf8") },
        { name: "OEBPS/ch2.xhtml", data: Buffer.from(xhtml("<h1>INT. TAVERN - NIGHT</h1><p>Drink.</p>"), "utf8") },
      ])
    );
    const record = await importEpubManuscript(projectRoot, { sourceAbsolutePath: file });
    expect(record.format).toBe("epub");
    expect(record.title).toBe("book");
    expect(readManuscriptOriginal(projectRoot, record)).toEqual(fs.readFileSync(file));
    expect(verifyManuscript(projectRoot, record).status).toBe("ok");
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    expect(normalization.normalizedText).toBe("# Wake up\n\nRobby smiled.\n\n# INT. TAVERN - NIGHT\n\nDrink.\n");
    void zlib;
  });

  it("non-EPUB archives reject with typed errors", async () => {
    const zipPath = path.join(scratch, "not.epub");
    fs.writeFileSync(zipPath, buildZip([{ name: "word/document.xml", data: Buffer.from("<w/>") }]));
    await expect(importEpubManuscript(projectRoot, { sourceAbsolutePath: zipPath })).rejects.toMatchObject({
      code: "INVALID_FORMAT",
    });
    await expect(importEpubManuscript(projectRoot, { sourceAbsolutePath: path.join(scratch, "absent.epub") })).rejects.toMatchObject({
      code: "SOURCE_NOT_FOUND",
    });
  });
});
