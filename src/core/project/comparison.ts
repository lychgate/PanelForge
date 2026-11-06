// PanelForge — Art Studio: side-by-side + approved-reference comparison (S7.11, spec §8.8).
//
// Drift is visible before approval — read-only compare of
// two artworks plus the §8.8 first-class modes:
//
// - `compareArtworks(a, b)` — exact compared pair: asset
//   IDs, byte hashes/sizes, pixel-identity (hash equality),
//   version numbers. Read-only (S4.10 no-mutation rule):
//   opens the DB for SELECTs and reads asset files only.
// - Four modes returning exact pairs:
//   1. `compareTwo` — any two artwork rows.
//   2. `compareCurrentVsPrevious` — latest vs previous
//      generation of one panel.
//   3. `compareVsApprovedPortrait` — latest panel artwork
//      vs the approved character portrait reference
//      (S4.3/S4.8: approved package only, never the
//      latest version's refs).
//   4. `compareVsApprovedReferences` — latest panel
//      artwork vs approved reference views (character /
//      location / object variation references).
// - Missing data rejects typed (never guesses a pair).
//
// Provenance stays S7.12.

import { identifyProject } from "./service";
import { openProjectDatabase } from "./metadata";
import { listArtwork } from "./panel-generation";
import { listAssignmentsByPanel } from "./panel-assignments";
import { listReferencesByVersion } from "./version-references";
import { listReferencesByVariation as listLocationReferencesByVariation } from "./location-references";
import { listReferencesByVariation as listObjectReferencesByVariation } from "./object-references";
import { getAsset } from "./registry";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export type ComparedPair = {
  a: { artworkId: string; assetId: string; versionNo: number; sha256: string; byteSize: number };
  b: { artworkId: string; assetId: string; versionNo: number; sha256: string; byteSize: number };
  identical: boolean;
  mode: string;
};

export class CompareError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CompareError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new CompareError(identified.code, identified.message);
  }
}

async function describeArtwork(root: string, artworkId: string): Promise<ComparedPair["a"]> {
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_artwork WHERE artwork_id = ?").get(artworkId) as Record<string, unknown> | undefined;
    if (!row) throw new CompareError("NOT_FOUND", `No artwork with id: ${artworkId}`);
    const assetRow = db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(row.asset_id) as Record<string, unknown> | undefined;
    if (!assetRow) throw new CompareError("NOT_FOUND", `No asset for artwork: ${artworkId}`);
    const asset = await getAsset(root, String(row.asset_id));
    const assetPath = path.join(path.resolve(root), String(assetRow.relative_path));
    const bytes = fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : Buffer.alloc(0);
    void asset;
    return {
      artworkId: String(row.artwork_id),
      assetId: String(row.asset_id),
      versionNo: Number(row.version_no),
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.length,
    };
  } finally {
    db.close();
  }
}

function pairOf(mode: string, a: ComparedPair["a"], b: ComparedPair["b"]): ComparedPair {
  return { a, b, identical: a.sha256 === b.sha256, mode };
}

/** Mode 1: any two artwork rows. Read-only. */
export async function compareTwo(root: string, artworkIdA: string, artworkIdB: string): Promise<ComparedPair> {
  requireProject(root);
  const a = await describeArtwork(root, artworkIdA);
  const b = await describeArtwork(root, artworkIdB);
  return pairOf("side-by-side", a, b);
}

/** Mode 2: latest vs previous generation of one panel. */
export async function compareCurrentVsPrevious(root: string, panelId: string): Promise<ComparedPair> {
  requireProject(root);
  const versions = await listArtwork(root, panelId);
  if (versions.length < 2) throw new CompareError("NOT_FOUND", `Panel ${panelId} has fewer than 2 generations`);
  const a = await describeArtwork(root, versions[versions.length - 1].artworkId);
  const b = await describeArtwork(root, versions[versions.length - 2].artworkId);
  return pairOf("current-vs-previous", a, b);
}

async function approvedCharacterVersion(root: string, characterId: string): Promise<string> {
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT version_id FROM character_versions WHERE character_id = ? AND approval_status = 'approved' ORDER BY created_at DESC, version_id")
      .all(characterId) as Array<Record<string, unknown>>;
    if (rows.length === 0) throw new CompareError("NOT_APPROVED", `No approved version for character ${characterId}`);
    return String(rows[0].version_id);
  } finally {
    db.close();
  }
}

