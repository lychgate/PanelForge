// PanelForge — backup and snapshot system (S1.8).
//
// Point-in-time captures of a project (spec: snapshot creation, backup
// creation, restore operation, verification; acceptance: a snapshot can
// be restored and verified without damaging the original project).
//
// Format + retention + restore-target semantics are unspecified, so the
// following engineering choices apply (recorded in the project format doc):
//
// - Snapshots live INSIDE the project at backups/snapshots/<id>/, where
//   <id> is a sortable ISO timestamp. A snapshot is a full copy —
//   project.json (marker), project.db (SQLite backup of the database),
//   files/ (the rest of the project tree, symlinks dereferenced so the
//   snapshot is self-contained), and manifest.json with per-file SHA-256.
// - A backup is the same snapshot copied OUT of the project into a
//   caller-chosen destination (backups are portable; snapshots are local).
// - Restore copies a snapshot into a FRESH target directory (never an
//   existing non-empty dir, never the original project itself), then
//   verifies it (identify + integrity check). Verification failure
//   deletes the partial restore and throws.
// - Retention is explicit: pruneSnapshots(keep) deletes older snapshots.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { identifyProject } from "./service";
import { projectDatabasePath } from "./metadata";
import { AssetError } from "./registry";
import { verifyProjectIntegrity, type IntegrityReport } from "./integrity";

export const SNAPSHOTS_DIR = "backups/snapshots";
export const MANIFEST_FILE = "manifest.json";

export type SnapshotManifest = {
  snapshotId: string;
  createdAt: string;
  projectId: string;
  databaseSha256: string;
  files: { relativePath: string; sha256: string; size: number }[];
};

export type VerifySnapshotResult = {
  ok: boolean;
  missing: string[];
  modified: string[];
};

export type RestoreResult = {
  targetRoot: string;
  projectId: string;
  integrity: IntegrityReport;
};

export class SnapshotError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SnapshotError";
    this.code = code;
  }
}

function sha256File(filePath: string): { hash: string; size: number } {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return { hash: hash.digest("hex"), size: data.length };
}

function snapshotRoot(root: string, snapshotId: string): string {
  return path.join(path.resolve(root), SNAPSHOTS_DIR, snapshotId);
}

function walkFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out;
}

