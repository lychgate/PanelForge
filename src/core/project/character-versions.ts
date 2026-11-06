// PanelForge — Character Studio: version records (S4.2, spec §8.4).
//
// Visual versions per character, independently identifiable:
//
// - `createVersion` / `updateVersion` / `deleteVersion` over a
//   human-readable label ("Robert, age 7") that is unique per
//   character (case-insensitive normalized key).
// - Per-version field overrides (physical appearance, age,
//   clothing) default to `""`, meaning "inherit from the character
//   profile" — an override never rewrites the profile itself.
// - Identity (`versionId`, `createdAt`) never changes across updates.
//
// Reference association stays S4.3; binding stays S4.7; approval
// stays S4.8 (delete guards for bound/approved versions land with
// those tasks; S4.2 deletes a bare version record).

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type CharacterVersion = {
  versionId: string;
  characterId: string;
  label: string;
  physicalAppearance: string;
  age: string;
  clothing: string;
  createdAt: string;
  updatedAt: string;
};

export type CharacterVersionInput = {
  characterId: string;
  label: string;
  physicalAppearance?: string;
  age?: string;
  clothing?: string;
};

export class CharacterVersionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CharacterVersionError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new CharacterVersionError(identified.code, identified.message);
  }
}

function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

function toRecord(row: Record<string, unknown>): CharacterVersion {
  return {
    versionId: String(row.version_id),
    characterId: String(row.character_id),
    label: String(row.label),
    physicalAppearance: String(row.physical_appearance ?? ""),
    age: String(row.age ?? ""),
    clothing: String(row.clothing ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function validateInput(input: CharacterVersionInput, partial: boolean): void {
  if (!partial && (typeof input.characterId !== "string" || input.characterId.trim() === "")) {
    throw new CharacterVersionError("INVALID_ARGUMENTS", "characterId must not be empty");
  }
  if (!partial || input.label !== undefined) {
    if (typeof input.label !== "string" || input.label.trim() === "") {
      throw new CharacterVersionError("INVALID_ARGUMENTS", "label must not be empty");
    }
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "physicalAppearance" || key === "age" || key === "clothing") {
      if (value !== undefined && typeof value !== "string") {
        throw new CharacterVersionError("INVALID_ARGUMENTS", `${key} must be a string`);
      }
    }
  }
}

/** Create a visual version for an existing character. */
export async function createVersion(root: string, input: CharacterVersionInput): Promise<CharacterVersion> {
  requireProject(root);
  validateInput(input, false);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const character = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(input.characterId) as Record<string, unknown> | undefined;
      if (!character) {
        throw new CharacterVersionError("NOT_FOUND", `No character with id: ${input.characterId}`);
      }
      const versionId = crypto.randomUUID();
      return await runWithBusyRetry<CharacterVersion>(() => {
        try {
          db.prepare(
            "INSERT INTO character_versions (version_id, character_id, label, label_key, physical_appearance, age, clothing, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            versionId,
            input.characterId,
            input.label.trim(),
            labelKey(input.label),
            input.physicalAppearance ?? "",
            input.age ?? "",
            input.clothing ?? "",
            now,
            now
          );
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new CharacterVersionError("DUPLICATE_LABEL", `Version label already exists for this character: ${input.label.trim()}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Retrieve one version, or null. */
export async function getVersion(root: string, versionId: string): Promise<CharacterVersion | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** List all versions of one character (creation order). */
export async function listVersions(root: string, characterId: string): Promise<CharacterVersion[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM character_versions WHERE character_id = ? ORDER BY created_at, version_id")
      .all(characterId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Update a version's label/overrides (partial merges; identity never changes). */
export async function updateVersion(root: string, versionId: string, patch: CharacterVersionInput): Promise<CharacterVersion> {
  requireProject(root);
  validateInput(patch, true);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
      if (!current) throw new CharacterVersionError("NOT_FOUND", `No version with id: ${versionId}`);
      const merged: CharacterVersionInput & Record<string, unknown> = {
        characterId: String(current.character_id),
        label: patch.label ?? String(current.label),
        physicalAppearance: patch.physicalAppearance ?? String(current.physical_appearance ?? ""),
        age: patch.age ?? String(current.age ?? ""),
        clothing: patch.clothing ?? String(current.clothing ?? ""),
      };
      return await runWithBusyRetry<CharacterVersion>(() => {
        try {
          db.prepare(
            "UPDATE character_versions SET label = ?, label_key = ?, physical_appearance = ?, age = ?, clothing = ?, updated_at = ? WHERE version_id = ?"
          ).run(
            (merged.label as string).trim(),
            labelKey(merged.label as string),
            merged.physicalAppearance as string,
            merged.age as string,
            merged.clothing as string,
            now,
            versionId
          );
        } catch (err) {
          if (String((err as Error).message).includes("UNIQUE constraint")) {
            throw new CharacterVersionError("DUPLICATE_LABEL", `Version label already exists for this character: ${merged.label as string}`);
          }
          throw err;
        }
        const row = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

/** Delete a bare version record (bound/approved guards land with S4.7/S4.8). */
export async function deleteVersion(root: string, versionId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId);
        if (!current) throw new CharacterVersionError("NOT_FOUND", `No version with id: ${versionId}`);
        db.prepare("DELETE FROM character_versions WHERE version_id = ?").run(versionId);
      });
    } finally {
      db.close();
    }
  });
}
