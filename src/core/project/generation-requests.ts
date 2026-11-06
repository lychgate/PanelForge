// PanelForge — Character Studio: generation-request records (S4.9, spec §8.4).
//
// Stage 4 records generation requests; it never generates:
//
// - `createGenerationRequest` stores the prompt inputs for one
//   (version, slot): provider + task type validated against the
//   Stage 2 provider contract shape (ProviderId, TaskType=image),
//   prompt required non-empty.
// - `attachResultAsset` links the registry asset a later Stage 7
//   run produces (null until then). No execution, no model
//   calls, no health checks happen here — zero provider traffic.
// - Requests list per version; one request exists per
//   (version, slot) until replaced (recreate replaces, like S4.7
//   rebinding).
//
// Live ComfyUI execution stays Stage 7; comparison stays S4.10.

import * as crypto from "crypto";
import { identifyProject } from "./service";
import { openProjectDatabase, enqueueWrite, runWithBusyRetry } from "./metadata";
import { isReferenceSlot, ReferenceSlot } from "./version-references";

export type GenerationProvider = "lmstudio" | "comfyui" | "mock";

export type GenerationRequest = {
  requestId: string;
  versionId: string;
  slot: ReferenceSlot;
  provider: GenerationProvider;
  prompt: string;
  negativePrompt: string;
  resultAssetId: string | null;
  status: "requested" | "fulfilled";
  createdAt: string;
  updatedAt: string;
};

export type GenerationRequestInput = {
  versionId: string;
  slot: ReferenceSlot;
  provider: GenerationProvider;
  prompt: string;
  negativePrompt?: string;
};

export class GenerationRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GenerationRequestError";
    this.code = code;
  }
}

function requireProject(root: string): void {
  const identified = identifyProject(root);
  if (!identified.ok) {
    throw new GenerationRequestError(identified.code, identified.message);
  }
}

function isProvider(value: unknown): value is GenerationProvider {
  return value === "lmstudio" || value === "comfyui" || value === "mock";
}

function toRecord(row: Record<string, unknown>): GenerationRequest {
  return {
    requestId: String(row.request_id),
    versionId: String(row.version_id),
    slot: String(row.slot) as ReferenceSlot,
    provider: String(row.provider) as GenerationProvider,
    prompt: String(row.prompt),
    negativePrompt: String(row.negative_prompt ?? ""),
    resultAssetId: row.result_asset_id === null || row.result_asset_id === undefined ? null : String(row.result_asset_id),
    status: String(row.status) as GenerationRequest["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Store one generation request (creates; recreating replaces). */
export async function createGenerationRequest(root: string, input: GenerationRequestInput): Promise<GenerationRequest> {
  requireProject(root);
  if (typeof input.versionId !== "string" || input.versionId.trim() === "") {
    throw new GenerationRequestError("INVALID_ARGUMENTS", "versionId must not be empty");
  }
  if (!isReferenceSlot(input.slot)) throw new GenerationRequestError("INVALID_ARGUMENTS", `Unknown reference slot: ${String(input.slot)}`);
  if (!isProvider(input.provider)) throw new GenerationRequestError("INVALID_ARGUMENTS", `Unknown provider: ${String(input.provider)}`);
  if (typeof input.prompt !== "string" || input.prompt.trim() === "") {
    throw new GenerationRequestError("INVALID_ARGUMENTS", "prompt must not be empty");
  }
  if (input.negativePrompt !== undefined && typeof input.negativePrompt !== "string") {
    throw new GenerationRequestError("INVALID_ARGUMENTS", "negativePrompt must be a string");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const version = db.prepare("SELECT * FROM character_versions WHERE version_id = ?").get(input.versionId) as Record<string, unknown> | undefined;
      if (!version) throw new GenerationRequestError("NOT_FOUND", `No version with id: ${input.versionId}`);
      return await runWithBusyRetry<GenerationRequest>(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("DELETE FROM generation_requests WHERE version_id = ? AND slot = ?").run(input.versionId, input.slot);
          const requestId = crypto.randomUUID();
          db.prepare(
            "INSERT INTO generation_requests (request_id, version_id, slot, provider, prompt, negative_prompt, result_asset_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'requested', ?, ?)"
          ).run(requestId, input.versionId, input.slot, input.provider, input.prompt.trim(), input.negativePrompt ?? "", now, now);
          const row = db.prepare("SELECT * FROM generation_requests WHERE request_id = ?").get(requestId);
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
export async function getGenerationRequest(root: string, requestId: string): Promise<GenerationRequest | null> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const row = db.prepare("SELECT * FROM generation_requests WHERE request_id = ?").get(requestId) as Record<string, unknown> | undefined;
    return row ? toRecord(row) : null;
  } finally {
    db.close();
  }
}

/** All requests for one version (slot order). */
export async function listGenerationRequestsByVersion(root: string, versionId: string): Promise<GenerationRequest[]> {
  requireProject(root);
  const { db } = openProjectDatabase(root);
  try {
    const rows = db.prepare("SELECT * FROM generation_requests WHERE version_id = ? ORDER BY slot, created_at").all(versionId) as Array<Record<string, unknown>>;
    return rows.map(toRecord);
  } finally {
    db.close();
  }
}

/** Link the asset a later Stage 7 run produces (fulfilled). */
export async function attachResultAsset(root: string, requestId: string, assetId: string): Promise<GenerationRequest> {
  requireProject(root);
  if (typeof assetId !== "string" || assetId.trim() === "") {
    throw new GenerationRequestError("INVALID_ARGUMENTS", "assetId must not be empty");
  }
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    const { db } = openProjectDatabase(root);
    try {
      const current = db.prepare("SELECT * FROM generation_requests WHERE request_id = ?").get(requestId) as Record<string, unknown> | undefined;
      if (!current) throw new GenerationRequestError("NOT_FOUND", `No request with id: ${requestId}`);
      return await runWithBusyRetry<GenerationRequest>(() => {
        db.prepare("UPDATE generation_requests SET result_asset_id = ?, status = 'fulfilled', updated_at = ? WHERE request_id = ?").run(assetId, now, requestId);
        const row = db.prepare("SELECT * FROM generation_requests WHERE request_id = ?").get(requestId);
        return toRecord(row as Record<string, unknown>);
      });
    } finally {
      db.close();
    }
  });
}

