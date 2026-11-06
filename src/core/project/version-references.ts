// PanelForge — Character Studio: reference asset association (S4.3, spec §8.4).
//
// Registry assets linked to a version with a role:
//
// - `associateReference` binds one S1.5 asset to one character
//   version under one slot kind: portrait, front, side, rear,
//   expression, pose, clothing, equipment (the §8.4 generation
//   options). Unknown assets and unknown slots reject typed.
// - `listReferencesByVersion` / `listReferencesBySlot` return the
//   exact sets S4.4 scores; `removeReference` unlinks one row.
// - An asset may serve any number of versions/slots.
//
// Completeness scoring stays S4.4; binding stays S4.7.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getAsset } from "./registry";

export type ReferenceSlot =
  | "portrait"
  | "front"
  | "side"
  | "rear"
  | "expression"
  | "pose"
  | "clothing"
  | "equipment";

export type VersionReference = {
  referenceId: string;
  versionId: string;
  assetId: string;
  slot: ReferenceSlot;
  createdAt: string;
};

export type ReferenceInput = {
  versionId: string;
  assetId: string;
  slot: ReferenceSlot;
};

export class ReferenceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReferenceError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ReferenceError(identified.code, identified.message);
  }
}

export function isReferenceSlot(value: unknown): value is ReferenceSlot {
  return (
    value === "portrait" ||
    value === "front" ||
    value === "side" ||
    value === "rear" ||
    value === "expression" ||
    value === "pose" ||
    value === "clothing" ||
    value === "equipment"
  );
}

function toRecord(row: Record<string, unknown>): VersionReference {
  return {
    referenceId: String(row.reference_id),
    versionId: String(row.version_id),
    assetId: String(row.asset_id),
    slot: String(row.slot) as ReferenceSlot,
    createdAt: String(row.created_at),
  };
}

/** Associate one registry asset with one version under one slot. */
export async function associateReference(root: string, input: ReferenceInput): Promise<VersionReference> {
  requireProject(root);
  if (typeof input.versionId !== "string" || input.versionId.trim() === "") {
    throw new ReferenceError("INVALID_ARGUMENTS", "versionId must not be empty");
  }
  if (typeof input.assetId !== "string" || input.assetId.trim() === "") {
    throw new ReferenceError("INVALID_ARGUMENTS", "assetId must not be empty");
  }
  if (!isReferenceSlot(input.slot)) {
    throw new ReferenceError("INVALID_ARGUMENTS", `Unknown reference slot: ${String(input.slot)}`);
  }
  const asset = await getAsset(root, input.assetId);
  if (!asset) throw new ReferenceError("NOT_FOUND", `No asset with id: ${input.assetId}`);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(input.versionId) as Record<string, unknown> | undefined;
      if (!version) {
        throw new ReferenceError("NOT_FOUND", `No version with id: ${input.versionId}`);
      }
      const referenceId = crypto.randomUUID();
      return await runWithBusyRetry<VersionReference>(() => {
        db.prepare(
          "INSERT INTO character_version_references (reference_id, version_id, asset_id, slot, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(referenceId, input.versionId, input.assetId, input.slot, now);
        const row = db.prepare("SELECT * FROM character_version_references WHERE reference_id = ?").get(referenceId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one association, or null. */
export async function getReference(root: string, referenceId: string): Promise<VersionReference | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM character_version_references WHERE reference_id = ?").get(referenceId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All associations for one version (creation order). */
export async function listReferencesByVersion(root: string, versionId: string): Promise<VersionReference[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM character_version_references WHERE version_id = ? ORDER BY created_at, reference_id")
      .all(versionId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** All associations for one version under one slot. */
export async function listReferencesBySlot(root: string, versionId: string, slot: ReferenceSlot): Promise<VersionReference[]> {
  requireProject(root);
  if (!isReferenceSlot(slot)) {
    throw new ReferenceError("INVALID_ARGUMENTS", `Unknown reference slot: ${String(slot)}`);
  }
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM character_version_references WHERE version_id = ? AND slot = ? ORDER BY created_at, reference_id")
      .all(versionId, slot) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Remove one association. */
export async function removeReference(root: string, referenceId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM character_version_references WHERE reference_id = ?").get(referenceId);
        if (!current) throw new ReferenceError("NOT_FOUND", `No reference with id: ${referenceId}`);
        db.prepare("DELETE FROM character_version_references WHERE reference_id = ?").run(referenceId);
      });
    } finally {
      db.close();
    }
  });
}
