// PanelForge — asset integrity checking (S1.6).
//
// Compares every registry row against the file it claims to describe and
// produces an integrity report (spec: missing-asset detection, hash
// verification, integrity reports; missing/modified assets reported
// accurately):
//
// - ok:          file exists and its SHA-256 matches the registered hash
// - missing:     the file no longer exists at its registered path
// - modified:    the file exists but its bytes no longer match (actual
//                hash recorded for diagnosis)
// - unreadable:  the file exists but cannot be read/hashed
//
// Verification never mutates the registry: it only reads. Files are
// resolved through S1.4's symlink-safe resolution, so an asset whose
// path now escapes the project is reported as a failure, not followed.

import * as crypto from "crypto";
import * as fs from "fs";
import { identifyProject } from "./service";
import { resolveInProject } from "./paths";
import { listAssets, AssetError } from "./registry";

export const HASH_ALGORITHM = "sha256";

export type IntegrityStatus = "ok" | "missing" | "modified" | "unreadable";

export type IntegrityEntry = {
  assetId: string;
  relativePath: string;
  status: IntegrityStatus;
  expectedHash: string;
  actualHash: string | null;
};

export type IntegrityReport = {
  projectId: string;
  checkedAt: string;
  entries: IntegrityEntry[];
  summary: {
    total: number;
    ok: number;
    missing: number;
    modified: number;
    unreadable: number;
  };
};

function hashFileSync(filePath: string): string {
  const hash = crypto.createHash(HASH_ALGORITHM);
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export async function verifyProjectIntegrity(root: string): Promise<IntegrityReport> {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new AssetError(identified.code as "NOT_A_PROJECT", identified.message);
  }
  const assets = await listAssets(root);
  const entries: IntegrityEntry[] = assets.map((asset) => {
    let resolved: string;
    try {
      resolved = resolveInProject(root, asset.relativePath);
    } catch {
      // A registered path that no longer resolves inside the project
      // (e.g. a symlink now points outside) is a failed check.
      return {
        assetId: asset.assetId,
        relativePath: asset.relativePath,
        status: "unreadable",
        expectedHash: asset.fileHash,
        actualHash: null,
      };
    }
    if (!fs.existsSync(resolved)) {
      return {
        assetId: asset.assetId,
        relativePath: asset.relativePath,
        status: "missing",
        expectedHash: asset.fileHash,
        actualHash: null,
      };
    }
    try {
      const actualHash = hashFileSync(resolved);
      const status = actualHash === asset.fileHash ? "ok" : "modified";
      return {
        assetId: asset.assetId,
        relativePath: asset.relativePath,
        status,
        expectedHash: asset.fileHash,
        actualHash,
      };
    } catch {
      return {
        assetId: asset.assetId,
        relativePath: asset.relativePath,
        status: "unreadable",
        expectedHash: asset.fileHash,
        actualHash: null,
      };
    }
  });
  const summary = {
    total: entries.length,
    ok: 0,
    missing: 0,
    modified: 0,
    unreadable: 0,
  };
  for (const entry of entries) summary[entry.status]++;
  return {
    projectId: identified.metadata.projectId,
    checkedAt: new Date().toISOString(),
    entries,
    summary,
  };
}
