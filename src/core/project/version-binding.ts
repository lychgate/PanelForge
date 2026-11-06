// PanelForge — Character Studio: version binding (S4.7, spec §8.4).
//
// Every panel can identify the exact version it uses:
//
// - `bindVersion` pins one version to one (panel, character) pair;
//   panel_id is an opaque ID until Stage 6 panel records exist
//   (mirroring S3.13's scope_ref convention). One binding per
//   pair; rebinding replaces.
// - `verifyBindingEra` warns when the bound version's age disagrees
//   with the age a panel states for the character (the §8.4
//   "incorrect version assigned to a scene" guard, Stage 6/9 call
//   this; Stage 4 only reports).
// - A version with live bindings cannot be deleted (S4.2 delete
//   now refuses; unbind first).
//
// Approval gating stays S4.8 (pending/rejected cannot bind).

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type CharacterBinding = {
  bindingId: string;
  panelId: string;
  characterId: string;
  versionId: string;
  createdAt: string;
  updatedAt: string;
};

export type EraCheck = {
  panelId: string;
  characterId: string;
  versionId: string | null;
  boundAge: string;
  expectedAge: string;
  mismatch: boolean;
  warnings: string[];
};

export class BindingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BindingError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new BindingError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): CharacterBinding {
  return {
    bindingId: String(row.binding_id),
    panelId: String(row.panel_id),
    characterId: String(row.character_id),
    versionId: String(row.version_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Bind one exact version to a (panel, character) pair (rebind replaces). */
export async function bindVersion(
  root: string,
  panelId: string,
  characterId: string,
  versionId: string
): Promise<CharacterBinding> {
  requireProject(root);
  for (const [key, value] of [["panelId", panelId], ["characterId", characterId], ["versionId", versionId]] as const) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new BindingError("INVALID_ARGUMENTS", `${key} must not be empty`);
    }
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
      if (!version) throw new BindingError("NOT_FOUND", `No version with id: ${versionId}`);
      if (String(version.character_id) !== characterId) {
        throw new BindingError("INVALID_ARGUMENTS", `Version ${versionId} does not belong to character ${characterId}`);
      }
      return await runWithBusyRetry<CharacterBinding>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_character_bindings WHERE panel_id = ? AND character_id = ?").run(panelId, characterId);
          const bindingId = crypto.randomUUID();
          db.prepare(
            "INSERT INTO panel_character_bindings (binding_id, panel_id, character_id, version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
          ).run(bindingId, panelId, characterId, versionId, now, now);
          const row = db.prepare("SELECT * FROM panel_character_bindings WHERE binding_id = ?").get(bindingId);
          db.exec("COMMIT");
          return toRecord(row as Record<string, unknown>);
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // Surface the original error.
          }
          throw err;
        }
      });
    } finally {
      db.close();
    }
  });
}

/** The binding for one (panel, character) pair, or null. */
export async function getBinding(root: string, panelId: string, characterId: string): Promise<CharacterBinding | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_character_bindings WHERE panel_id = ? AND character_id = ?").get(panelId, characterId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All bindings for one panel. */
export async function listBindingsByPanel(root: string, panelId: string): Promise<CharacterBinding[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM panel_character_bindings WHERE panel_id = ? ORDER BY character_id").all(panelId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** All bindings for one character (every panel that uses some version). */
export async function listBindingsByCharacter(root: string, characterId: string): Promise<CharacterBinding[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM panel_character_bindings WHERE character_id = ? ORDER BY panel_id").all(characterId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Remove one binding. */
export async function unbind(root: string, bindingId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      await runWithBusyRetry(() => {
        const current = db.prepare("SELECT * FROM panel_character_bindings WHERE binding_id = ?").get(bindingId);
        if (!current) throw new BindingError("NOT_FOUND", `No binding with id: ${bindingId}`);
        db.prepare("DELETE FROM panel_character_bindings WHERE binding_id = ?").run(bindingId);
      });
    } finally {
      db.close();
    }
  });
}

/**
 * Compare the bound version's age (version override, else the
 * profile's) against the age a panel states for the character.
 * A disagreement is a warning string, never an exception.
 */
export async function verifyBindingEra(root: string, panelId: string, characterId: string, expectedAge: string): Promise<EraCheck> {
  requireProject(root);
  const binding = await getBinding(root, panelId, characterId);
  if (!binding) {
    return {
      panelId,
      characterId,
      versionId: null,
      boundAge: "",
      expectedAge,
      mismatch: true,
      warnings: [`no version bound for character ${characterId} in panel ${panelId}`],
    };
  }
  const { db } = openProjectDatabase(root);
  try {
    const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(binding.versionId) as Record<string, unknown> | undefined;
    const profile = db.prepare("SELECT * FROM characters WHERE character_id = ?").get(characterId) as Record<string, unknown> | undefined;
    const overrideAge = version ? String(version.age ?? "") : "";
    const boundAge = overrideAge !== "" ? overrideAge : profile ? String(profile.age ?? "") : "";
    const mismatch = boundAge !== "" && expectedAge.trim() !== "" && boundAge !== expectedAge.trim();
    return {
      panelId,
      characterId,
      versionId: binding.versionId,
      boundAge,
      expectedAge,
      mismatch,
      warnings: mismatch
        ? [`bound version age ${boundAge} disagrees with panel-stated age ${expectedAge.trim()} for character ${characterId} in panel ${panelId}`]
        : [],
    };
  } finally {
    db.close();
  }
}
