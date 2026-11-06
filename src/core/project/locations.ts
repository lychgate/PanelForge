// PanelForge — Location Studio: profile records (S5.1, spec §8.5).
//
// Location profiles following the S4.1 pattern:
//
// - `createLocation` / `updateLocation` / `deleteLocation` CRUD
//   over name (required), architecture, geography, interior/
//   exterior layout, lighting, time of day, weather, materials,
//   color palette, damage states, and historical/chronological
//   variations. Every field except name is optional structured
//   text; omitted fields store as "".
// - Identity (`locationId`, `createdAt`) never changes.
//
// Variations stay S5.2; references stay S5.3; the entity bridge
// stays S5.7.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type LocationProfile = {
  locationId: string;
  name: string;
  architecture: string;
  geography: string;
  layout: string;
  lighting: string;
  timeOfDay: string;
  weather: string;
  materials: string;
  colorPalette: string;
  damageStates: string;
  historicalVariations: string;
  createdAt: string;
  updatedAt: string;
};

export type LocationInput = {
  name: string;
  architecture?: string;
  geography?: string;
  layout?: string;
  lighting?: string;
  timeOfDay?: string;
  weather?: string;
  materials?: string;
  colorPalette?: string;
  damageStates?: string;
  historicalVariations?: string;
};

export class LocationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LocationError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LocationError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): LocationProfile {
  return {
    locationId: String(row.location_id),
    name: String(row.name),
    architecture: String(row.architecture ?? ""),
    geography: String(row.geography ?? ""),
    layout: String(row.layout ?? ""),
    lighting: String(row.lighting ?? ""),
    timeOfDay: String(row.time_of_day ?? ""),
    weather: String(row.weather ?? ""),
    materials: String(row.materials ?? ""),
    colorPalette: String(row.color_palette ?? ""),
    damageStates: String(row.damage_states ?? ""),
    historicalVariations: String(row.historical_variations ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: LocationInput, partial: boolean): void {
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw new LocationError("INVALID_ARGUMENTS", "name must not be empty");
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "name") continue;
    if (value !== undefined && typeof value !== "string") {
      throw new LocationError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
}

/** Create a location profile. */
export async function createLocation(root: string, input: LocationInput): Promise<LocationProfile> {
  requireProject(root);
  validateInput(input, false);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const locationId = crypto.randomUUID();
      return await runWithBusyRetry<LocationProfile>(() => {
        db.prepare(
          "INSERT INTO locations (location_id, name, architecture, geography, layout, lighting, time_of_day, weather, materials, color_palette, damage_states, historical_variations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          locationId,
          input.name.trim(),
          input.architecture ?? "",
          input.geography ?? "",
          input.layout ?? "",
          input.lighting ?? "",
          input.timeOfDay ?? "",
          input.weather ?? "",
          input.materials ?? "",
          input.colorPalette ?? "",
          input.damageStates ?? "",
          input.historicalVariations ?? "",
          now,
          now
        );
        const row = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(locationId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one location profile, or null. */
export async function getLocation(root: string, locationId: string): Promise<LocationProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(locationId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all location profiles (creation order). */
export async function listLocations(root: string): Promise<LocationProfile[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM locations ORDER BY created_at, location_id").all() as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Update a location profile's fields (partial merges; identity never changes). */
export async function updateLocation(root: string, locationId: string, patch: LocationInput): Promise<LocationProfile> {
  requireProject(root);
  validateInput(patch, true);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(locationId) as Record<string, unknown> | undefined;
      if (!current) throw new LocationError("NOT_FOUND", `No location with id: ${locationId}`);
      const merged: LocationInput & Record<string, unknown> = {
        name: patch.name ?? String(current.name),
        architecture: patch.architecture ?? String(current.architecture ?? ""),
        geography: patch.geography ?? String(current.geography ?? ""),
        layout: patch.layout ?? String(current.layout ?? ""),
        lighting: patch.lighting ?? String(current.lighting ?? ""),
        timeOfDay: patch.timeOfDay ?? String(current.time_of_day ?? ""),
        weather: patch.weather ?? String(current.weather ?? ""),
        materials: patch.materials ?? String(current.materials ?? ""),
        colorPalette: patch.colorPalette ?? String(current.color_palette ?? ""),
        damageStates: patch.damageStates ?? String(current.damage_states ?? ""),
        historicalVariations: patch.historicalVariations ?? String(current.historical_variations ?? ""),
      };
      return await runWithBusyRetry<LocationProfile>(() => {
        db.prepare(
          "UPDATE locations SET name = ?, architecture = ?, geography = ?, layout = ?, lighting = ?, time_of_day = ?, weather = ?, materials = ?, color_palette = ?, damage_states = ?, historical_variations = ?, updated_at = ? WHERE location_id = ?"
        ).run(
          (merged.name as string).trim(),
          merged.architecture as string,
          merged.geography as string,
          merged.layout as string,
          merged.lighting as string,
          merged.timeOfDay as string,
          merged.weather as string,
          merged.materials as string,
          merged.colorPalette as string,
          merged.damageStates as string,
          merged.historicalVariations as string,
          now,
          locationId
        );
        const row = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(locationId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Delete a location profile. */
export async function deleteLocation(root: string, locationId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(locationId);
        if (!current) throw new LocationError("NOT_FOUND", `No location with id: ${locationId}`);
        db.prepare("DELETE FROM locations WHERE location_id = ?").run(locationId);
      });
    } finally {
      db.close();
    }
  });
}
