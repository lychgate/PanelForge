// PanelForge — scanned-PDF autodetect + OCR fallback (S6.13, spec §8.7).
//
// Owner decision (2026-11-06; supersedes the S3.10
// "scanned → Unknown, no OCR" stance for this path):
//
// - `importPdfAutodetect` tries the S3.10 text-layer extraction
//   first; text PDFs import normally.
// - Scanned (image-only) PDFs fall back to OCR: pages are
//   rendered with the system `pdftoppm` (poppler) and read
//   with `tesseract.js` (WASM; no native or system binary).
// - OCR output is saved as an editable text copy attached to
//   the manuscript (`manuscript_ocr`), keyed by source content
//   hash so re-imports reuse it and owners can correct it
//   (`updateOcrText`) without re-running OCR.
// - Missing toolchain fails with typed codes:
//   OCR_UNAVAILABLE (pdftoppm absent), never a silent stub.
//
// The Stage 6 acceptance fixture (S6.13) is the consumer.

import { identifyProject } from "./service";
import { importManuscript, type ManuscriptRecord } from "./manuscripts";
import { extractPdfText, importPdfManuscript } from "./pdf-import";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { spawn } from "child_process";

export type OcrRecord = {
  manuscriptId: string;
  sourceHash: string;
  sourceName: string;
  ocrText: string;
  pageCount: number;
  engine: string;
  createdAt: string;
  updatedAt: string;
};

export class OcrError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OcrError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new OcrError(identified.code, identified.message);
  }
}

function toOcrRecord(row: Record<string, unknown>): OcrRecord {
  return {
    manuscriptId: String(row.manuscript_id),
    sourceHash: String(row.source_hash),
    sourceName: String(row.source_name),
    ocrText: String(row.ocr_text ?? ""),
    pageCount: Number(row.page_count),
    engine: String(row.engine),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function renderPdfPages(pdfPath: string, outDir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftoppm", ["-png", "-r", "200", pdfPath, path.join(outDir, "page")], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new OcrError("OCR_UNAVAILABLE", "pdftoppm (poppler) not found on PATH; scanned-PDF OCR needs it"));
      } else {
        reject(new OcrError("OCR_UNAVAILABLE", `pdftoppm failed: ${err.message}`));
      }
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new OcrError("OCR_FAILED", `pdftoppm exited ${code}: ${stderr.trim()}`));
        return;
      }
      const pages = fs
        .readdirSync(outDir)
        .filter((name) => /^page-\d+\.png$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
        .map((name) => path.join(outDir, name));
      if (pages.length === 0) {
        reject(new OcrError("OCR_FAILED", "pdftoppm rendered no pages"));
        return;
      }
      resolve(pages);
    });
  });
}

async function ocrPages(pages: string[]): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createWorker } = require("tesseract.js") as typeof import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: () => undefined,
    // Keep traineddata out of the working tree (repo root).
    cachePath: os.tmpdir(),
  });
  try {
    const parts: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      const { data } = await worker.recognize(pages[i]);
      parts.push(`--- page ${i + 1} ---\n${typeof data.text === "string" ? data.text.trim() : ""}`);
    }
    return parts.join("\n\n");
  } finally {
    await worker.terminate();
  }
}

function findOcrByHash(root: string, sourceHash: string): OcrRecord | null {
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM manuscript_ocr WHERE source_hash = ?").get(sourceHash) as Record<string, unknown> | undefined;
    return row ? toOcrRecord(row) : null;
  } finally {
    db.close();
  }
}

/**
 * Import a PDF manuscript, autodetecting its text layer:
 * text PDFs import as-is; scanned PDFs are OCR'd (once) and
 * saved as an editable attached text copy.
 */
