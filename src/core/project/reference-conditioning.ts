// PanelForge — Art Studio: reference conditioning (S7.5, spec §8.8).
//
// Approved references shape the generation:
//
// - `setConditioning` attaches one slot choice per kind to
//   a panel: character (S4.3 version references by slot),
//   location variation (S5.3), object variation (S5.6).
//   Resolved references contribute their exact asset IDs.
// - The S4.8 gate: a character version whose approval is
//   pending/rejected cannot condition (typed NOT_APPROVED).
//   Location/object variations carry no approval state, so
//   their references condition as-is.
// - `getConditioning` returns the stored asset IDs per slot,
//   or null when unattached (unconditioned generation).
// - Individual generation dispatch stays S7.6.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { listReferencesBySlot as listVersionReferencesBySlot, isReferenceSlot } from "./version-references";
import { listReferencesBySlot as listLocationReferencesBySlot, isLocationSlot } from "./location-references";
import { listReferencesBySlot as listObjectReferencesBySlot, isObjectSlot } from "./object-references";

export type SlotConditioning = {
  slot: string;
  assetIds: string[];
};

export type PanelConditioning = {
  panelId: string;
  character: SlotConditioning | null;
  location: SlotConditioning | null;
  object: SlotConditioning | null;
  updatedAt: string;
};

export class ConditioningError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ConditioningError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ConditioningError(identified.code, identified.message);
  }
}

export type ConditioningInput = {
  panelId: string;
  character?: { versionId: string; slot: string };
  location?: { variationId: string; slot: string };
  object?: { variationId: string; slot: string };
};

/** Attach approved references by slot for one panel's jobs. */
export async function setConditioning(root: string, input: ConditioningInput): Promise<PanelConditioning> {
  requireProject(root);
  if (typeof input.panelId !== "string" || input.panelId.trim() === "") {
    throw new ConditioningError("INVALID_ARGUMENTS", "panelId must not be empty");
  }

  let character: { slot: string; assetIds: string[] } | null = null;
  if (input.character !== undefined) {
    const { versionId, slot } = input.character;
    if (typeof versionId !== "string" || versionId.trim() === "") throw new ConditioningError("INVALID_ARGUMENTS", "character.versionId must not be empty");
    if (!isReferenceSlot(slot)) throw new ConditioningError("INVALID_ARGUMENTS", `invalid character slot: ${slot}`);
    const { db } = openProjectDatabase(root);
    try {
      const version = db.prepare("SELECT approval_status FROM character_versions WHERE version_id = ?").get(versionId) as Record<string, unknown> | undefined;
      if (!version) throw new ConditioningError("NOT_FOUND", `No character version with id: ${versionId}`);
      const status = String(version.approval_status ?? "pending");
      if (status !== "approved") {
        throw new ConditioningError("NOT_APPROVED", `Character version ${versionId} is ${status}; only approved versions condition`);
      }
    } finally {
      db.close();
    }
    const references = await listVersionReferencesBySlot(root, versionId, slot);
    if (references.length === 0) throw new ConditioningError("NOT_FOUND", `No character references in slot ${slot} for version ${versionId}`);
    character = { slot, assetIds: references.map((reference) => reference.assetId) };
  }

  let location: { slot: string; assetIds: string[] } | null = null;
  if (input.location !== undefined) {
    const { variationId, slot } = input.location;
    if (typeof variationId !== "string" || variationId.trim() === "") throw new ConditioningError("INVALID_ARGUMENTS", "location.variationId must not be empty");
    if (!isLocationSlot(slot)) throw new ConditioningError("INVALID_ARGUMENTS", `invalid location slot: ${slot}`);
    const references = await listLocationReferencesBySlot(root, variationId, slot);
    if (references.length === 0) throw new ConditioningError("NOT_FOUND", `No location references in slot ${slot} for variation ${variationId}`);
    location = { slot, assetIds: references.map((reference) => reference.assetId) };
  }

  let object: { slot: string; assetIds: string[] } | null = null;
  if (input.object !== undefined) {
    const { variationId, slot } = input.object;
    if (typeof variationId !== "string" || variationId.trim() === "") throw new ConditioningError("INVALID_ARGUMENTS", "object.variationId must not be empty");
    if (!isObjectSlot(slot)) throw new ConditioningError("INVALID_ARGUMENTS", `invalid object slot: ${slot}`);
    const references = await listObjectReferencesBySlot(root, variationId, slot);
    if (references.length === 0) throw new ConditioningError("NOT_FOUND", `No object references in slot ${slot} for variation ${variationId}`);
    object = { slot, assetIds: references.map((reference) => reference.assetId) };
  }

  if (!character && !location && !object) {
    throw new ConditioningError("INVALID_ARGUMENTS", "Attach at least one reference (character, location, or object)");
  }

  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new ConditioningError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      return await runWithBusyRetry<PanelConditioning>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_conditioning WHERE panel_id = ?").run(input.panelId);
          db.prepare(
            "INSERT INTO panel_conditioning (panel_id, character_slot, character_asset_ids, location_slot, location_asset_ids, object_slot, object_asset_ids, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).run(
            input.panelId,
            character?.slot ?? null,
            character ? JSON.stringify(character.assetIds) : null,
            location?.slot ?? null,
            location ? JSON.stringify(location.assetIds) : null,
            object?.slot ?? null,
            object ? JSON.stringify(object.assetIds) : null,
            now
          );
          const row = db.prepare("SELECT * FROM panel_conditioning WHERE panel_id = ?").get(input.panelId) as Record<string, unknown>;
          db.exec("COMMIT");
          return toConditioning(row);
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

function parseIds(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function toConditioning(row: Record<string, unknown>): PanelConditioning {
  const slot = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
  const characterSlot = slot(row.character_slot);
  const locationSlot = slot(row.location_slot);
  const objectSlot = slot(row.object_slot);
  return {
    panelId: String(row.panel_id),
    character: characterSlot ? { slot: characterSlot, assetIds: parseIds(row.character_asset_ids) } : null,
    location: locationSlot ? { slot: locationSlot, assetIds: parseIds(row.location_asset_ids) } : null,
    object: objectSlot ? { slot: objectSlot, assetIds: parseIds(row.object_asset_ids) } : null,
    updatedAt: String(row.updated_at),
  };
}

/** The stored conditioning for one panel, or null (unconditioned). */
export async function getConditioning(root: string, panelId: string): Promise<PanelConditioning | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_conditioning WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? toConditioning(row) : null;
  } finally {
    db.close();
  }
}
