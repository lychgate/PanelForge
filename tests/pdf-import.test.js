// S3.10 PDF import tests.
//
// Proves the spec acceptance: a fixture PDF matches its text twin;
// OCR absence is explicit, never silent.
//
// - extractPdfStreams inflates FlateDecode payloads in object order.
// - Content-stream Tj/TJ extraction maps to the .txt twin.
// - Scanned-only PDFs report status "scanned" with no normalization
//   row (Unknown by design).
// - importPdfManuscript preserves the original in both cases.
//
// Imported from the built `out/node/core/project/pdf-import.js`.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const pdfPath = path.join(root, "out/node/core/project/pdf-import.js");
if (!fs.existsSync(pdfPath)) {
  throw new Error("Missing out/node/core/project/pdf-import.js — run 'npm run build' first");
}
const servicePath = path.join(root, "out/node/core/project/service.js");
const manuscriptsPath = path.join(root, "out/node/core/project/manuscripts.js");
const normalizePath = path.join(root, "out/node/core/project/text-normalize.js");

const { createProject } = require(servicePath);
const { readManuscriptOriginal, verifyManuscript } = require(manuscriptsPath);
const { getNormalization } = require(normalizePath);
const { extractPdfStreams, extractContentStream, extractPdfText, importPdfManuscript } = require(pdfPath);

let projectRoot;
let scratch;

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-proj-"));
  createProject(projectRoot);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-src-"));
});

// Minimal hand-written PDF (uncompressed + flated variants).
function contentStream(ops) {
  return Buffer.from(`BT /F1 24 Tf ${ops} ET`, "latin1");
}

function buildPdf(streams) {
  let body = "";
  const offsets = [];
  for (const [dict, payload] of streams) {
    offsets.push(Buffer.byteLength(body));
    body += `1 0 obj\n<< ${dict} >>\nstream\n`;
    body += payload.toString("latin1");
    body += "endstream\nendobj\n2 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n3 0 obj\n<< /Type /Pages /Kids [1 0 R] /Count 1 >>\nendobj\n";
  }
  return Buffer.from(`%PDF-1.4\n${body}trailer\n<< /Root 2 0 R >>\n%%EOF\n`, "latin1");
}

function flated(ops) {
  const raw = zlib.deflateSync(Buffer.from(`BT /F1 24 Tf ${ops} ET`, "latin1"));
  return ["/Length " + raw.length + " /Filter /FlateDecode", raw];
}

describe("S3.10 PDF import", () => {
  it("streams inflate in object order", () => {
    const pdf = buildPdf([["/Length 0", contentStream("(One) Tj")], flated("(Two) Tj")]);
    const streams = extractPdfStreams(pdf);
    expect(streams).toHaveLength(2);
    expect(streams[0].toString("latin1")).toContain("(One) Tj");
    expect(streams[1].toString("latin1")).toContain("(Two) Tj");
  });

  it("Tj/TJ extraction matches the .txt twin", () => {
    expect(extractContentStream("BT /F1 24 Tf (Wake up) Tj ET", null)).toBe("Wake up");
    expect(extractContentStream("BT /F1 24 Tf [(Roby) 10 (by)] TJ ET", null)).toBe("Robyby");
    const pdf = buildPdf([["/Length 0", contentStream("(Wake up) Tj (Robby smiled) Tj")]]);
    const { status, text } = extractPdfText(pdf);
    expect(status).toBe("extracted");
    expect(text).toBe("Wake up\nRobby smiled\n");
  });

  it("ToUnicode maps bytes to unicode", () => {
    const cmap = [
      "/CIDInit /ProcSet",
      "beginbfchar",
      "<41> <0041>",
      "<42> <00E9>",
      "endbfchar",
    ].join(" ");
    const pdf = buildPdf([
      ["/Length 0", contentStream("(AB) Tj")],
      ["/Length 0", Buffer.from(cmap, "latin1")],
    ]);
    const { status, text } = extractPdfText(pdf);
    expect(status).toBe("extracted");
    expect(text).toBe("Aé\n");
  });

  it("scanned-only PDFs report scanned (Unknown), never silent", async () => {
    const pdf = buildPdf([["/Length 0", Buffer.from("q 100 0 0 100 0 0 cm 200 200 m l S Q", "latin1")]]);
    expect(extractPdfText(pdf).status).toBe("scanned");
    const file = path.join(scratch, "scan.pdf");
    fs.writeFileSync(file, pdf);
    const record = await importPdfManuscript(projectRoot, { sourceAbsolutePath: file });
    expect(record.format).toBe("pdf");
    expect(record.extraction).toBe("scanned");
    expect(await getNormalization(projectRoot, record.manuscriptId)).toBeNull();
    expect(readManuscriptOriginal(projectRoot, record)).toEqual(pdf);
    expect(verifyManuscript(projectRoot, record).status).toBe("ok");
  });

  it("extracted PDFs persist normalization; non-PDFs reject", async () => {
    const file = path.join(scratch, "book.pdf");
    fs.writeFileSync(file, buildPdf([["/Length 0", contentStream("(CHAPTER 1) Tj (Robby smiled) Tj")]]));
    const record = await importPdfManuscript(projectRoot, { sourceAbsolutePath: file });
    expect(record.extraction).toBe("extracted");
    const normalization = await getNormalization(projectRoot, record.manuscriptId);
    expect(normalization.normalizedText).toBe("CHAPTER 1\nRobby smiled\n");
    const txtPath = path.join(scratch, "fake.pdf");
    fs.writeFileSync(txtPath, Buffer.from("plain text, no header"));
    await expect(importPdfManuscript(projectRoot, { sourceAbsolutePath: txtPath })).rejects.toMatchObject({
      code: "INVALID_FORMAT",
    });
  });
});
