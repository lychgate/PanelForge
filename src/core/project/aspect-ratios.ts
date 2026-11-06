// PanelForge — Art Studio: aspect ratio adjustment (S7.10, spec §8.8).
//
// Aspect ratios that fit the layout:
//
// - `resolveAspect` validates a ratio against the style's
//   S3.11 `aspectRatios` vocabulary (values like "1:1",
//   "16:9", "3:4"). Ratios outside the vocabulary reject
//   typed; the style itself must exist.
// - `dimsForRatio` derives concrete pixel dims from a
//   ratio, scaling the template canvas to preserve its
//   area (clamped to the Small GPU envelope).
// - `adjustPanelAspect` re-dispatches the panel with the
//   new dims through the S7.6 engine: the result is a new
//   artwork version, never a resize of approved work.
//   The chosen ratio is stored per panel.
// - Comparisons stay S7.11.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { getStyle, getDefaultStyle } from "./styles";
import { generatePanel } from "./panel-generation";
import type { ProviderAdapter } from "../../engines/provider/types";

export const ASPECT_ENVELOPE = 1024;

export class AspectError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AspectError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new AspectError(identified.code, identified.message);
  }
}

function parseRatio(aspect: string): { ratio: number } {
  const match = /^(\d+):(\d+)$/.exec(aspect.trim());
  if (!match) throw new AspectError("INVALID_ARGUMENTS", `aspect must be "W:H" (e.g. "3:4"): ${aspect}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) throw new AspectError("INVALID_ARGUMENTS", `aspect parts must be positive: ${aspect}`);
  return { ratio: width / height };
}

/**
 * Validate `aspect` against the style's vocabulary and
 * derive pixel dims preserving the base canvas area.
 */
export async function resolveAspect(
  root: string,
  input: { styleId?: string; aspect: string; baseDims?: { width: number; height: number } }
): Promise<{ aspect: string; dims: { width: number; height: number } }> {
  requireProject(root);
  if (typeof input.aspect !== "string" || input.aspect.trim() === "") {
    throw new AspectError("INVALID_ARGUMENTS", "aspect must not be empty");
  }
  const style = input.styleId ? await getStyle(root, input.styleId) : await getDefaultStyle(root);
  if (input.styleId && !style) throw new AspectError("NOT_FOUND", `No style with id: ${input.styleId}`);
  const vocabulary = style?.aspectRatios ?? [];
  if (!vocabulary.includes(input.aspect)) {
    throw new AspectError(
      "INVALID_ARGUMENTS",
      `aspect ${input.aspect} not in the style's vocabulary (${vocabulary.length > 0 ? vocabulary.join(", ") : "empty"})`
    );
  }
  const { ratio } = parseRatio(input.aspect);
  const base = input.baseDims ?? { width: 512, height: 512 };
  const area = base.width * base.height;
  const height = Math.round(Math.sqrt(area / ratio));
  const width = Math.round(Math.sqrt(area * ratio));
  if (width > ASPECT_ENVELOPE || height > ASPECT_ENVELOPE) {
    throw new AspectError("ENVELOPE_EXCEEDED", `aspect ${input.aspect} scales to ${width}x${height}, beyond the ${ASPECT_ENVELOPE}px envelope`);
  }
  return { aspect: input.aspect, dims: { width, height } };
}

/** The stored aspect choice for one panel, or null. */
export async function getPanelAspect(root: string, panelId: string): Promise<string | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT aspect FROM panel_aspects WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? String(row.aspect) : null;
  } finally {
    db.close();
  }
}

/**
 * Re-dispatch a panel at a new (vocabulary-validated)
 * aspect. Result is a new artwork version.
 */
export async function adjustPanelAspect(
  root: string,
  input: { panelId: string; aspect: string; styleId?: string; templateName: string; adapter: ProviderAdapter; seed?: number }
): Promise<{ aspect: string; generation: Awaited<ReturnType<typeof generatePanel>>["generation"]; artwork: Awaited<ReturnType<typeof generatePanel>>["artwork"] }> {
  requireProject(root);
  const resolved = await resolveAspect(root, { styleId: input.styleId, aspect: input.aspect });
  const { generation, artwork } = await generatePanel(root, {
    panelId: input.panelId,
    templateName: input.templateName,
    adapter: input.adapter,
    seed: input.seed,
    dims: resolved.dims,
  });
  await enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const panel = db.prepare("SELECT panel_id FROM storyboard_panels WHERE panel_id = ?").get(input.panelId);
      if (!panel) throw new AspectError("NOT_FOUND", `No panel with id: ${input.panelId}`);
      await runWithBusyRetry(() =>
        db.prepare("INSERT OR REPLACE INTO panel_aspects (panel_id, aspect, width, height, updated_at) VALUES (?, ?, ?, ?, ?)").run(
          input.panelId,
          resolved.aspect,
          resolved.dims.width,
          resolved.dims.height,
          new Date().toISOString()
        )
      );
    } finally {
      db.close();
    }
  });
  return { aspect: resolved.aspect, generation, artwork };
}
