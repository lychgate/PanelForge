// PanelForge — Object Studio: variations (S5.5, spec §8.6).
//
// Distinct states of one object, following the S4.2/S5.2 pattern:
//
// - `createVariation` / `updateVariation` / `deleteVariation`
//   over a human-readable label ("OmniPad, pristine" /
//   "OmniPad, damaged") unique per object (case-insensitive
//   normalized key).
// - Per-variation overrides (appearance, damage states) default
//   to `""` = inherit from the profile.
// - Identity (`variationId`, `createdAt`) never changes.
//
// Reference association stays S5.6.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type ObjectVariation = {
  variationId: string;
  objectId: string;
  label: string;
  appearance: string;
  damageStates: string;
  createdAt: string;
  updatedAt: string;
};

export type VariationInput = {
  objectId: string;
  label: string;
  appearance?: string;
  damageStates?: string;
};

export class ObjectVariationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ObjectVariationError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ObjectVariationError(identified.code, identified.message);
  }
}

function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

function toRecord(row: Record<string, unknown>): ObjectVariation {
  return {
    variationId: String(row.variation_id),
    objectId: String(row.object_id),
    label: String(row.label),
    appearance: String(row.appearance ?? ""),
    damageStates: String(row.damage_states ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: VariationInput, partial: boolean): void {
  if (!partial && (typeof input.objectId !== "string" || input.objectId.trim() === "")) {
    throw new ObjectVariationError("INVALID_ARGUMENTS", "objectId must not be empty");
  }
  if (!partial || input.label !== undefined) {
    if (typeof input.label !== "string" || input.label.trim() === "") {
      throw new ObjectVariationError("INVALID_ARGUMENTS", "label must not be empty");
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && key !== "objectId" && key !== "label" && typeof value !== "string") {
      throw new ObjectVariationError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
}

/** Create a variation for an existing object. */
export async function createVariation(root: string, input: VariationInput): Promise<ObjectVariation> {
  requireProject(root);
  validateInput(input, false);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const object = db.prepare("SELECT * FROM objects WHERE object_id = ?").get(input.objectId) as Record<string, unknown> | undefined;
      if (!object) {
        throw new ObjectVariationError("NOT_FOUND", `No object with id: ${input.objectId}`);
      }
      const variationId = crypto.randomUUID();
      return await runWithBusyRetry<ObjectVariation>(() => {
        try {
          db.prepare(
            "INSERT INTO object_variations (variation_id, object_id, label, label_key, appearance, damage_states, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            variationId,
            input.objectId,
            input.label.trim(),
            labelKey(input.label),
            input.appearance ?? "",
            input.damageStates ?? "",
            now,
            now
          );
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new ObjectVariationError("DUPLICATE_LABEL", `Variation label already exists for this object: ${input.label.trim()}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM object_variations WHERE variation_id = ?").get(variationId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one variation, or null. */
export async function getVariation(root: string, variationId: string): Promise<ObjectVariation | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM object_variations WHERE variation_id = ?").get(variationId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all variations of one object (creation order). */
export async function listVariations(root: string, objectId: string): Promise<ObjectVariation[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM object_variations WHERE object_id = ? ORDER BY created_at, variation_id")
      .all(objectId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Update a variation's label/overrides (partial merges; identity never changes). */
export async function updateVariation(root: string, variationId: string, patch: VariationInput): Promise<ObjectVariation> {
  requireProject(root);
  validateInput(patch, true);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM object_variations WHERE variation_id = ?").get(variationId) as Record<string, unknown> | undefined;
      if (!current) throw new ObjectVariationError("NOT_FOUND", `No variation with id: ${variationId}`);
      const merged: VariationInput & Record<string, unknown> = {
        objectId: String(current.object_id),
        label: patch.label ?? String(current.label),
        appearance: patch.appearance ?? String(current.appearance ?? ""),
        damageStates: patch.damageStates ?? String(current.damage_states ?? ""),
      };
      return await runWithBusyRetry<ObjectVariation>(() => {
        try {
          db.prepare(
            "UPDATE object_variations SET label = ?, label_key = ?, appearance = ?, damage_states = ?, updated_at = ? WHERE variation_id = ?"
          ).run(
            (merged.label as string).trim(),
            labelKey(merged.label as string),
            merged.appearance as string,
            merged.damageStates as string,
            now,
            variationId
          );
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new ObjectVariationError("DUPLICATE_LABEL", `Variation label already exists for this object: ${merged.label as string}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM object_variations WHERE variation_id = ?").get(variationId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Delete a variation record. */
export async function deleteVariation(root: string, variationId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM object_variations WHERE variation_id = ?").get(variationId);
        if (!current) throw new ObjectVariationError("NOT_FOUND", `No variation with id: ${variationId}`);
        db.prepare("DELETE FROM object_variations WHERE variation_id = ?").run(variationId);
      });
    } finally {
      db.close();
    }
  });
}
