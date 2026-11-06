// PanelForge — Character Studio: entity → character bridge (S4.6, spec §8.4).
//
// Profiles trace to their Stage 3 mentions, never auto-created:
//
// - `createProfileFromEntity` is the ONLY path from extraction to
//   profile: an explicit call naming one existing entity. It
//   copies the entity's name, records `source_entity_id`, and
//   leaves every other profile field empty — nothing is invented
//   (anti-fabrication per S3.7).
// - One profile per entity: a second creation from the same
//   entity rejects with DUPLICATE_SOURCE (partial unique index).
// - `resolveEntitySource` walks the S3.5 chain: entity → scene →
//   chapter → manuscript bytes, returning the exact normalized
//   slice and the resolved original bytes for the span.
// - `getCharacterFromEntity` finds the profile already created
//   from an entity (or null).
//
// Version binding stays S4.7; history stays S4.11.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { CharacterProfile } from "./characters";
import { EntityRecord } from "./entities";
import { getNormalization, sourceSpanFor } from "./text-normalize";
import { getManuscript, readManuscriptOriginal } from "./manuscripts";

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

function toProfile(row: Record<string, unknown>): CharacterProfile {
  return {
    characterId: String(row.character_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    physicalAppearance: String(row.physical_appearance ?? ""),
    age: String(row.age ?? ""),
    personality: String(row.personality ?? ""),
    clothing: String(row.clothing ?? ""),
    equipment: String(row.equipment ?? ""),
    distinguishingFeatures: String(row.distinguishing_features ?? ""),
    relationships: String(row.relationships ?? ""),
    timeline: String(row.timeline ?? ""),
    sourceEntityId: row.source_entity_id === null || row.source_entity_id === undefined ? null : String(row.source_entity_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
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

/**
 * Explicitly create a character profile from one Stage 3 entity.
 * Copies only the entity's name; everything else starts empty.
 */
export async function createProfileFromEntity(root: string, entityId: string): Promise<CharacterProfile> {
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
      const characterId = crypto.randomUUID();
      return await runWithBusyRetry<CharacterProfile>(() => {
        try {
          db.prepare(
            "INSERT INTO characters (character_id, name, description, physical_appearance, age, personality, clothing, equipment, distinguishing_features, relationships, timeline, source_entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            characterId,
            entity.name,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            entity.entityId,
            now,
            now
          );
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new BridgeError("DUPLICATE_SOURCE", `A character profile already exists for entity: ${entityId}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(characterId);
        return toProfile(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** The profile created from an entity, or null. */
export async function getCharacterFromEntity(root: string, entityId: string): Promise<CharacterProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM characters WHERE source_entity_id = ?").get(entityId) as Record<string, unknown> | undefined;
    return row ? toProfile(row) : null;
  } finally {
    db.close();
  }
}

export type EntitySourceResolution = {
  entity: EntityRecord;
  normalizedText: string;
  originalBytes: Buffer;
  originalText: string;
};

/**
 * Resolve an entity's exact source location: the normalized slice
 * plus the original bytes behind the span (S3.2 offset map).
 */
export async function resolveEntitySource(root: string, entityId: string): Promise<EntitySourceResolution> {
  requireProject(root);
  const entity = await findEntity(root, entityId);
  if (!entity) throw new BridgeError("NOT_FOUND", `No entity with id: ${entityId}`);
  const manuscript = await getManuscript(root, entity.manuscriptId);
  if (!manuscript) throw new BridgeError("NOT_FOUND", `No manuscript with id: ${entity.manuscriptId}`);
  const normalization = await getNormalization(root, entity.manuscriptId);
  if (!normalization) throw new BridgeError("NOT_FOUND", `No normalization for manuscript: ${entity.manuscriptId}`);
  const originalBytes = readManuscriptOriginal(root, manuscript);
  const original = sourceSpanFor(originalBytes, normalization.offsetMap, entity.normStart, entity.normEnd);
  return {
    entity,
    normalizedText: normalization.normalizedText.slice(entity.normStart, entity.normEnd),
    originalBytes: original,
    originalText: original.toString("utf8"),
  };
}
