// PanelForge — ComfyUI workflow client (S7.1, spec §8.8).
//
// High-level client over the S2.10 ComfyUiAdapter behind
// health gates:
//
// - `runWorkflow` checks provider health first; a closed
//   gate refuses with a typed UNAVAILABLE error and never
//   submits (no silent retries, no partial work).
// - Small GPU Mode envelope (S2.18) is honored at the gate:
//   workflow dimension params are validated against the
//   small-GPU profile (width/height ≤ 1024); oversized
//   workflows refuse with a typed ENVELOPE error rather
//   than silently downscaling.
// - Otherwise the adapter executes once; its ProviderResult
//   (ok + base64 image bytes) passes through unchanged.
// - Templates stay S7.2; prompt assembly stays S7.3.

import type { ProviderAdapter, ProviderProgress, ProviderResult } from "./types";
import type { ResourceProfile } from "../tasks/resources";
import { resolveSmallGpuProfile } from "../tasks/smallgpu";

export type ComfyWorkflowErrorCode =
  | "UNAVAILABLE"
  | "ENVELOPE_EXCEEDED"
  | "WORKFLOW_INVALID"
  | "FAILED"
  | "TIMEOUT";

export class ComfyWorkflowError extends Error {
  code: ComfyWorkflowErrorCode;
  constructor(code: ComfyWorkflowErrorCode, message: string) {
    super(message);
    this.name = "ComfyWorkflowError";
    this.code = code;
  }
}

export type RunComfyWorkflowInput = {
  taskId: string;
  workflow: Record<string, unknown>;
  profile?: ResourceProfile;
  onProgress?: (progress: ProviderProgress) => void;
};

export type ComfyWorkflowOutput = {
  images: string[];
  promptId: string;
};

function maxDimension(workflow: Record<string, unknown>): number | null {
  let max: number | null = null;
  for (const node of Object.values(workflow)) {
    if (node === null || typeof node !== "object") continue;
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) continue;
    for (const dimension of [inputs.width, inputs.height]) {
      if (typeof dimension === "number" && Number.isFinite(dimension)) {
        max = max === null ? dimension : Math.max(max, dimension);
      }
    }
  }
  return max;
}

/**
 * Run one ComfyUI workflow through a gated adapter.
 * Typed refusals (unavailable/oversized/invalid) never
 * submit; accepted runs execute exactly once.
 */
export async function runWorkflow(
  adapter: ProviderAdapter,
  input: RunComfyWorkflowInput
): Promise<{ ok: true; output: ComfyWorkflowOutput } | { ok: false; code: ComfyWorkflowErrorCode; message: string }> {
  if (typeof input.taskId !== "string" || input.taskId.trim() === "") {
    throw new ComfyWorkflowError("WORKFLOW_INVALID", "taskId must not be empty");
  }
  if (input.workflow === null || typeof input.workflow !== "object") {
    throw new ComfyWorkflowError("WORKFLOW_INVALID", "workflow (ComfyUI API-format node graph) is required");
  }

  const profile = input.profile ?? resolveSmallGpuProfile();
  const dimension = maxDimension(input.workflow);
  const limit = Math.min(profile.maxGenerationSize.width, profile.maxGenerationSize.height);
  if (dimension !== null && dimension > limit) {
    return {
      ok: false,
      code: "ENVELOPE_EXCEEDED",
      message: `workflow requests ${dimension}px, exceeding the ${profile.name} envelope (${limit}px); downscaling is a queue-level OOM recovery, never silent`,
    };
  }

  let health;
  try {
    health = await adapter.health();
  } catch (err) {
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (health.status !== "ready") {
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: `ComfyUI health gate closed (${health.status}): ${health.detail ?? "no detail"}`,
    };
  }

  const result: ProviderResult = await adapter.execute({
    taskId: input.taskId,
    taskType: "image",
    params: { workflow: input.workflow },
    onProgress: input.onProgress,
  });
  if (!result.ok) {
    return { ok: false, code: result.code as ComfyWorkflowErrorCode, message: result.message };
  }
  const output = result.output as { images?: string[]; promptId?: string };
  if (!Array.isArray(output.images) || typeof output.promptId !== "string") {
    return { ok: false, code: "FAILED", message: "ComfyUI returned malformed output (no images/promptId)" };
  }
  return { ok: true, output: { images: output.images, promptId: output.promptId } };
}
