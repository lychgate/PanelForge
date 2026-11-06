// PanelForge — Art Studio: prompt assembly (S7.3, spec §8.8).
//
// Prompts from panel briefs, not from vibes:
//
// - `assemblePanelPrompt` builds one deterministic string
//   from the S6.9 instruction block (composition, background,
//   art direction) + S3.11 style fields (lighting, line art,
//   rendering technique, palette) + reference tags (S7.5
//   slots; opaque strings until S7.5). Fixed line order ⇒
//   the same brief + same inputs = byte-identical prompt.
// - Optional LM Studio polish (assist only): when an LLM
//   adapter is supplied, it gets one text task with the
//   deterministic prompt as input; failures, refusals, or
//   empty output fall back to the deterministic string.
//   With no adapter, output is always the deterministic
//   string, byte-identical.
// - `savePanelPrompt`/`getPanelPrompt` store the exact
//   string verbatim per panel (S7.6 reads it as the job's
//   prompt; no normalization drift).
// - Negative prompts stay S7.4; actual dispatch stays S7.6.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getInstructions } from "./panel-instructions";
import { getStyle } from "./styles";
import type { ProviderAdapter } from "../../engines/provider/types";

export type PanelPrompt = {
  panelId: string;
  prompt: string;
  styleId: string | null;
  polished: boolean;
  createdAt: string;
  updatedAt: string;
};

export class PromptAssemblyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PromptAssemblyError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new PromptAssemblyError(identified.code, identified.message);
  }
}

export type AssemblePromptInput = {
  panelId: string;
  styleId?: string;
  referenceTags?: string[];
  llmAdapter?: ProviderAdapter;
  llmModel?: string;
};

/**
 * Assemble (and optionally polish) the deterministic prompt
 * for one panel. Never fails on LLM trouble — falls back.
 */
export async function assemblePanelPrompt(root: string, input: AssemblePromptInput): Promise<{ prompt: string; polished: boolean }> {
  requireProject(root);
  if (typeof input.panelId !== "string" || input.panelId.trim() === "") {
    throw new PromptAssemblyError("INVALID_ARGUMENTS", "panelId must not be empty");
  }
  const instructions = await getInstructions(root, input.panelId);
  if (!instructions) {
    throw new PromptAssemblyError("NOT_FOUND", `No instructions for panel: ${input.panelId}`);
  }
  const style = input.styleId ? await getStyle(root, input.styleId) : null;
  if (input.styleId && !style) {
    throw new PromptAssemblyError("NOT_FOUND", `No style with id: ${input.styleId}`);
  }
  const referenceTags = input.referenceTags ?? [];
  for (const tag of referenceTags) {
    if (typeof tag !== "string") {
      throw new PromptAssemblyError("INVALID_ARGUMENTS", "referenceTags must be strings");
    }
  }

  const lines: string[] = [];
  if (instructions.compositionPrompt.trim() !== "") lines.push(instructions.compositionPrompt.trim());
  if (instructions.backgroundDetail.trim() !== "") lines.push(instructions.backgroundDetail.trim());
  if (instructions.artDirectionNotes.trim() !== "") lines.push(instructions.artDirectionNotes.trim());
  if (style) {
    if (style.lighting.trim() !== "") lines.push(`lighting: ${style.lighting.trim()}`);
    if (style.lineArt.trim() !== "") lines.push(`line art: ${style.lineArt.trim()}`);
    if (style.renderingTechnique.trim() !== "") lines.push(`rendering: ${style.renderingTechnique.trim()}`);
    if (style.colorPalette.length > 0) lines.push(`palette: ${style.colorPalette.join(", ")}`);
  }
  for (const tag of referenceTags) {
    lines.push(`reference: ${tag}`);
  }
  const deterministic = lines.join("\n");
  if (deterministic === "") {
    throw new PromptAssemblyError("INVALID_ARGUMENTS", "Panel brief is empty; nothing to assemble");
  }

  if (!input.llmAdapter) {
    return { prompt: deterministic, polished: false };
  }
  try {
    const result = await input.llmAdapter.execute({
      taskId: `prompt-polish-${input.panelId}`,
      taskType: "text",
      params: {
        model: input.llmModel,
        messages: [
          { role: "system", content: "Polish this image-generation prompt without changing its meaning. Return only the prompt." },
          { role: "user", content: deterministic },
        ],
      },
    });
    if (!result.ok) return { prompt: deterministic, polished: false };
    const text = extractText((result.output as { content?: string; text?: string; message?: { content?: string } } | null) ?? null);
    if (text === null || text.trim() === "") return { prompt: deterministic, polished: false };
    return { prompt: text.trim(), polished: true };
  } catch {
    return { prompt: deterministic, polished: false };
  }
}

function extractText(output: { content?: string; text?: string; message?: { content?: string } } | null): string | null {
  if (!output || typeof output !== "object") return null;
  const content = output.content ?? output.text ?? output.message?.content;
  return typeof content === "string" ? content : null;
}

/** Store the exact prompt string for one panel (replaces). */
export async function savePanelPrompt(root: string, input: { panelId: string; prompt: string; styleId?: string; polished?: boolean }): Promise<PanelPrompt> {
  requireProject(root);
  if (typeof input.panelId !== "string" || input.panelId.trim() === "") {
    throw new PromptAssemblyError("INVALID_ARGUMENTS", "panelId must not be empty");
  }
  if (typeof input.prompt !== "string" || input.prompt.trim() === "") {
    throw new PromptAssemblyError("INVALID_ARGUMENTS", "prompt must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new PromptAssemblyError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      return await runWithBusyRetry<PanelPrompt>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM panel_prompts WHERE panel_id = ?").run(input.panelId);
          db.prepare("INSERT INTO panel_prompts (panel_id, prompt, style_id, polished, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            input.panelId,
            input.prompt,
            input.styleId ?? null,
            input.polished ? 1 : 0,
            now,
            now
          );
          const row = db.prepare("SELECT * FROM panel_prompts WHERE panel_id = ?").get(input.panelId) as Record<string, unknown>;
          db.exec("COMMIT");
          return toPrompt(row);
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

/** The exact stored prompt for one panel, or null. */
export async function getPanelPrompt(root: string, panelId: string): Promise<PanelPrompt | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM panel_prompts WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? toPrompt(row) : null;
  } finally {
    db.close();
  }
}

function toPrompt(row: Record<string, unknown>): PanelPrompt {
  return {
    panelId: String(row.panel_id),
    prompt: String(row.prompt),
    styleId: row.style_id === null || row.style_id === undefined ? null : String(row.style_id),
    polished: Number(row.polished) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
