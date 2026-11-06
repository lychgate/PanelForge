// PanelForge — Character Studio: profile records (S4.1, spec §8.4).
//
// Character profiles with the §8.4 field set:
//
// - `createCharacter` / `updateCharacter` / `deleteCharacter` CRUD
//   over name, description, physical appearance, age, personality,
//   clothing, equipment, distinguishing features, relationships, and
//   timeline. Every field except name is optional structured text;
//   omitted fields store as the empty string (never null).
// - Identity never changes: `characterId` and `createdAt` are stable
//   across updates; only `updatedAt` bumps.
//
// Visual versions stay S4.2; reference association stays S4.3;
// the entity bridge (create from a Stage 3 extraction) stays S4.6.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type CharacterProfile = {
  characterId: string;
  name: string;
  description: string;
  physicalAppearance: string;
  age: string;
  personality: string;
  clothing: string;
  equipment: string;
  distinguishingFeatures: string;
  relationships: string;
  timeline: string;
  sourceEntityId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CharacterInput = {
  name: string;
  description?: string;
  physicalAppearance?: string;
  age?: string;
  personality?: string;
  clothing?: string;
  equipment?: string;
  distinguishingFeatures?: string;
  relationships?: string;
  timeline?: string;
};

export class CharacterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CharacterError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new CharacterError(identified.code, identified.message);
  }
}

const TEXT_FIELDS = [
  "description",
  "physicalAppearance",
  "age",
  "personality",
  "clothing",
  "equipment",
  "distinguishingFeatures",
  "relationships",
  "timeline",
] as const;

function toRecord(row: Record<string, unknown>): CharacterProfile {
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

function validateInput(input: CharacterInput, partial: boolean): void {
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw new CharacterError("INVALID_ARGUMENTS", "name must not be empty");
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "name") continue;
    if (value !== undefined && typeof value !== "string") {
      throw new CharacterError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
}

/** Create a character profile. */
export async function createCharacter(root: string, input: CharacterInput): Promise<CharacterProfile> {
  requireProject(root);
  validateInput(input, false);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const characterId = crypto.randomUUID();
      return await runWithBusyRetry<CharacterProfile>(() => {
        db.prepare(
          "INSERT INTO characters (character_id, name, description, physical_appearance, age, personality, clothing, equipment, distinguishing_features, relationships, timeline, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          characterId,
          input.name.trim(),
          input.description ?? "",
          input.physicalAppearance ?? "",
          input.age ?? "",
          input.personality ?? "",
          input.clothing ?? "",
          input.equipment ?? "",
          input.distinguishingFeatures ?? "",
          input.relationships ?? "",
          input.timeline ?? "",
          now,
          now
        );
        const row = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(characterId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one character profile, or null. */
export async function getCharacter(root: string, characterId: string): Promise<CharacterProfile | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(characterId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all character profiles (creation order). */
export async function listCharacters(root: string): Promise<CharacterProfile[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM characters ORDER BY created_at, character_id").all() as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Update a character profile's fields (partial merges; identity never changes). */
export async function updateCharacter(root: string, characterId: string, patch: CharacterInput): Promise<CharacterProfile> {
  requireProject(root);
  validateInput(patch, true);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(characterId) as Record<string, unknown> | undefined;
      if (!current) throw new CharacterError("NOT_FOUND", `No character with id: ${characterId}`);
      const merged: CharacterInput & Record<string, unknown> = {
        name: patch.name ?? String(current.name),
        description: patch.description ?? String(current.description ?? ""),
        physicalAppearance: patch.physicalAppearance ?? String(current.physical_appearance ?? ""),
        age: patch.age ?? String(current.age ?? ""),
        personality: patch.personality ?? String(current.personality ?? ""),
        clothing: patch.clothing ?? String(current.clothing ?? ""),
        equipment: patch.equipment ?? String(current.equipment ?? ""),
        distinguishingFeatures: patch.distinguishingFeatures ?? String(current.distinguishing_features ?? ""),
        relationships: patch.relationships ?? String(current.relationships ?? ""),
        timeline: patch.timeline ?? String(current.timeline ?? ""),
      };
      return await runWithBusyRetry<CharacterProfile>(() => {
        db.prepare(
          "UPDATE characters SET name = ?, description = ?, physical_appearance = ?, age = ?, personality = ?, clothing = ?, equipment = ?, distinguishing_features = ?, relationships = ?, timeline = ?, updated_at = ? WHERE character_id = ?"
        ).run(
          (merged.name as string).trim(),
          merged.description as string,
          merged.physicalAppearance as string,
          merged.age as string,
          merged.personality as string,
          merged.clothing as string,
          merged.equipment as string,
          merged.distinguishingFeatures as string,
          merged.relationships as string,
          merged.timeline as string,
          now,
          characterId
        );
        const row = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(characterId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Delete a character profile. */
export async function deleteCharacter(root: string, characterId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(characterId);
        if (!current) throw new CharacterError("NOT_FOUND", `No character with id: ${characterId}`);
        db.prepare("DELETE FROM characters WHERE character_id = ?").run(characterId);
      });
    } finally {
      db.close();
    }
  });
}
