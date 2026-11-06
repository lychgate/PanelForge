// PanelForge — Location Studio: reference association (S5.3, spec §8.5).
//
// Registry assets linked to a variation with a role (S4.3 pattern):
//
// - `associateReference` binds one S1.5 asset to one location
//   variation under one slot kind: exterior, interior, overview,
//   detail, day, night, weather, damaged. Unknown assets and
//   unknown slots reject typed.
// - `listReferencesByVariation` / `listReferencesBySlot` return
//   the exact sets; `removeReference` unlinks one row.
// - An asset may serve any number of variations/slots.
//
// Object references stay S5.6; the entity bridge stays S5.7.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getAsset } from "./registry";

export type LocationSlot =
  | "exterior"
  | "interior"
  | "overview"
  | "detail"
  | "day"
  | "night"
  | "weather"
  | "damaged";

export type VariationReference = {
  referenceId: string;
  variationId: string;
  assetId: string;
  slot: LocationSlot;
  createdAt: string;
};

export type ReferenceInput = {
  variationId: string;
  assetId: string;
  slot: LocationSlot;
};

export class LocationReferenceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LocationReferenceError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LocationReferenceError(identified.code, identified.message);
  }
}

export function isLocationSlot(value: unknown): value is LocationSlot {
  return (
    value === "exterior" ||
    value === "interior" ||
    value === "overview" ||
    value === "detail" ||
    value === "day" ||
    value === "night" ||
    value === "weather" ||
    value === "damaged"
  );
}

function toRecord(row: Record<string, unknown>): VariationReference {
  return {
    referenceId: String(row.reference_id),
    variationId: String(row.variation_id),
    assetId: String(row.asset_id),
    slot: String(row.slot) as LocationSlot,
    createdAt: String(row.created_at),
  };
}

/** Associate one registry asset with one variation under one slot. */
export async function associateReference(root: string, input: ReferenceInput): Promise<VariationReference> {
  requireProject(root);
  if (typeof input.variationId !== "string" || input.variationId.trim() === "") {
    throw new LocationReferenceError("INVALID_ARGUMENTS", "variationId must not be empty");
  }
  if (typeof input.assetId !== "string" || input.assetId.trim() === "") {
    throw new LocationReferenceError("INVALID_ARGUMENTS", "assetId must not be empty");
  }
  if (!isLocationSlot(input.slot)) {
    throw new LocationReferenceError("INVALID_ARGUMENTS", `Unknown location slot: ${String(input.slot)}`);
  }
  const asset = await getAsset(root, input.assetId);
  if (!asset) throw new LocationReferenceError("NOT_FOUND", `No asset with id: ${input.assetId}`);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const variation = db.prepare("SELECT * FROM location_variations WHERE variation_id = ?").get(input.variationId) as Record<string, unknown> | undefined;
      if (!variation) {
        throw new LocationReferenceError("NOT_FOUND", `No variation with id: ${input.variationId}`);
      }
      const referenceId = crypto.randomUUID();
      return await runWithBusyRetry<VariationReference>(() => {
        db.prepare(
          "INSERT INTO location_references (reference_id, variation_id, asset_id, slot, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(referenceId, input.variationId, input.assetId, input.slot, now);
        const row = db.prepare("SELECT * FROM location_references WHERE reference_id = ?").get(referenceId);
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
    const row = db.prepare("SELECT * FROM location_references WHERE reference_id = ?").get(referenceId) as Record<string, unknown> | undefined;
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
      .prepare("SELECT * FROM location_references WHERE variation_id = ? ORDER BY created_at, reference_id")
      .all(variationId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** All associations for one variation under one slot. */
export async function listReferencesBySlot(root: string, variationId: string, slot: LocationSlot): Promise<VariationReference[]> {
  requireProject(root);
  if (!isLocationSlot(slot)) {
    throw new LocationReferenceError("INVALID_ARGUMENTS", `Unknown location slot: ${String(slot)}`);
  }
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM location_references WHERE variation_id = ? AND slot = ? ORDER BY created_at, reference_id")
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
        const current = db.prepare("SELECT * FROM location_references WHERE reference_id = ?").get(referenceId);
        if (!current) throw new LocationReferenceError("NOT_FOUND", `No reference with id: ${referenceId}`);
        db.prepare("DELETE FROM location_references WHERE reference_id = ?").run(referenceId);
      });
    } finally {
      db.close();
    }
  });
}
