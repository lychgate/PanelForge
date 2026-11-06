// PanelForge — Location/Object Studios: generation-request records (S5.8, spec §8.5/§8.6).
//
// Stage 5 records generation requests; it never generates
// (S4.9 pattern, one shared table with a subject discriminator):
//
// - `createRequest` stores the prompt inputs for one
//   (studio, variation, slot) triple: provider + task type
//   validated against the Stage 2 provider contract shape
//   (ProviderId, TaskType=image), prompt required non-empty.
//   Recreating replaces.
// - `attachResultAsset` links the registry asset a later
//   Stage 7 run produces (null until then). No execution, no
//   model calls, no health checks happen here — zero provider
//   traffic.
// - Studio is "location" or "object"; the subject must exist in
//   the matching variation table.
//
// Live ComfyUI execution stays Stage 7; history stays S5.9.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";

export type Studio = "location" | "object";
export type GenerationProvider = "lmstudio" | "comfyui" | "mock";

export type StudioRequest = {
  requestId: string;
  studio: Studio;
  subjectId: string;
  slot: string;
  provider: GenerationProvider;
  prompt: string;
  negativePrompt: string;
  resultAssetId: string | null;
  status: "requested" | "fulfilled";
  createdAt: string;
  updatedAt: string;
};

export type RequestInput = {
  studio: Studio;
  subjectId: string;
  slot: string;
  provider: GenerationProvider;
  prompt: string;
  negativePrompt?: string;
};

export class StudioRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StudioRequestError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new StudioRequestError(identified.code, identified.message);
  }
}

function isProvider(value: unknown): value is GenerationProvider {
  return value === "lmstudio" || value === "comfyui" || value === "mock";
}

function toRecord(row: Record<string, unknown>): StudioRequest {
  return {
    requestId: String(row.request_id),
    studio: String(row.studio) as Studio,
    subjectId: String(row.subject_id),
    slot: String(row.slot),
    provider: String(row.provider) as GenerationProvider,
    prompt: String(row.prompt),
    negativePrompt: String(row.negative_prompt ?? ""),
    resultAssetId: row.result_asset_id === null || row.result_asset_id === undefined ? null : String(row.result_asset_id),
    status: String(row.status) as StudioRequest["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Store one generation request (creates; recreating replaces). */
export async function createRequest(root: string, input: RequestInput): Promise<StudioRequest> {
  requireProject(root);
  if (input.studio !== "location" && input.studio !== "object") {
    throw new StudioRequestError("INVALID_ARGUMENTS", `Unknown studio: ${String(input.studio)}`);
  }
  if (typeof input.subjectId !== "string" || input.subjectId.trim() === "") {
    throw new StudioRequestError("INVALID_ARGUMENTS", "subjectId must not be empty");
  }
  if (typeof input.slot !== "string" || input.slot.trim() === "") {
    throw new StudioRequestError("INVALID_ARGUMENTS", "slot must not be empty");
  }
  if (!isProvider(input.provider)) throw new StudioRequestError("INVALID_ARGUMENTS", `Unknown provider: ${String(input.provider)}`);
  if (typeof input.prompt !== "string" || input.prompt.trim() === "") {
    throw new StudioRequestError("INVALID_ARGUMENTS", "prompt must not be empty");
  }
  if (input.negativePrompt !== undefined && typeof input.negativePrompt !== "string") {
    throw new StudioRequestError("INVALID_ARGUMENTS", "negativePrompt must be a string");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const table = input.studio === "location" ? "location_variations" : "object_variations";
      const subject = db.prepare(`SELECT * FROM ${table} WHERE variation_id = ?`).get(input.subjectId) as Record<string, unknown> | undefined;
      if (!subject) throw new StudioRequestError("NOT_FOUND", `No ${input.studio} variation with id: ${input.subjectId}`);
      return await runWithBusyRetry<StudioRequest>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM studio_generation_requests WHERE studio = ? AND subject_id = ? AND slot = ?").run(input.studio, input.subjectId, input.slot);
          const requestId = crypto.randomUUID();
          db.prepare(
            "INSERT INTO studio_generation_requests (request_id, studio, subject_id, slot, provider, prompt, negative_prompt, result_asset_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'requested', ?, ?)"
          ).run(requestId, input.studio, input.subjectId, input.slot, input.provider, input.prompt.trim(), input.negativePrompt ?? "", now, now);
          const row = db.prepare("SELECT * FROM studio_generation_requests WHERE request_id = ?").get(requestId);
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

/** Retrieve one request, or null. */
export async function getRequest(root: string, requestId: string): Promise<StudioRequest | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM studio_generation_requests WHERE request_id = ?").get(requestId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All requests for one subject (slot order). */
export async function listRequestsBySubject(root: string, studio: Studio, subjectId: string): Promise<StudioRequest[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db
      .prepare("SELECT * FROM studio_generation_requests WHERE studio = ? AND subject_id = ? ORDER BY slot, created_at")
      .all(studio, subjectId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Link the asset a later Stage 7 run produces (fulfilled). */
export async function attachResultAsset(root: string, requestId: string, assetId: string): Promise<StudioRequest> {
  requireProject(root);
  if (typeof assetId !== "string" || assetId.trim() === "") {
    throw new StudioRequestError("INVALID_ARGUMENTS", "assetId must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM studio_generation_requests WHERE request_id = ?").get(requestId) as Record<string, unknown> | undefined;
      if (!current) throw new StudioRequestError("NOT_FOUND", `No request with id: ${requestId}`);
      return await runWithBusyRetry<StudioRequest>(() => {
        db.prepare("UPDATE studio_generation_requests SET result_asset_id = ?, status = 'fulfilled', updated_at = ? WHERE request_id = ?").run(assetId, now, requestId);
        const row = db.prepare("SELECT * FROM studio_generation_requests WHERE request_id = ?").get(requestId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}
