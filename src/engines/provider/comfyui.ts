// PanelForge — ComfyUI connection adapter (S2.10).
//
// Implements the S2.1 provider contract against ComfyUI's HTTP API
// (no new dependencies — Node's built-in fetch):
//
// - GET  {base}/system_stats          → health (readiness)
// - POST {base}/prompt {prompt, client_id} → prompt_id (workflow run)
// - GET  {base}/history/{prompt_id}   → outputs when complete (polled)
// - GET  {base}/view?...              → image bytes for each output
// - POST {base}/interrupt             → best-effort server-side interrupt
//
// The caller supplies the workflow (ComfyUI "API format" node graph) in
// request params.workflow — conditioning (prompt/negative/reference) is
// the workflow's responsibility, not the adapter's. Presence is optional
// by design (§6.6): an unreachable provider reports UNAVAILABLE and
// never throws across the boundary. Progress is honest: stages only,
// no invented percentages.

import {
  ProviderAdapterError,
  type ProviderAdapter,
  type ProviderHealth,
  type ProviderResult,
  type ProviderTaskRequest,
} from "./types";

export const COMFYUI_DEFAULT_BASE_URL = "http://localhost:8188";
export const COMFYUI_DEFAULT_TIMEOUT_MS = 300000;
const POLL_INTERVAL_MS = 500;

export type ComfyUiConfig = {
  baseUrl?: string;
  clientIdPrefix?: string;
};

type HistoryEntry = {
  status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
  outputs?: Record<
    string,
    { images?: Array<{ filename: string; subfolder: string; type: string }> }
  >;
};

export class ComfyUiAdapter implements ProviderAdapter {
  readonly id = "comfyui" as const;
  readonly displayName = "ComfyUI";
  private readonly baseUrl: string;
  private readonly controllers = new Map<string, AbortController>();

  constructor(config: ComfyUiConfig = {}) {
    const envUrl = process.env.PANELFORGE_COMFYUI_URL;
    this.baseUrl = (config.baseUrl ?? envUrl ?? COMFYUI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /** Signal a running task; its fetch aborts (best-effort). */
  interrupt(taskId: string): void {
    this.controllers.get(taskId)?.abort();
    // Best-effort server-side interrupt.
    void fetch(`${this.baseUrl}/interrupt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: taskId }),
    }).catch(() => undefined);
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(COMFYUI_DEFAULT_TIMEOUT_MS),
      });
      if (!response.ok) {
        return {
          status: "unavailable",
          detail: `ComfyUI system_stats failed: ${response.status}`,
          checkedAt,
        };
      }
      return { status: "ready", checkedAt };
    } catch (err) {
      return {
        status: "unavailable",
        detail: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
    }
  }

  async execute(request: ProviderTaskRequest): Promise<ProviderResult> {
    const controller = new AbortController();
    this.controllers.set(request.taskId, controller);
    const params = request.params as Record<string, unknown>;
    try {
      if (!params.workflow || typeof params.workflow !== "object") {
        throw new ProviderAdapterError("FAILED", "params.workflow (ComfyUI API-format node graph) is required");
      }
      request.onProgress?.({ stage: "preparing" });
      const promptId = await this.submitPrompt(params.workflow as Record<string, unknown>, request.taskId, controller);
      request.onProgress?.({ stage: "generating" });
      const entry = await this.pollHistory(promptId, controller);
      const images = await this.fetchImages(entry, controller);
      request.onProgress?.({ stage: "saving" });
      return { ok: true, output: { images, promptId } };
    } catch (err) {
      if (controller.signal.aborted) {
        return { ok: false, code: "INTERRUPTED", message: "Interrupted" };
      }
      if (err instanceof ProviderAdapterError) {
        return { ok: false, code: err.code, message: err.message };
      }
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        return { ok: false, code: "TIMEOUT", message: err.message };
      }
      const message = err instanceof Error ? err.message : String(err);
      const unreachable = /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message);
      return { ok: false, code: unreachable ? "UNAVAILABLE" : "FAILED", message };
    } finally {
      this.controllers.delete(request.taskId);
    }
  }

  private async submitPrompt(
    workflow: Record<string, unknown>,
    clientId: string,
    controller: AbortController
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    if (!response.ok) {
      throw new ProviderAdapterError("FAILED", `ComfyUI prompt submission failed: ${response.status}`);
    }
    const body = (await response.json()) as {
      prompt_id?: string;
      node_errors?: Record<string, unknown>;
    };
    if (body.node_errors && Object.keys(body.node_errors).length > 0) {
      throw new ProviderAdapterError(
        "FAILED",
        `ComfyUI node errors: ${Object.keys(body.node_errors).join(", ")}`
      );
    }
    if (!body.prompt_id) {
      throw new ProviderAdapterError("FAILED", "ComfyUI returned no prompt_id");
    }
    return body.prompt_id;
  }

  private async pollHistory(promptId: string, controller: AbortController): Promise<HistoryEntry> {
    const deadline = Date.now() + COMFYUI_DEFAULT_TIMEOUT_MS;
    for (;;) {
      if (controller.signal.aborted) {
        throw new ProviderAdapterError("INTERRUPTED", "Interrupted");
      }
      if (Date.now() > deadline) {
        throw new ProviderAdapterError("TIMEOUT", `ComfyUI history timed out: ${promptId}`);
      }
      const response = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ProviderAdapterError("FAILED", `ComfyUI history failed: ${response.status}`);
      }
      const body = (await response.json()) as Record<string, HistoryEntry>;
      const entry = body[promptId];
      if (entry && entry.status?.completed === true) return entry;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  private async fetchImages(entry: HistoryEntry, controller: AbortController): Promise<string[]> {
    const images: string[] = [];
    for (const node of Object.values(entry.outputs ?? {})) {
      for (const image of node.images ?? []) {
        const query = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder,
          type: image.type,
        });
        const response = await fetch(`${this.baseUrl}/view?${query.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new ProviderAdapterError("FAILED", `ComfyUI view fetch failed: ${response.status}`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        images.push(Buffer.from(bytes).toString("base64"));
      }
    }
    return images;
  }
}

export function createComfyUiAdapter(config: ComfyUiConfig = {}): ProviderAdapter {
  return new ComfyUiAdapter(config);
}
