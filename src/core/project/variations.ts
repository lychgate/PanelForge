// PanelForge — Art Studio: variations (S7.7, spec §8.8).
//
// N candidate artworks per job:
//
// - `generateVariations` runs N sequential dispatches
//   (Small GPU concurrency-1 honored: variants never run
//   in parallel), each with a distinct seed, each its
//   own generation row + artwork version. All variants
//   share one job_id (as written on the artwork rows).
// - Count is capped (1..8) by the small-GPU job envelope;
//   out-of-range counts reject typed.
// - Each variant's provenance is independent (its own
//   generation row); a failed variant fails the run with
//   the completed variants preserved (never deleted).
//
// Inpainting stays S7.8.

import { identifyProject } from "./service";
import { openProjectDatabase } from "./metadata";
import { generatePanel, type PanelArtwork } from "./panel-generation";
import type { ProviderAdapter } from "../../engines/provider/types";
import * as crypto from "crypto";

export const MAX_VARIANTS = 8;

export class VariationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VariationError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new VariationError(identified.code, identified.message);
  }
}

export type VariationResult = {
  jobId: string;
  variants: PanelArtwork[];
};

/**
 * Generate N variants of one panel under one shared job,
 * sequentially (Small GPU concurrency-1 honored).
 */
export async function generateVariations(
  root: string,
  input: { panelId: string; templateName: string; count: number; adapter: ProviderAdapter; seed?: number }
): Promise<VariationResult> {
  requireProject(root);
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_VARIANTS) {
    throw new VariationError("INVALID_ARGUMENTS", `count must be an integer in 1..${MAX_VARIANTS}`);
  }
  const jobId = crypto.randomUUID();
  const baseSeed = input.seed ?? 0;
  const variants: PanelArtwork[] = [];
  for (let index = 0; index < input.count; index++) {
    const { artwork } = await generatePanel(root, {
      panelId: input.panelId,
      templateName: input.templateName,
      adapter: input.adapter,
      seed: baseSeed + index,
    });
    variants.push(artwork);
  }

  const { db } = openProjectDatabase(root);
  try {
    const update = db.prepare("UPDATE panel_artwork SET job_id = ?, variant_index = ? WHERE artwork_id = ?");
    for (let index = 0; index < variants.length; index++) {
      update.run(jobId, index, variants[index].artworkId);
    }
    db.close();
  } catch (err) {
    try {
      db.close();
    } catch {
      // Already closed.
    }
    throw err;
  }
  return { jobId, variants };
}

/** All variants sharing one job, in variant order. */
export async function listVariants(root: string, jobId: string): Promise<PanelArtwork[]> {
  requireProject(root);
  if (typeof jobId !== "string" || jobId.trim() === "") {
    throw new VariationError("INVALID_ARGUMENTS", "jobId must not be empty");
  }
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM panel_artwork WHERE job_id = ? ORDER BY variant_index").all(jobId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      artworkId: String(row.artwork_id),
      panelId: String(row.panel_id),
      generationId: String(row.generation_id),
      versionNo: Number(row.version_no),
      assetId: String(row.asset_id),
      createdAt: String(row.created_at),
    }));
  } finally {
    db.close();
  }
}
