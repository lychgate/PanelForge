// PanelForge — style profile persistence verification (S3.12).
//
// Styles live in the project's authoritative store (S3.11, migration
// 009) and reference assets by ID; S1.4 guarantees S1.5/S1.8
// portability (relative paths, snapshot restore, copy to new paths).
// This module is the verification surface for that claim:
//
// - `verifyStylePortability(root)`: per style, every reference asset
//   ID parses against the registry, its relative path is portable
//   (no absolute path / drive letter), and the file exists inside the
//   project. Problems report precisely; nothing mutates.
// - Round-trip proofs live in `tests/style-persistence.test.js`
//   (snapshot restore + path copy). Scene application stays S3.13.

import * as fs from "fs";
import { identifyProject } from "./service";
import { normalizeRelative, resolveInProject } from "./paths";
import { openProjectDatabase } from "./metadata";
import { listStyles, StyleProfile } from "./styles";

export type StylePortabilityReport = {
  ok: boolean;
  stylesChecked: number;
  problems: Array<{ styleId: string; detail: string }>;
};

export class StylePersistenceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StylePersistenceError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new StylePersistenceError(identified.code, identified.message);
  }
}

/** True when a stored path is portable (S1.4/D7): relative, `/` separators, no escapes. */
export function isPortablePath(relativePath: string): boolean {
  if (typeof relativePath !== "string" || relativePath === "") return false;
  if (/^[a-zA-Z]:/.test(relativePath) || relativePath.startsWith("/") || relativePath.startsWith("\\")) return false;
  try {
    normalizeRelative(relativePath);
    return true;
  } catch {
    return false;
  }
}

/** Verify styles + reference assets are portable and intact. Never mutates. */
export async function verifyStylePortability(root: string): Promise<StylePortabilityReport> {
  requireProject(root);
  const styles: StyleProfile[] = await listStyles(root);
  const problems: Array<{ styleId: string; detail: string }> = [];
  const { db } = openProjectDatabase(root);
  try {
    for (const style of styles) {
      for (const assetId of style.referenceAssetIds) {
        const row = db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(assetId) as Record<string, unknown> | undefined;
        if (!row) {
          problems.push({ styleId: style.styleId, detail: `reference asset ${assetId} not registered` });
          continue;
        }
        const relativePath = String(row.relative_path);
        if (!isPortablePath(relativePath)) {
          problems.push({ styleId: style.styleId, detail: `reference asset ${assetId} stores non-portable path: ${relativePath}` });
          continue;
        }
        let absolute: string;
        try {
          absolute = resolveInProject(root, relativePath);
        } catch {
          problems.push({ styleId: style.styleId, detail: `reference asset ${assetId} path escapes project` });
          continue;
        }
        if (!fs.existsSync(absolute)) {
          problems.push({ styleId: style.styleId, detail: `reference asset ${assetId} file missing: ${relativePath}` });
        }
      }
    }
  } finally {
    db.close();
  }
  return { ok: problems.length === 0, stylesChecked: styles.length, problems };
}
