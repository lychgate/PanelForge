// PanelForge — Object Studio: reference association (S5.6, spec §8.6).
//
// Registry assets linked to a variation with a role (S4.3/S5.3
// pattern):
//
// - `associateReference` binds one S1.5 asset to one object
//   variation under one slot kind: front, side, detail, in-use,
//   damaged. Unknown assets and unknown slots reject typed.
// - `listReferencesByVariation` / `listReferencesBySlot` return
//   the exact sets; `removeReference` unlinks one row.
// - An asset may serve any number of variations/slots.
//
// The entity bridge stays S5.7.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getAsset } from "./registry";

export type ObjectSlot = "front" | "side" | "detail" | "in-use" | "damaged";

export type VariationReference = {
  referenceId: string;
  variationId: string;
  assetId: string;
  slot: ObjectSlot;
  createdAt: string;
};

export type ReferenceInput = {
  variationId: string;
  assetId: string;
  slot: ObjectSlot;
};

export class ObjectReferenceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ObjectReferenceError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ObjectReferenceError(identified.code, identified.message);
  }
}

export function isObjectSlot(value: unknown): value is ObjectSlot {
  return value === "front" || value === "side" || value === "detail" || value === "in-use" || value === "damaged";
}

function toRecord(row: Record<string, unknown>): VariationReference {
  return {
    referenceId: String(row.reference_id),
    variationId: String(row.variation_id),
    assetId: String(row.asset_id),
    slot: String(row.slot) as ObjectSlot,
    createdAt: String(row.created_at),
  };
}

/** Associate one registry asset with one variation under one slot. */
export async function associateReference(root: string, input: ReferenceInput): Promise<VariationReference> {
  requireProject(root);
  if (typeof input.variationId !== "string" || input.variationId.trim() === "") {
    throw new ObjectReferenceError("INVALID_ARGUMENTS", "variationId must not be empty");
  }
  if (typeof input.assetId !== "string" || input.assetId.trim() === "") {
    throw new ObjectReferenceError("INVALID_ARGUMENTS", "assetId must not be empty");
  }
  if (!isObjectSlot(input.slot)) {
    throw new ObjectReferenceError("INVALID_ARGUMENTS", `Unknown object slot: ${String(input.slot)}`);
  }
  const asset = await getAsset(root, input.assetId);
  if (!asset) throw new ObjectReferenceError("NOT_FOUND", `No asset with id: ${input.assetId}`);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const variation = db.prepare("SELECT * FROM object_variations WHERE variation_id = ?").get(input.variationId) as Record<string, unknown> | undefined;
      if (!variation) {
        throw new ObjectReferenceError("NOT_FOUND", `No variation with id: ${input.variationId}`);
      }
      const referenceId = crypto.randomUUID();
      return await runWithBusyRetry<VariationReference>(() => {
        db.prepare(
          "INSERT INTO object_references (reference_id, variation_id, asset_id, slot, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(referenceId, input.variationId, input.assetId, input.slot, now);
        const row = db.prepare("SELECT * FROM object_references WHERE reference_id = ?").get(referenceId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one association, or null. */
export async function getReference(root: string, referenceId: string): Promise<VariationReference | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM object_references WHERE reference_id = ?").get(referenceId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All associations for one variation (creation order). */
export async function listReferencesByVariation(root: string, variationId: string): Promise<VariationReference[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM object_references WHERE variation_id = ? ORDER BY created_at, reference_id")
      .all(variationId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** All associations for one variation under one slot. */
export async function listReferencesBySlot(root: string, variationId: string, slot: ObjectSlot): Promise<VariationReference[]> {
  requireProject(root);
  if (!isObjectSlot(slot)) {
    throw new ObjectReferenceError("INVALID_ARGUMENTS", `Unknown object slot: ${String(slot)}`);
  }
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM object_references WHERE variation_id = ? AND slot = ? ORDER BY created_at, reference_id")
      .all(variationId, slot) as Array<Record<string, unknown>>;
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
        const current = db.prepare("SELECT * FROM object_references WHERE reference_id = ?").get(referenceId);
        if (!current) throw new ObjectReferenceError("NOT_FOUND", `No reference with id: ${referenceId}`);
        db.prepare("DELETE FROM object_references WHERE reference_id = ?").run(referenceId);
      });
    } finally {
      db.close();
    }
  });
}
