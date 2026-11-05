// PanelForge — asset registry (S1.5).
//
// Every managed asset is a registry row in the project's database
// (database/project.db, migration 002 — D5: SQLite authoritative):
//
//   assets(asset_id, relative_path, asset_type, file_hash,
//          file_size, created_at, updated_at)
//
// Per spec §7.4 the asset is identified by its UID (the row), never by
// its path (D6). The relative path is a mutable attribute: rename/move
// updates the row, never business logic's identity. S1.5 records the
// subset (UID + relative path + type + dates + hash); version, approval,
// relationships, and provenance arrive with later tasks.
//
// - importAsset: copy an external file INTO the project (canonical
//   destination via S1.4), hash it (SHA-256), register the row.
// - copyAsset: copy a registered asset to a new canonical location and
//   mint a NEW row (a copy is a new file, hence a new identity; the
//   original is unchanged).
// - getAsset/listAssets: retrieval by ID / all rows.

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

export const HASH_ALGORITHM = "sha256";

export type AssetRecord = {
  assetId: string;
  relativePath: string;
  assetType: string;
  fileHash: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

export type AssetErrorCode =
  | "INVALID_ARGUMENTS"
  | "NOT_FOUND"
  | "NOT_A_PROJECT"
  | "ALREADY_EXISTS"
  | "SOURCE_NOT_FOUND";

export class AssetError extends Error {
  code: AssetErrorCode;
  constructor(code: AssetErrorCode, message: string) {
    super(message);
    this.name = "AssetError";
    this.code = code;
  }
}

function toRecord(row: Record<string, unknown>): AssetRecord {
  return {
    assetId: String(row.asset_id),
    relativePath: String(row.relative_path),
    assetType: String(row.asset_type),
    fileHash: String(row.file_hash),
    fileSize: Number(row.file_size),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new AssetError(identified.code as AssetErrorCode, identified.message);
  }
}

function hashFileSync(filePath: string): { hash: string; size: number } {
  const hash = crypto.createHash(HASH_ALGORITHM);
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return { hash: hash.digest("hex"), size: data.length };
}

async function insertRow(db: DatabaseLike, record: AssetRecord): Promise<AssetRecord> {
  return runWithBusyRetry(async () => {
    db.prepare(
      "INSERT INTO assets (asset_id, relative_path, asset_type, file_hash, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      record.assetId,
      record.relativePath,
      record.assetType,
      record.fileHash,
      record.fileSize,
      record.createdAt,
      record.updatedAt
    );
    const row = db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(record.assetId);
    return toRecord(row as Record<string, unknown>);
  });
}

function findByPath(db: DatabaseLike, relativePath: string) {
  return db.prepare("SELECT * FROM assets WHERE relative_path = ?").get(relativePath);
}

function defaultDestination(assetType: string, sourceBase: string): string {
  return normalizeRelative(`assets/${assetType}/${sourceBase}`);
}

/**
 * Import an external file into the project: copy to the canonical
 * destination and register the row. The source stays where it is.
 */
export async function importAsset(
  root: string,
  input: { sourceAbsolutePath: string; assetType: string; destinationRelative?: string }
): Promise<AssetRecord> {
  requireProject(root);
  if (typeof input.assetType !== "string" || input.assetType.trim() === "") {
    throw new AssetError("INVALID_ARGUMENTS", "assetType must not be empty");
  }
  if (typeof input.sourceAbsolutePath !== "string" || !path.isAbsolute(input.sourceAbsolutePath)) {
    throw new AssetError("INVALID_ARGUMENTS", "sourceAbsolutePath must be an absolute path");
  }
  if (!fs.existsSync(input.sourceAbsolutePath) || !fs.statSync(input.sourceAbsolutePath).isFile()) {
    throw new AssetError("SOURCE_NOT_FOUND", `Source file does not exist: ${input.sourceAbsolutePath}`);
  }
  const destinationRelative = input.destinationRelative
    ? normalizeRelative(input.destinationRelative)
    : defaultDestination(input.assetType.replace(/[^A-Za-z0-9._-]/g, "-"), path.basename(input.sourceAbsolutePath));
  const destinationAbs = resolveInProject(root, destinationRelative);
  const { hash, size } = hashFileSync(input.sourceAbsolutePath);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      if (findByPath(db, destinationRelative)) {
        throw new AssetError("ALREADY_EXISTS", `Asset path is already registered: ${destinationRelative}`);
      }
      if (fs.existsSync(destinationAbs)) {
        throw new AssetError("ALREADY_EXISTS", `File already exists: ${destinationRelative}`);
      }
      fs.mkdirSync(path.dirname(destinationAbs), { recursive: true });
      fs.copyFileSync(input.sourceAbsolutePath, destinationAbs);
      return await insertRow(db, {
        assetId: crypto.randomUUID(),
        relativePath: destinationRelative,
        assetType: input.assetType,
        fileHash: hash,
        fileSize: size,
        createdAt: now,
        updatedAt: now,
      });
    } finally {
      db.close();
    }
  });
}

/**
 * Copy a registered asset to a new canonical location. Mints a new row
 * (new identity); the original asset is unchanged.
 */
export async function copyAsset(
  root: string,
  assetId: string,
  input: { destinationRelative: string }
): Promise<AssetRecord> {
  requireProject(root);
  if (typeof input.destinationRelative !== "string" || input.destinationRelative.trim() === "") {
    throw new AssetError("INVALID_ARGUMENTS", "destinationRelative must not be empty");
  }
  const destinationRelative = normalizeRelative(input.destinationRelative);
  const destinationAbs = resolveInProject(root, destinationRelative);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const sourceRow = db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(assetId);
      if (!sourceRow) {
        throw new AssetError("NOT_FOUND", `No asset with id: ${assetId}`);
      }
      if (findByPath(db, destinationRelative)) {
        throw new AssetError("ALREADY_EXISTS", `Asset path is already registered: ${destinationRelative}`);
      }
      if (fs.existsSync(destinationAbs)) {
        throw new AssetError("ALREADY_EXISTS", `File already exists: ${destinationRelative}`);
      }
      const sourceAbs = resolveInProject(root, String((sourceRow as Record<string, unknown>).relative_path));
      fs.mkdirSync(path.dirname(destinationAbs), { recursive: true });
      fs.copyFileSync(sourceAbs, destinationAbs);
      const { hash, size } = hashFileSync(destinationAbs);
      return await insertRow(db, {
        assetId: crypto.randomUUID(),
        relativePath: destinationRelative,
        assetType: String((sourceRow as Record<string, unknown>).asset_type),
        fileHash: hash,
        fileSize: size,
        createdAt: now,
        updatedAt: now,
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve a single asset by ID, or null. */
export async function getAsset(root: string, assetId: string): Promise<AssetRecord | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(assetId);
    return row ? toRecord(row as Record<string, unknown>) : null;
  } finally {
    db.close();
  }
}

/** List all registered assets. */
export async function listAssets(root: string): Promise<AssetRecord[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    return db
      .prepare("SELECT * FROM assets ORDER BY created_at, asset_id")
      .all()
      .map((row) => toRecord(row as Record<string, unknown>));
  } finally {
    db.close();
  }
}
