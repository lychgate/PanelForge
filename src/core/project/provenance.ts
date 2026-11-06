// PanelForge — Art Studio: generation provenance (S7.12, spec §8.8).
//
// Every artwork explains how it was born:
//
// - `recordProvenance` writes the per-version ledger row:
//   workflow template + hash, prompt + negative prompt,
//   seed, model/provider, references, timestamp, job ID.
// - Provenance is insert-only (never edited): no update
//   or delete API exists.
// - `getProvenance` replays any artwork version's full
//   provenance; missing rows reject typed (never guess).
// - Version history/approval stays S7.13.

import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type Provenance = {
  artworkId: string;
  templateName: string;
  templateHash: string;
  prompt: string;
  negativePrompt: string;
  seed: number | null;
  model: string;
  provider: string;
  references: string;
  jobId: string;
  createdAt: string;
};

export class ProvenanceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProvenanceError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new ProvenanceError(identified.code, identified.message);
  }
}

/** Best-effort model hint from a workflow graph (checkpoint/model input). */
export function modelFromWorkflow(workflow: Record<string, unknown>): string {
  for (const node of Object.values(workflow)) {
    if (node === null || typeof node !== "object") continue;
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs ?? {};
    for (const key of ["model_name", "ckpt_name", "unet_name", "model"]) {
      const value = inputs[key];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
  }
  return "unspecified";
}

export type RecordProvenanceInput = {
  artworkId: string;
  templateName: string;
  templateHash: string;
  prompt: string;
  negativePrompt: string;
  seed?: number | null;
  model?: string;
  provider?: string;
  references?: string;
  jobId: string;
};

/** Insert one provenance row (append-only; never edited). */
export async function recordProvenance(root: string, input: RecordProvenanceInput): Promise<Provenance> {
  requireProject(root);
  if (typeof input.artworkId !== "string" || input.artworkId.trim() === "") {
    throw new ProvenanceError("INVALID_ARGUMENTS", "artworkId must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const artwork = db.prepare("SELECT artwork_id FROM panel_artwork WHERE artwork_id = ?").get(input.artworkId);
      if (!artwork) throw new ProvenanceError("NOT_FOUND", `No artwork with id: ${input.artworkId}`);
      const existing = db.prepare("SELECT artwork_id FROM artwork_provenance WHERE artwork_id = ?").get(input.artworkId);
      if (existing) throw new ProvenanceError("INVALID_ARGUMENTS", `Provenance already recorded for artwork: ${input.artworkId}`);
      await runWithBusyRetry(() =>
        db.prepare(
          `INSERT INTO artwork_provenance (artwork_id, template_name, template_hash, prompt, negative_prompt, seed, model, provider, "references", job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          input.artworkId,
          input.templateName,
          input.templateHash,
          input.prompt,
          input.negativePrompt,
          input.seed ?? null,
          input.model ?? "unspecified",
          input.provider ?? "comfyui",
          input.references ?? "",
          input.jobId,
          now
        )
      );
      const row = db.prepare("SELECT * FROM artwork_provenance WHERE artwork_id = ?").get(input.artworkId) as Record<string, unknown>;
      return toProvenance(row);
    } finally {
      db.close();
    }
  });
}

/** Replay any artwork version's full provenance. */
export async function getProvenance(root: string, artworkId: string): Promise<Provenance> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM artwork_provenance WHERE artwork_id = ?").get(artworkId) as Record<string, unknown> | undefined;
    if (!row) throw new ProvenanceError("NOT_FOUND", `No provenance recorded for artwork: ${artworkId}`);
    return toProvenance(row);
  } finally {
    db.close();
  }
}

function toProvenance(row: Record<string, unknown>): Provenance {
  return {
    artworkId: String(row.artwork_id),
    templateName: String(row.template_name),
    templateHash: String(row.template_hash),
    prompt: String(row.prompt),
    negativePrompt: String(row.negative_prompt ?? ""),
    seed: row.seed === null || row.seed === undefined ? null : Number(row.seed),
    model: String(row.model),
    provider: String(row.provider),
    references: String(row.references ?? ""),
    jobId: String(row.job_id),
    createdAt: String(row.created_at),
  };
}
