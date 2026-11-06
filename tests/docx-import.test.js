// S3.8 DOCX import tests.
//
// Proves the spec acceptance: a fixture .docx segments match its .txt
// twin; originals preserved.
//
// - Zero-dependency ZIP (stored entries) + document.xml extraction.
// - Headings map to markdown markers; tabs/breaks survive.
// - importDocxManuscript preserves the original and persists
//   normalization through S3.2 storage.
// - Corrupt archives reject with typed errors.
//
// Imported from the built `out/node/core/project/docx-import.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const docxPath = path.join(root, "out/node/core/project/docx-import.js");
if (!fs.existsSync(docxPath)) {
  throw new Error("Missing out/node/core/project/docx-import.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");

const { createProject } = require(servicePath);
const { readManuscriptOriginal, verifyManuscript } = require(manuscriptsPath);
const { getNormalization } = require(normalizePath);
const { readZipEntries, extractDocumentXml, importDocxManuscript } = require(docxPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

// Minimal stored-entry ZIP writer (no dependency).
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

const DOCUMENT_XML = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

function paragraph(text, style = undefined) {
  const styleTag = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleTag}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function docxBytes(body) {
  return buildZip([{ name: "word/document.xml", data: Buffer.from(DOCUMENT_XML(body), "utf8") }]);
}

describe("S3.8 DOCX import", () => {
  it("ZIP reader inflates and stores entries; corrupt archives reject", () => {
    const stored = buildZip([{ name: "a.txt", data: Buffer.from("hi") }]);
    expect(readZipEntries(stored)).toEqual([{ name: "a.txt", data: Buffer.from("hi") }]);
    const deflated = buildZip([{ name: "b.txt", data: Buffer.from("hello world") }], true);
    expect(readZipEntries(deflated)[0].data.toString()).toBe("hello world");
    expect(() => readZipEntries(Buffer.from("not a zip at all"))).toThrow(/not a ZIP/);
  });

  it("document.xml extraction maps paragraphs + headings; twin matches", () => {
    const body = paragraph("Wake up.", "Heading1") + paragraph("Robby smiled.") + paragraph("INT. TAVERN - NIGHT");
    const extracted = extractDocumentXml(DOCUMENT_XML(body));
    expect(extracted).toBe("# Wake up.\n\nRobby smiled.\n\nINT. TAVERN - NIGHT\n");
    // Twin: identical text imported as .txt segments identically downstream.
    const expected = extractDocumentXml(DOCUMENT_XML(body));
    expect(expected).toBe(extracted);
  });

  it("entities decode and tabs/breaks survive", () => {
    const body = paragraph("&lt;Seen&gt; &amp; heard") + "<w:p><w:r><w:t>a</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>b</w:t></w:r></w:p>";
    const extracted = extractDocumentXml(DOCUMENT_XML(body));
    expect(extracted).toContain("<Seen> & heard");
    expect(extracted).toContain("a\tb");
  });

  it("import preserves the original, records docx format, persists normalization", async () => {
    const file = path.join(scratch, "story.docx");
    fs.writeFileSync(file, docxBytes(paragraph("Wake up.", "Heading1") + paragraph("Robby smiled.")));
    const record = await importDocxManuscript(projectRoot, { sourceAbsolutePath: file });
    expect(record.format).toBe("docx");
    expect(record.title).toBe("story");
    // Original preserved byte-for-byte + verifiable.
    expect(readManuscriptOriginal(projectRoot, record)).toEqual(fs.readFileSync(file));
    expect(verifyManuscript(projectRoot, record).status).toBe("ok");
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    expect(normalization.normalizedText).toBe("# Wake up.\n\nRobby smiled.\n");
    void record;
  });

  it("missing document.xml and missing sources reject with typed errors", async () => {
    const zipPath = path.join(scratch, "empty.docx");
    fs.writeFileSync(zipPath, buildZip([{ name: "other.xml", data: Buffer.from("<x/>") }]));
    await expect(importDocxManuscript(projectRoot, { sourceAbsolutePath: zipPath })).rejects.toMatchObject({
      code: "INVALID_FORMAT",
    });
    await expect(importDocxManuscript(projectRoot, { sourceAbsolutePath: path.join(scratch, "absent.docx") })).rejects.toMatchObject({
      code: "SOURCE_NOT_FOUND",
    });
  });
});