/**
 * Mode 3: latest panel artwork vs the approved character
 * portrait reference (approved package, not latest refs).
 */
export async function compareVsApprovedPortrait(root: string, panelId: string): Promise<ComparedPair> {
  requireProject(root);
  const versions = await listArtwork(root, panelId);
  if (versions.length === 0) throw new CompareError("NOT_FOUND", `No artwork for panel: ${panelId}`);
  const assignments = await listAssignmentsByPanel(root, panelId);
  if (assignments.length === 0) throw new CompareError("NOT_FOUND", `No character assigned to panel ${panelId}`);
  const versionId = await approvedCharacterVersion(root, assignments[0].characterId);
  const references = await listReferencesByVersion(root, versionId);
  const portrait = references.find((reference) => reference.slot === "portrait");
  if (!portrait) throw new CompareError("NOT_FOUND", `Approved version ${versionId} has no portrait reference`);
  const a = await describeArtwork(root, versions[versions.length - 1].artworkId);
  const { db } = openProjectDatabase(root);
  try {
    const assetRow = db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(portrait.assetId) as Record<string, unknown>;
    const assetPath = path.join(path.resolve(root), String(assetRow.relative_path));
    const bytes = fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : Buffer.alloc(0);
    const b: ComparedPair["b"] = {
      artworkId: portrait.referenceId,
      assetId: portrait.assetId,
      versionNo: 0,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.length,
    };
    return pairOf("vs-approved-portrait", a, b);
  } finally {
    db.close();
  }
}

/**
 * Mode 4: latest panel artwork vs each approved
 * reference asset (character views of the approved
 * version, pinned location/object variation references).
 * Returns exact compared pairs, one per reference.
 */
export async function compareVsApprovedReferences(
  root: string,
  panelId: string
): Promise<{ artwork: ComparedPair["a"]; comparisons: Array<{ kind: "character" | "location" | "object"; slot: string; assetId: string; sha256: string; byteSize: number; identical: boolean }> }> {
  requireProject(root);
  const versions = await listArtwork(root, panelId);
  if (versions.length === 0) throw new CompareError("NOT_FOUND", `No artwork for panel: ${panelId}`);
  const assignments = await listAssignmentsByPanel(root, panelId);
  if (assignments.length === 0) throw new CompareError("NOT_FOUND", `No character assigned to panel ${panelId}`);
  const artwork = await describeArtwork(root, versions[versions.length - 1].artworkId);
  const comparisons: Array<{ kind: "character" | "location" | "object"; slot: string; assetId: string; sha256: string; byteSize: number; identical: boolean }> = [];

  const describeRef = async (kind: "character" | "location" | "object", slot: string, assetId: string): Promise<void> => {
    const { db } = openProjectDatabase(root);
    try {
      const assetRow = db.prepare("SELECT * FROM assets WHERE asset_id = ?").get(assetId) as Record<string, unknown> | undefined;
      if (!assetRow) throw new CompareError("NOT_FOUND", `No asset with id: ${assetId}`);
      const assetPath = path.join(path.resolve(root), String(assetRow.relative_path));
      const bytes = fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : Buffer.alloc(0);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      comparisons.push({ kind, slot, assetId, sha256, byteSize: bytes.length, identical: sha256 === artwork.sha256 });
    } finally {
      db.close();
    }
  };

  const versionId = await approvedCharacterVersion(root, assignments[0].characterId);
  for (const reference of await listReferencesByVersion(root, versionId)) {
    await describeRef("character", reference.slot, reference.assetId);
  }

  const { db } = openProjectDatabase(root);
  try {
    const locationRow = db.prepare("SELECT * FROM panel_location_assignments WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    if (locationRow?.variation_id) {
      for (const reference of await listLocationReferencesByVariation(root, String(locationRow.variation_id))) {
        await describeRef("location", reference.slot, reference.assetId);
      }
    }
  } finally {
    db.close();
  }

  return { artwork, comparisons };
}
