// PanelForge — Art Studio: negative prompt handling (S7.4, spec §8.8).
//
// Negative prompts as first-class job fields:
//
// - `resolveNegativePrompt`: per-job negative wins (job
//   overrides — including an explicit empty string, which
//   means "no negative for this job"), then the style's
//   S3.11 default (explicit styleId or the canonical
//   default), then empty. The source is reported
//   ("job" | "style" | "none") so callers show where the
//   string came from.
// - `savePanelNegativePrompt`/`getPanelNegativePrompt`
//   store the resolved string verbatim per panel (empty
//   stays empty) for S7.6 dispatch.
// - Reference conditioning stays S7.5.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getStyle, getDefaultStyle } from "./styles";

export type NegativeSource = "job" | "style" | "none";

export type ResolvedNegative = {
  negative: string;
  source: NegativeSource;
};

export type PanelNegativePrompt = {
  panelId: string;
  negative: string;
  source: NegativeSource;
  updatedAt: string;
};

export class NegativePromptError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "NegativePromptError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new NegativePromptError(identified.code, identified.message);
  }
}

function requireString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    throw new NegativePromptError("INVALID_ARGUMENTS", `${name} must be a string`);
  }
}

export type ResolveNegativeInput = {
  styleId?: string;
  jobNegative?: string;
};

/**
 * Resolve the effective negative prompt. Explicit job
 * negatives (even empty) always win; otherwise fall back
 * to the style default (explicit styleId, else canonical
 * default); otherwise empty with source "none".
 */
export async function resolveNegativePrompt(root: string, input?: ResolveNegativeInput): Promise<ResolvedNegative> {
  requireProject(root);
  if (input?.jobNegative !== undefined) {
    requireString(input.jobNegative, "jobNegative");
    return { negative: input.jobNegative, source: "job" };
  }
  const style = input?.styleId ? await getStyle(root, input.styleId) : await getDefaultStyle(root);
  if (input?.styleId && !style) {
    throw new NegativePromptError("NOT_FOUND", `No style with id: ${input.styleId}`);
  }
  if (style && style.negativePrompt.trim() !== "") {
    return { negative: style.negativePrompt, source: "style" };
  }
  return { negative: "", source: "none" };
}

/** Store the resolved negative prompt verbatim for one panel. */
export async function savePanelNegativePrompt(
  root: string,
  input: { panelId: string; negative: string; source: NegativeSource }
): Promise<PanelNegativePrompt> {
  requireProject(root);
  requireString(input.panelId, "panelId");
  requireString(input.negative, "negative");
  if (input.panelId.trim() === "") throw new NegativePromptError("INVALID_ARGUMENTS", "panelId must not be empty");
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new NegativePromptError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      return await runWithBusyRetry<PanelNegativePrompt>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_negative_prompts WHERE panel_id = ?").run(input.panelId);
          db.prepare("INSERT INTO panel_negative_prompts (panel_id, negative_prompt, source, updated_at) VALUES (?, ?, ?, ?)").run(
            input.panelId,
            input.negative,
            input.source,
            now
          );
          const row = db.prepare("SELECT * FROM panel_negative_prompts WHERE panel_id = ?").get(input.panelId) as Record<string, unknown>;
          db.exec("COMMIT");
          return {
            panelId: String(row.panel_id),
            negative: String(row.negative_prompt ?? ""),
            source: String(row.source) as NegativeSource,
            updatedAt: String(row.updated_at),
          };
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

/** The stored negative prompt for one panel, or null. */
export async function getPanelNegativePrompt(root: string, panelId: string): Promise<PanelNegativePrompt | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_negative_prompts WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      panelId: String(row.panel_id),
      negative: String(row.negative_prompt ?? ""),
      source: String(row.source) as NegativeSource,
      updatedAt: String(row.updated_at),
    };
  } finally {
    db.close();
  }
}

/**
 * One-step convenience for S7.6: resolve (job > style >
 * none) and persist verbatim for the panel.
 */
export async function assembleNegativeForPanel(
  root: string,
  input: { panelId: string; styleId?: string; jobNegative?: string }
): Promise<PanelNegativePrompt> {
  const resolved = await resolveNegativePrompt(root, { styleId: input.styleId, jobNegative: input.jobNegative });
  return savePanelNegativePrompt(root, { panelId: input.panelId, negative: resolved.negative, source: resolved.source });
}
