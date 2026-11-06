// PanelForge — Location/Object Studios: entity bridge (S5.7, spec §8.5/§8.6).
//
// Profiles trace to their Stage 3 mentions, never auto-created
// (S4.6 pattern, owner decision 2026-11-06):
//
// - `createLocationFromEntity` / `createObjectFromEntity` are the
//   only paths from extraction to profile: an explicit call
//   naming one existing entity. Each copies only the entity's
//   name, records `source_entity_id`, and leaves every other
//   profile field empty — nothing is invented (anti-fabrication
//   per S3.7).
// - One profile per entity per studio: a second creation from
//   the same entity rejects with DUPLICATE_SOURCE.
// - `getLocationFromEntity` / `getObjectFromEntity` find the
//   profile already created from an entity (or null); the
//   S4.6 `resolveEntitySource` walks the S3.5 chain to the
//   exact bytes.
//
// Generation-request records stay S5.8; history stays S5.9.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { LocationProfile } from "./locations";
import { ObjectProfile } from "./objects";
import { EntityRecord } from "./entities";

export class BridgeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new BridgeError(identified.code, identified.message);
  }
}

async function findEntity(root: string, entityId: string): Promise<EntityRecord | null> {
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM entities WHERE entity_id = ?").get(entityId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      entityId: String(row.entity_id),
      manuscriptId: String(row.manuscript_id),
      sceneId: row.scene_id === null ? null : String(row.scene_id),
      entityType: String(row.entity_type) as EntityRecord["entityType"],
      name: String(row.name),
      normStart: Number(row.norm_start),
      normEnd: Number(row.norm_end),
      confidence: Number(row.confidence),
      source: String(row.source) as EntityRecord["source"],
      createdAt: String(row.created_at),
    };
  } finally {
    db.close();
  }
}

function toLocation(row: Record<string, unknown>): LocationProfile {
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

function toObject(row: Record<string, unknown>): ObjectProfile {
  return {
    objectId: String(row.object_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    dimensions: String(row.dimensions ?? ""),
    materials: String(row.materials ?? ""),
    appearance: String(row.appearance ?? ""),
    damageStates: String(row.damage_states ?? ""),
    category: String(row.category ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Explicitly create a location profile from one Stage 3 entity. */
export async function createLocationFromEntity(root: string, entityId: string): Promise<LocationProfile> {
  requireProject(root);
  if (typeof entityId !== "string" || entityId.trim() === "") {
    throw new BridgeError("INVALID_ARGUMENTS", "entityId must not be empty");
  }
  const entity = await findEntity(root, entityId);
  if (!entity) throw new BridgeError("NOT_FOUND", `No entity with id: ${entityId}`);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const locationId = crypto.randomUUID();
      return await runWithBusyRetry<LocationProfile>(() => {
        try {
          db.prepare(
            "INSERT INTO locations (location_id, name, architecture, geography, layout, lighting, time_of_day, weather, materials, color_palette, damage_states, historical_variations, source_entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(locationId, entity.name, "", "", "", "", "", "", "", "", "", "", entity.entityId, now, now);
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new BridgeError("DUPLICATE_SOURCE", `A location profile already exists for entity: ${entityId}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM locations WHERE location_id = ?").get(locationId);
        return toLocation(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Explicitly create an object profile from one Stage 3 entity. */
export async function createObjectFromEntity(root: string, entityId: string): Promise<ObjectProfile> {
  requireProject(root);
  if (typeof entityId !== "string" || entityId.trim() === "") {
    throw new BridgeError("INVALID_ARGUMENTS", "entityId must not be empty");
  }
  const entity = await findEntity(root, entityId);
  if (!entity) throw new BridgeError("NOT_FOUND", `No entity with id: ${entityId}`);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const objectId = crypto.randomUUID();
      return await runWithBusyRetry<ObjectProfile>(() => {
        try {
          db.prepare(
            "INSERT INTO objects (object_id, name, description, dimensions, materials, appearance, damage_states, category, source_entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(objectId, entity.name, "", "", "", "", "", "", entity.entityId, now, now);
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new BridgeError("DUPLICATE_SOURCE", `An object profile already exists for entity: ${entityId}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM objects WHERE object_id = ?").get(objectId);
        return toObject(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** The location profile created from an entity, or null. */
export async function getLocationFromEntity(root: string, entityId: string): Promise<LocationProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM locations WHERE source_entity_id = ?").get(entityId) as Record<string, unknown> | undefined;
    return row ? toLocation(row) : null;
  } finally {
    db.close();
  }
}

/** The object profile created from an entity, or null. */
export async function getObjectFromEntity(root: string, entityId: string): Promise<ObjectProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM objects WHERE source_entity_id = ?").get(entityId) as Record<string, unknown> | undefined;
    return row ? toObject(row) : null;
  } finally {
    db.close();
  }
}
