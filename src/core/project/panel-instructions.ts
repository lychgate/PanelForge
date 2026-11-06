// PanelForge — Storyboard Studio: panel instructions (S6.9, spec §8.7).
//
// Generation-ready instruction text per panel:
//
// - `setInstructions` records one instruction block per real
//   panel row: composition prompt, background detail, and art
//   direction notes. Setting again replaces.
// - `getInstructions` reads it back (null when unset).
// - Malformed input (non-string blocks, unknown panel) rejects
//   with a typed error.
// - The Stage 7 consumer combines S6.3–S6.9 per panel.
//
// Storyboard snapshots stay S6.10.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type PanelInstructions = {
  instructionId: string;
  panelId: string;
  compositionPrompt: string;
  backgroundDetail: string;
  artDirectionNotes: string;
  createdAt: string;
  updatedAt: string;
};

export class PanelInstructionsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PanelInstructionsError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new PanelInstructionsError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): PanelInstructions {
  return {
    instructionId: String(row.instruction_id),
    panelId: String(row.panel_id),
    compositionPrompt: String(row.composition_prompt ?? ""),
    backgroundDetail: String(row.background_detail ?? ""),
    artDirectionNotes: String(row.art_direction_notes ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Set (or replace) the instruction block for one panel. */
export async function setInstructions(
  root: string,
  panelId: string,
  input: { compositionPrompt?: string; backgroundDetail?: string; artDirectionNotes?: string }
): Promise<PanelInstructions> {
  requireProject(root);
  if (typeof panelId !== "string" || panelId.trim() === "") throw new PanelInstructionsError("INVALID_ARGUMENTS", "panelId must not be empty");
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && typeof value !== "string") {
      throw new PanelInstructionsError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
      if (!panel) throw new PanelInstructionsError("NOT_FOUND", `No panel with id: ${panelId}`);
      return await runWithBusyRetry<PanelInstructions>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_instructions WHERE panel_id = ?").run(panelId);
          const instructionId = crypto.randomUUID();
          db.prepare("INSERT INTO panel_instructions (instruction_id, panel_id, composition_prompt, background_detail, art_direction_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            instructionId,
            panelId,
            input.compositionPrompt ?? "",
            input.backgroundDetail ?? "",
            input.artDirectionNotes ?? "",
            now,
            now
          );
          const row = db.prepare("SELECT * FROM panel_instructions WHERE instruction_id = ?").get(instructionId);
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

/** The instruction block for one panel, or null. */
export async function getInstructions(root: string, panelId: string): Promise<PanelInstructions | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_instructions WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}
