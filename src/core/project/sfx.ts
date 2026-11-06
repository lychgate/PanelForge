// PanelForge — Comic Layout Studio: sound effects (S8.8).
//
// SFX text overlays as vector lettering:
//
// - `createSfx`/`getSfx`/`listSfx`/`updateSfx`/
//   `deleteSfx` CRUD over `sfx` (text, weight, angle in
//   degrees, x/y in mm, scale multiplier).
// - Stored per placement; rendered as SVG text by
//   S8.11, never baked into artwork.
// - SFX work never touches the asset store.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import * as crypto from "crypto";

export type SfxWeight = "regular" | "bold" | "heavy";

export type Sfx = {
  sfxId: string;
  placementId: string;
  text: string;
  weight: SfxWeight;
  angle: number;
  x: number;
  y: number;
  scale: number;
  createdAt: string;
  updatedAt: string;
};

export type SfxInput = {
  placementId: string;
  text: string;
  weight?: SfxWeight;
  angle?: number;
  x: number;
  y: number;
  scale?: number;
};

export class SfxError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SfxError";
    this.code = code;
  }
}

const WEIGHTS: SfxWeight[] = ["regular", "bold", "heavy"];

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new SfxError(identified.code, identified.message);
  }
}

function validate(input: SfxInput): void {
  if (typeof input.placementId !== "string" || input.placementId.trim() === "") {
    throw new SfxError("INVALID_ARGUMENTS", "placementId must not be empty");
  }
  if (typeof input.text !== "string" || input.text.trim() === "") {
    throw new SfxError("INVALID_ARGUMENTS", "text must not be empty");
  }
  if (input.weight !== undefined && !WEIGHTS.includes(input.weight)) {
    throw new SfxError("INVALID_ARGUMENTS", `weight must be one of ${WEIGHTS.join("|")}`);
  }
  if (input.angle !== undefined && !Number.isFinite(input.angle)) {
    throw new SfxError("INVALID_ARGUMENTS", "angle must be a number (degrees)");
  }
  for (const [key, value] of [["x", input.x], ["y", input.y]] as const) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new SfxError("INVALID_ARGUMENTS", `${key} must be a non-negative number`);
    }
  }
  if (input.scale !== undefined && (typeof input.scale !== "number" || !Number.isFinite(input.scale) || input.scale <= 0)) {
    throw new SfxError("INVALID_ARGUMENTS", "scale must be a positive number");
  }
}

function toRecord(row: Record<string, unknown>): Sfx {
  return {
    sfxId: String(row.sfx_id),
    placementId: String(row.placement_id),
    text: String(row.text),
    weight: String(row.weight) as SfxWeight,
    angle: Number(row.angle),
    x: Number(row.x),
    y: Number(row.y),
    scale: Number(row.scale),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Create an SFX lettering record on one placement. */
export async function createSfx(root: string, input: SfxInput): Promise<Sfx> {
  requireProject(root);
  validate(input);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const placement = db.prepare("SELECT placement_id FROM page_panels WHERE placement_id = ?").get(input.placementId);
      if (!placement) throw new SfxError("NOT_FOUND", `No placement with id: ${input.placementId}`);
      const sfxId = crypto.randomUUID();
      await runWithBusyRetry(() =>
        db.prepare("INSERT INTO sfx (sfx_id, placement_id, text, weight, angle, x, y, scale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          sfxId,
          input.placementId,
          input.text.trim(),
          input.weight ?? "bold",
          input.angle ?? 0,
          input.x,
          input.y,
          input.scale ?? 1,
          now,
          now
        )
      );
      const row = db.prepare("SELECT * FROM sfx WHERE sfx_id = ?").get(sfxId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/** One SFX record, or null. */
export async function getSfx(root: string, sfxId: string): Promise<Sfx | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM sfx WHERE sfx_id = ?").get(sfxId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All SFX on one placement. */
export async function listSfx(root: string, placementId: string): Promise<Sfx[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM sfx WHERE placement_id = ? ORDER BY y, x").all(placementId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Edit an SFX record's lettering (text/weight/angle/position/scale). */
export async function updateSfx(
  root: string,
  sfxId: string,
  patch: Partial<Pick<SfxInput, "text" | "weight" | "angle" | "x" | "y" | "scale">>
): Promise<Sfx> {
  requireProject(root);
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM sfx WHERE sfx_id = ?").get(sfxId) as Record<string, unknown> | undefined;
      if (!current) throw new SfxError("NOT_FOUND", `No SFX with id: ${sfxId}`);
      const merged: SfxInput = {
        placementId: String(current.placement_id),
        text: patch.text ?? String(current.text),
        weight: (patch.weight ?? String(current.weight)) as SfxWeight,
        angle: patch.angle ?? Number(current.angle),
        x: patch.x ?? Number(current.x),
        y: patch.y ?? Number(current.y),
        scale: patch.scale ?? Number(current.scale),
      };
      validate(merged);
      await runWithBusyRetry(() =>
        db.prepare("UPDATE sfx SET text = ?, weight = ?, angle = ?, x = ?, y = ?, scale = ?, updated_at = ? WHERE sfx_id = ?").run(
          merged.text.trim(),
          merged.weight ?? "bold",
          merged.angle ?? 0,
          merged.x,
          merged.y,
          merged.scale ?? 1,
          now,
          sfxId
        )
      );
      const row = db.prepare("SELECT * FROM sfx WHERE sfx_id = ?").get(sfxId) as Record<string, unknown>;
      return toRecord(row);
    } finally {
      db.close();
    }
  });
}

/** Remove one SFX record (placements and artwork untouched). */
export async function deleteSfx(root: string, sfxId: string): Promise<void> {
  requireProject(root);
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT sfx_id FROM sfx WHERE sfx_id = ?").get(sfxId);
      if (!current) throw new SfxError("NOT_FOUND", `No SFX with id: ${sfxId}`);
      await runWithBusyRetry(() => db.prepare("DELETE FROM sfx WHERE sfx_id = ?").run(sfxId));
    } finally {
      db.close();
    }
  });
}
