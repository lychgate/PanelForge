// PanelForge — Comic Layout Studio: dialogue/caption editing (S8.7).
//
// Lettering text lives on overlays only:
//
// - `setLettering`/`getLettering` edit a balloon's
//   dialogue/caption text (one string per balloon).
// - Edits never touch artwork assets or S6.7 panel
//   text; artwork bytes stay byte-identical.
// - SFX stays S8.8.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type Lettering = {
  balloonId: string;
  text: string;
  updatedAt: string;
};

export class LetteringError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LetteringError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new LetteringError(identified.code, identified.message);
  }
}

/** Edit one balloon's lettering text (overlay only). */
export async function setLettering(root: string, input: { balloonId: string; text: string }): Promise<Lettering> {
  requireProject(root);
  if (typeof input.balloonId !== "string" || input.balloonId.trim() === "") {
    throw new LetteringError("INVALID_ARGUMENTS", "balloonId must not be empty");
  }
  if (typeof input.text !== "string") {
    throw new LetteringError("INVALID_ARGUMENTS", "text must be a string");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT balloon_id FROM balloons WHERE balloon_id = ?").get(input.balloonId);
      if (!current) throw new LetteringError("NOT_FOUND", `No balloon with id: ${input.balloonId}`);
      await runWithBusyRetry(() => db.prepare("UPDATE balloons SET text = ?, updated_at = ? WHERE balloon_id = ?").run(input.text, now, input.balloonId));
      const row = db.prepare("SELECT balloon_id, text, updated_at FROM balloons WHERE balloon_id = ?").get(input.balloonId) as Record<string, unknown>;
      return { balloonId: String(row.balloon_id), text: String(row.text ?? ""), updatedAt: String(row.updated_at) };
    } finally {
      db.close();
    }
  });
}

/** One balloon's lettering text, or null. */
export async function getLettering(root: string, balloonId: string): Promise<Lettering | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT balloon_id, text, updated_at FROM balloons WHERE balloon_id = ?").get(balloonId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { balloonId: String(row.balloon_id), text: String(row.text ?? ""), updatedAt: String(row.updated_at) };
  } finally {
    db.close();
  }
}
