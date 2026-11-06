// PanelForge — Location Studio: variations (S5.2, spec §8.5).
//
// Distinct states of one location, following the S4.2 pattern:
//
// - `createVariation` / `updateVariation` / `deleteVariation` over
//   a human-readable label ("Ravenholt, winter, damaged") unique
//   per location (case-insensitive normalized key).
// - Per-variation overrides (lighting, time of day, weather,
//   damage states) default to `""` = inherit from the profile.
// - Identity (`variationId`, `createdAt`) never changes.
//
// Reference association stays S5.3.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type LocationVariation = {
  variationId: string;
  locationId: string;
  label: string;
  lighting: string;
  timeOfDay: string;
  weather: string;
  damageStates: string;
  createdAt: string;
  updatedAt: string;
};

export type VariationInput = {
  locationId: string;
  label: string;
  lighting?: string;
  timeOfDay?: string;
  weather?: string;
  damageStates?: string;
};

export class VariationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VariationError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new VariationError(identified.code, identified.message);
  }
}

function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

function toRecord(row: Record<string, unknown>): LocationVariation {
  return {
    variationId: String(row.variation_id),
    locationId: String(row.location_id),
    label: String(row.label),
    lighting: String(row.lighting ?? ""),
    timeOfDay: String(row.time_of_day ?? ""),
    weather: String(row.weather ?? ""),
    damageStates: String(row.damage_states ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: VariationInput, partial: boolean): void {
  if (!partial && (typeof input.locationId !== "string" || input.locationId.trim() === "")) {
    throw new VariationError("INVALID_ARGUMENTS", "locationId must not be empty");
  }
  if (!partial || input.label !== undefined) {
    if (typeof input.label !== "string" || input.label.trim() === "") {
      throw new VariationError("INVALID_ARGUMENTS", "label must not be empty");
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && key !== "locationId" && key !== "label" && typeof value !== "string") {
      throw new VariationError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
}

/** Create a variation for an existing location. */
export async function createVariation(root: string, input: VariationInput): Promise<LocationVariation> {
  requireProject(root);
  validateInput(input, false);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const location = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(input.locationId) as Record<string, unknown> | undefined;
      if (!location) {
        throw new VariationError("NOT_FOUND", `No location with id: ${input.locationId}`);
      }
      const variationId = crypto.randomUUID();
      return await runWithBusyRetry<LocationVariation>(() => {
        try {
          db.prepare(
            "INSERT INTO location_variations (variation_id, location_id, label, label_key, lighting, time_of_day, weather, damage_states, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            variationId,
            input.locationId,
            input.label.trim(),
            labelKey(input.label),
            input.lighting ?? "",
            input.timeOfDay ?? "",
            input.weather ?? "",
            input.damageStates ?? "",
            now,
            now
          );
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new VariationError("DUPLICATE_LABEL", `Variation label already exists for this location: ${input.label.trim()}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM location_variations WHERE variation_id = ?").get(variationId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one variation, or null. */
export async function getVariation(root: string, variationId: string): Promise<LocationVariation | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM location_variations WHERE variation_id = ?").get(variationId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all variations of one location (creation order). */
export async function listVariations(root: string, locationId: string): Promise<LocationVariation[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM location_variations WHERE location_id = ? ORDER BY created_at, variation_id")
      .all(locationId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Update a variation's label/overrides (partial merges; identity never changes). */
export async function updateVariation(root: string, variationId: string, patch: VariationInput): Promise<LocationVariation> {
  requireProject(root);
  validateInput(patch, true);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM location_variations WHERE variation_id = ?").get(variationId) as Record<string, unknown> | undefined;
      if (!current) throw new VariationError("NOT_FOUND", `No variation with id: ${variationId}`);
      const merged: VariationInput & Record<string, unknown> = {
        locationId: String(current.location_id),
        label: patch.label ?? String(current.label),
        lighting: patch.lighting ?? String(current.lighting ?? ""),
        timeOfDay: patch.timeOfDay ?? String(current.time_of_day ?? ""),
        weather: patch.weather ?? String(current.weather ?? ""),
        damageStates: patch.damageStates ?? String(current.damage_states ?? ""),
      };
      return await runWithBusyRetry<LocationVariation>(() => {
        try {
          db.prepare(
            "UPDATE location_variations SET label = ?, label_key = ?, lighting = ?, time_of_day = ?, weather = ?, damage_states = ?, updated_at = ? WHERE variation_id = ?"
          ).run(
            (merged.label as string).trim(),
            labelKey(merged.label as string),
            merged.lighting as string,
            merged.timeOfDay as string,
            merged.weather as string,
            merged.damageStates as string,
            now,
            variationId
          );
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new VariationError("DUPLICATE_LABEL", `Variation label already exists for this location: ${merged.label as string}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM location_variations WHERE variation_id = ?").get(variationId);
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
        const current = db.prepare("SELECT * FROM location_variations WHERE variation_id = ?").get(variationId);
        if (!current) throw new VariationError("NOT_FOUND", `No variation with id: ${variationId}`);
        db.prepare("DELETE FROM location_variations WHERE variation_id = ?").run(variationId);
      });
    } finally {
      db.close();
    }
  });
}
