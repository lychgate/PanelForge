// PanelForge — source document records (S3.1).
//
// A durable record of every imported manuscript (spec §15 Stage 3):
//
// - `importManuscript` copies the original INTO the project
//   (manuscripts/original/, via the S1.5 asset registry), hashes it
//   (SHA-256), and inserts a `manuscripts` row (title, format, byte
//   size, content hash, timestamps). The original is preserved
//   byte-for-byte and re-openable via `readManuscriptOriginal`.
// - `verifyManuscript` re-hashes the preserved file and compares to
//   the recorded hash (ok / modified / missing / unreadable, mirroring
//   the S1.6 integrity taxonomy) — verification never mutates.
//
// Formats are extension-detected (txt/md/docx/epub/pdf); text
// normalization stays S3.2, format parsers stay S3.8–S3.10.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { identifyProject } from "./service";
import { normalizeRelative, resolveInProject } from "./paths";
import {
  openProjectDatabase,
  enqueueWrite,
  runWithBusyRetry,
  type DatabaseLike,
} from "./metadata";
import { importAsset } from "./registry";

export const HASH_ALGORITHM = "sha256";

export type ManuscriptFormat = "txt" | "md" | "docx" | "epub" | "pdf";

export type ManuscriptRecord = {
  manuscriptId: string;
  title: string;
  format: ManuscriptFormat;
  assetId: string;
  relativePath: string;
  byteSize: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

export type ManuscriptErrorCode =
  | "INVALID_ARGUMENTS"
  | "INVALID_FORMAT"
  | "NOT_FOUND"
  | "NOT_A_PROJECT"
  | "SOURCE_NOT_FOUND";

export class ManuscriptError extends Error {
  code: ManuscriptErrorCode;
  constructor(code: ManuscriptErrorCode, message: string) {
    super(message);
    this.name = "ManuscriptError";
    this.code = code;
  }
}

const FORMATS: readonly ManuscriptFormat[] = ["txt", "md", "docx", "epub", "pdf"];

export function isManuscriptFormat(value: unknown): value is ManuscriptFormat {
  return typeof value === "string" && (FORMATS as readonly string[]).includes(value);
}

export function detectManuscriptFormat(sourceAbsolutePath: string): ManuscriptFormat | null {
  const ext = path.extname(sourceAbsolutePath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "md";
  const candidate = ext.replace(".", "");
  return isManuscriptFormat(candidate) ? candidate : null;
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ManuscriptError(identified.code as ManuscriptErrorCode, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): ManuscriptRecord {
  return {
    manuscriptId: String(row.manuscript_id),
    title: String(row.title),
    format: String(row.format) as ManuscriptFormat,
    assetId: String(row.asset_id),
    relativePath: String(row.relative_path),
    byteSize: Number(row.byte_size),
    contentHash: String(row.content_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function destinationFor(sourceAbsolutePath: string, manuscriptId: string): string {
  const safeBase = path.basename(sourceAbsolutePath).replace(/[^A-Za-z0-9._-]/g, "-");
  return normalizeRelative(`manuscripts/original/${manuscriptId}-${safeBase}`);
}

/**
 * Import a manuscript: copy the original into the project, register
 * the asset, and insert the record row. The source stays where it is;
 * the preserved copy is byte-for-byte identical to it.
 */
export async function importManuscript(
  root: string,
  input: { sourceAbsolutePath: string; title?: string; format?: ManuscriptFormat }
): Promise<ManuscriptRecord> {
  requireProject(root);
  if (typeof input.sourceAbsolutePath !== "string" || !path.isAbsolute(input.sourceAbsolutePath)) {
    throw new ManuscriptError("INVALID_ARGUMENTS", "sourceAbsolutePath must be an absolute path");
  }
  if (!fs.existsSync(input.sourceAbsolutePath) || !fs.statSync(input.sourceAbsolutePath).isFile()) {
    throw new ManuscriptError("SOURCE_NOT_FOUND", `Source file does not exist: ${input.sourceAbsolutePath}`);
  }
  const format = input.format ?? detectManuscriptFormat(input.sourceAbsolutePath);
  if (!format || !isManuscriptFormat(format)) {
    throw new ManuscriptError("INVALID_FORMAT", `Unsupported manuscript format for: ${path.basename(input.sourceAbsolutePath)}`);
  }
  const title = (input.title ?? path.parse(input.sourceAbsolutePath).name).trim();
  if (title === "") {
    throw new ManuscriptError("INVALID_ARGUMENTS", "title must not be empty");
  }
  const manuscriptId = crypto.randomUUID();
  const destinationRelative = destinationFor(input.sourceAbsolutePath, manuscriptId);
  const asset = await importAsset(root, {
    sourceAbsolutePath: input.sourceAbsolutePath,
    assetType: "manuscript",
    destinationRelative,
  });
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      return await runWithBusyRetry<ManuscriptRecord>(() => {
        db.prepare(
          "INSERT INTO manuscripts (manuscript_id, title, format, asset_id, relative_path, byte_size, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(manuscriptId, title, format, asset.assetId, asset.relativePath, asset.fileSize, asset.fileHash, now, now);
        const row = db.prepare("SELECT * FROM manuscripts WHERE manuscript_id = ?").get(manuscriptId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve a single manuscript by ID, or null. */
export async function getManuscript(root: string, manuscriptId: string): Promise<ManuscriptRecord | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM manuscripts WHERE manuscript_id = ?").get(manuscriptId);
    return row ? toRecord(row as Record<string, unknown>) : null;
  } finally {
    db.close();
  }
}

/** List all manuscripts in creation order. */
export async function listManuscripts(root: string): Promise<ManuscriptRecord[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    return db
      .prepare("SELECT * FROM manuscripts ORDER BY created_at, manuscript_id")
      .all()
      .map((row) => toRecord(row as Record<string, unknown>));
  } finally {
    db.close();
  }
}

/** Re-open the preserved original bytes from project storage. */
export function readManuscriptOriginal(root: string, record: ManuscriptRecord): Buffer {
  requireProject(root);
  const absolute = resolveInProject(root, record.relativePath);
  if (!fs.existsSync(absolute)) {
    throw new ManuscriptError("NOT_FOUND", `Preserved original is missing: ${record.relativePath}`);
  }
  return fs.readFileSync(absolute);
}

export type ManuscriptIntegrityStatus = "ok" | "modified" | "missing" | "unreadable";

export type ManuscriptIntegrityEntry = {
  manuscriptId: string;
  relativePath: string;
  status: ManuscriptIntegrityStatus;
  expectedHash: string;
  actualHash: string | null;
};

function hashFileSync(filePath: string): string {
  const hash = crypto.createHash(HASH_ALGORITHM);
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/** Re-hash the preserved file against the recorded hash. Never mutates. */
export function verifyManuscript(root: string, record: ManuscriptRecord): ManuscriptIntegrityEntry {
  requireProject(root);
  let absolute: string;
  try {
    absolute = resolveInProject(root, record.relativePath);
  } catch {
    return { manuscriptId: record.manuscriptId, relativePath: record.relativePath, status: "unreadable", expectedHash: record.contentHash, actualHash: null };
  }
  if (!fs.existsSync(absolute)) {
    return { manuscriptId: record.manuscriptId, relativePath: record.relativePath, status: "missing", expectedHash: record.contentHash, actualHash: null };
  }
  let actual: string;
  try {
    actual = hashFileSync(absolute);
  } catch {
    return { manuscriptId: record.manuscriptId, relativePath: record.relativePath, status: "unreadable", expectedHash: record.contentHash, actualHash: null };
  }
  return {
    manuscriptId: record.manuscriptId,
    relativePath: record.relativePath,
    status: actual === record.contentHash ? "ok" : "modified",
    expectedHash: record.contentHash,
    actualHash: actual,
  };
}