function copyTree(src: string, dest: string): void {
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function readManifest(snapDir: string): SnapshotManifest {
  const manifestPath = path.join(snapDir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    throw new SnapshotError("NOT_FOUND", `No snapshot manifest: ${snapDir}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SnapshotManifest;
}

/** Create an in-project snapshot. Returns its id and directory. */
export async function createSnapshot(root: string): Promise<{ snapshotId: string; dir: string; manifest: SnapshotManifest }> {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new AssetError(identified.code as "NOT_A_PROJECT", identified.message);
  }
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = snapshotRoot(root, id);
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  // File copy: everything except the database dir (copied via backup below)
  // and the backups dir itself (would nest snapshots infinitely).
  for (const entry of fs.readdirSync(path.resolve(root), { withFileTypes: true })) {
    if (entry.name === "database" || entry.name === "backups") continue;
    copyTree(path.join(root, entry.name), path.join(dir, "files", entry.name));
  }
  // Deterministic database copy as the snapshot's database.
  const dbSrc = projectDatabasePath(root);
  const dbDest = path.join(dir, "project.db");
  if (fs.existsSync(dbSrc)) {
    fs.copyFileSync(dbSrc, dbDest);
  }
  const manifest: SnapshotManifest = {
    snapshotId: id,
    createdAt: new Date().toISOString(),
    projectId: identified.metadata.projectId,
    databaseSha256: fs.existsSync(dbDest) ? sha256File(dbDest).hash : "",
    files: walkFiles(path.join(dir, "files")).map((relative) => {
      const { hash, size } = sha256File(path.join(dir, "files", relative));
      return { relativePath: relative, sha256: hash, size };
    }),
  };
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { snapshotId: id, dir, manifest };
}

/** List snapshot ids (oldest first). */
export function listSnapshots(root: string): string[] {
  const dir = path.join(path.resolve(root), SNAPSHOTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Verify a snapshot against its manifest (files + database byte hashes). */
export function verifySnapshot(root: string, snapshotId: string): VerifySnapshotResult {
  const dir = snapshotRoot(root, snapshotId);
  const manifest = readManifest(dir);
  const missing: string[] = [];
  const modified: string[] = [];
  for (const file of manifest.files) {
    const target = path.join(dir, "files", file.relativePath);
    if (!fs.existsSync(target)) {
      missing.push(file.relativePath);
      continue;
    }
    if (sha256File(target).hash !== file.sha256) modified.push(file.relativePath);
  }
  if (manifest.databaseSha256) {
    const dbTarget = path.join(dir, "project.db");
    if (!fs.existsSync(dbTarget)) missing.push("project.db");
    else if (sha256File(dbTarget).hash !== manifest.databaseSha256) modified.push("project.db");
  }
  return { ok: missing.length === 0 && modified.length === 0, missing, modified };
}

/** Copy a snapshot out of the project into an external destination. */
export async function createBackup(
  root: string,
  destinationDir: string
): Promise<{ snapshotId: string; destinationDir: string }> {
  if (!destinationDir || destinationDir.trim() === "") {
    throw new SnapshotError("INVALID_ARGUMENTS", "destinationDir must not be empty");
  }
  const { snapshotId, dir } = await createSnapshot(root);
  const dest = path.join(path.resolve(destinationDir), snapshotId);
  fs.mkdirSync(dest, { recursive: true });
  copyTree(dir, dest);
  return { snapshotId, destinationDir: dest };
}

/**
 * Restore a snapshot into a fresh target directory. The target must be
 * nonexistent (created) or an existing empty directory; the original
 * project is never written to. The restored project is verified
 * (identify + integrity check) before success is reported.
 */
export async function restoreSnapshot(
  root: string,
  snapshotId: string,
  input: { targetRoot: string }
): Promise<RestoreResult> {
  const target = path.resolve(input.targetRoot);
  if (target === path.resolve(root)) {
    throw new SnapshotError("INVALID_ARGUMENTS", "Restore target must differ from the source project");
  }
  const snapDir = snapshotRoot(root, snapshotId);
  const manifest = readManifest(snapDir);
  const verification = verifySnapshot(root, snapshotId);
  if (!verification.ok) {
    throw new SnapshotError(
      "VERIFICATION_FAILED",
      `Snapshot failed verification (missing: ${verification.missing.join(",")}; modified: ${verification.modified.join(",")})`
    );
  }
  let createdTarget = false;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    createdTarget = true;
  } else if (fs.readdirSync(target).length > 0) {
    throw new SnapshotError("ALREADY_EXISTS", `Target directory is not empty: ${target}`);
  }
  try {
    fs.mkdirSync(path.join(target, "database"), { recursive: true });
    const filesSrc = path.join(snapDir, "files", "project.json");
    fs.copyFileSync(filesSrc, path.join(target, "project.json"));
    copyTree(path.join(snapDir, "files"), target);
    const dbSrc = path.join(snapDir, "project.db");
    if (fs.existsSync(dbSrc)) fs.copyFileSync(dbSrc, path.join(target, "database", "project.db"));
    const identified = identifyProject(target);
    if (!identified.ok) throw new SnapshotError("VERIFICATION_FAILED", `Restored project is invalid: ${identified.message}`);
    const integrity = await verifyProjectIntegrity(target);
    if (integrity.summary.missing > 0 || integrity.summary.modified > 0) {
      throw new SnapshotError("VERIFICATION_FAILED", "Restored project failed integrity check");
    }
    return { targetRoot: target, projectId: identified.metadata.projectId, integrity };
  } catch (err) {
    if (createdTarget) fs.rmSync(target, { recursive: true, force: true });
    throw err;
  }
}

/** Delete all but the newest `keep` snapshots. Returns removed ids. */
export function pruneSnapshots(root: string, keep = 10): string[] {
  const ids = listSnapshots(root);
  const removed = ids.slice(0, Math.max(0, ids.length - keep));
  for (const id of removed) {
    fs.rmSync(snapshotRoot(root, id), { recursive: true, force: true });
  }
  return removed;
}