export async function importPdfAutodetect(
  root: string,
  input: { sourceAbsolutePath: string; title?: string }
): Promise<{ manuscript: ManuscriptRecord; ocr: OcrRecord | null }> {
  requireProject(root);
  if (typeof input.sourceAbsolutePath !== "string" || !path.isAbsolute(input.sourceAbsolutePath)) {
    throw new OcrError("INVALID_ARGUMENTS", "sourceAbsolutePath must be an absolute path");
  }
  if (!fs.existsSync(input.sourceAbsolutePath)) {
    throw new OcrError("SOURCE_NOT_FOUND", `Source file does not exist: ${input.sourceAbsolutePath}`);
  }
  const sourceHash = sha256File(input.sourceAbsolutePath);
  const extracted = extractPdfText(fs.readFileSync(input.sourceAbsolutePath));
  if (extracted.status === "extracted" && extracted.text.trim() !== "") {
    const { extraction, ...manuscript } = await importPdfManuscript(root, {
      sourceAbsolutePath: input.sourceAbsolutePath,
      title: input.title,
    });
    void extraction;
    return { manuscript, ocr: null };
  }

  // Scanned: reuse saved OCR for this source hash when present.
  const existing = findOcrByHash(root, sourceHash);
  if (existing) {
    const manuscript = await importOcrTextAsManuscript(root, existing, input.title);
    return { manuscript, ocr: existing };
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-ocr-"));
  try {
    const pages = await renderPdfPages(input.sourceAbsolutePath, scratch);
    const ocrText = await ocrPages(pages);
    if (ocrText.trim() === "") {
      throw new OcrError("OCR_FAILED", "OCR produced no text for this PDF");
    }
    const now = new Date().toISOString();
    const manuscript = await importOcrTextAsManuscript(root, { ocrText }, input.title);
    const record = await enqueueWrite(async () => {
      const { db } = openProjectDatabase(root);
      try {
        await runWithBusyRetry(() =>
          db.prepare(
            "INSERT INTO manuscript_ocr (manuscript_id, source_hash, source_name, ocr_text, page_count, engine, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(manuscript.manuscriptId, sourceHash, path.basename(input.sourceAbsolutePath), ocrText, pages.length, "tesseract.js", now, now)
        );
        const row = db.prepare("SELECT * FROM manuscript_ocr WHERE manuscript_id = ?").get(manuscript.manuscriptId) as Record<string, unknown>;
        return toOcrRecord(row);
      } finally {
        db.close();
      }
    });
    return { manuscript, ocr: record };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function importOcrTextAsManuscript(
  root: string,
  source: { ocrText: string },
  title?: string
): Promise<ManuscriptRecord> {
  const scratchFile = path.join(os.tmpdir(), `panelforge-ocr-${crypto.randomUUID()}.txt`);
  fs.writeFileSync(scratchFile, source.ocrText, "utf8");
  try {
    return await importManuscript(root, {
      sourceAbsolutePath: scratchFile,
      title,
      format: "txt",
    });
  } finally {
    fs.rmSync(scratchFile, { force: true });
  }
}

/** The saved OCR text copy attached to one manuscript (editable by owners). */
export async function getOcrText(root: string, manuscriptId: string): Promise<OcrRecord | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM manuscript_ocr WHERE manuscript_id = ?").get(manuscriptId) as Record<string, unknown> | undefined;
    return row ? toOcrRecord(row) : null;
  } finally {
    db.close();
  }
}

/** Correct a saved OCR text copy (owner edits persist; no re-OCR). */
export async function updateOcrText(root: string, manuscriptId: string, ocrText: string): Promise<OcrRecord> {
  requireProject(root);
  if (typeof ocrText !== "string" || ocrText.trim() === "") {
    throw new OcrError("INVALID_ARGUMENTS", "ocrText must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM manuscript_ocr WHERE manuscript_id = ?").get(manuscriptId) as Record<string, unknown> | undefined;
      if (!current) throw new OcrError("NOT_FOUND", `No OCR text for manuscript: ${manuscriptId}`);
      await runWithBusyRetry(() => db.prepare("UPDATE manuscript_ocr SET ocr_text = ?, updated_at = ? WHERE manuscript_id = ?").run(ocrText, now, manuscriptId));
      const row = db.prepare("SELECT * FROM manuscript_ocr WHERE manuscript_id = ?").get(manuscriptId) as Record<string, unknown>;
      return toOcrRecord(row);
    } finally {
      db.close();
    }
  });
}
