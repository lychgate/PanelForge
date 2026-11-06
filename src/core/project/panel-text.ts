// PanelForge — Storyboard Studio: dialogue, captions, actions, expressions (S6.7, spec §8.7).
//
// Text content per panel:
//
// - `setText` records one text block per real panel row:
//   dialogue (multiline; "Speaker: line" prefixes optional),
//   captions, actions, and expressions. Setting again replaces.
// - `getText` reads it back (null when unset).
// - Empty panels stay valid (no text required by construction).
//
// Scene style overrides stay S6.8.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type PanelText = {
  textId: string;
  panelId: string;
  dialogue: string;
  captions: string;
  actions: string;
  expressions: string;
  createdAt: string;
  updatedAt: string;
};

export class PanelTextError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PanelTextError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new PanelTextError(identified.code, identified.message);
  }
}

function toRecord(row: Record<string, unknown>): PanelText {
  return {
    textId: String(row.text_id),
    panelId: String(row.panel_id),
    dialogue: String(row.dialogue ?? ""),
    captions: String(row.captions ?? ""),
    actions: String(row.actions ?? ""),
    expressions: String(row.expressions ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Set (or replace) the text block for one panel. */
export async function setText(
  root: string,
  panelId: string,
  input: { dialogue?: string; captions?: string; actions?: string; expressions?: string }
): Promise<PanelText> {
  requireProject(root);
  if (typeof panelId !== "string" || panelId.trim() === "") throw new PanelTextError("INVALID_ARGUMENTS", "panelId must not be empty");
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && typeof value !== "string") {
      throw new PanelTextError("INVALID_ARGUMENTS", `${key} must be a string`);
    }
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT * FROM storyboard_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
      if (!panel) throw new PanelTextError("NOT_FOUND", `No panel with id: ${panelId}`);
      return await runWithBusyRetry<PanelText>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_text WHERE panel_id = ?").run(panelId);
          const textId = crypto.randomUUID();
          db.prepare("INSERT INTO panel_text (text_id, panel_id, dialogue, captions, actions, expressions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
            textId,
            panelId,
            input.dialogue ?? "",
            input.captions ?? "",
            input.actions ?? "",
            input.expressions ?? "",
            now,
            now
          );
          const row = db.prepare("SELECT * FROM panel_text WHERE text_id = ?").get(textId);
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

/** The text block for one panel, or null. */
export async function getText(root: string, panelId: string): Promise<PanelText | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_text WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}
