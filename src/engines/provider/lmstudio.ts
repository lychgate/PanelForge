// PanelForge — LM Studio connection adapter (S2.9).
//
// Implements the S2.1 provider contract against LM Studio's
// OpenAI-compatible HTTP API (no new dependencies — Node's built-in
// fetch):
//
// - GET  {base}/v1/models           → health (readiness + model listing)
// - POST {base}/v1/chat/completions → streaming completion (SSE)
//
// Presence is optional by design (§6.6): an unreachable provider reports
// UNAVAILABLE results/health and never throws across the boundary, so
// provider absence cannot block project use. Progress is honest —
// tokens stream through indeterminate `generating` stages; the total
// is never known ahead, so `percent` is never fabricated.
//
// Request params: { model?, messages? [{role, content}], prompt?,
// system? }. When `model` is omitted the current model from the health
// probe is reused (and never guessed beyond what the endpoint reports).

import {
  ProviderAdapterError,
  type ProviderAdapter,
  type ProviderHealth,
  type ProviderResult,
  type ProviderTaskRequest,
} from "./types";

export const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234";
export const LMSTUDIO_DEFAULT_TIMEOUT_MS = 30000;

export type LmStudioConfig = {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
};

export class LmStudioAdapter implements ProviderAdapter {
  readonly id = "lmstudio" as const;
  readonly displayName = "LM Studio";
  private readonly baseUrl: string;
  private readonly configuredModel: string | undefined;
  private readonly timeoutMs: number;
  private readonly controllers = new Map<string, AbortController>();
  private cachedModel: string | null = null;

  constructor(config: LmStudioConfig = {}) {
    const envUrl = process.env.PANELFORGE_LMSTUDIO_URL;
    this.baseUrl = (config.baseUrl ?? envUrl ?? LMSTUDIO_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.configuredModel = config.model;
    this.timeoutMs = config.timeoutMs ?? LMSTUDIO_DEFAULT_TIMEOUT_MS;
  }

  /** Signal a running task; its fetch aborts (best-effort). */
  interrupt(taskId: string): void {
    this.controllers.get(taskId)?.abort();
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const models = await this.fetchModels();
      if (models.length > 0) this.cachedModel = models[0];
      return {
        status: models.length > 0 ? "ready" : "unavailable",
        detail: models.length > 0 ? undefined : "no models reported",
        checkedAt,
      };
    } catch (err) {
      return {
        status: "unavailable",
        detail: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
    }
  }

  private async fetchModels(signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/v1/models`, {
      signal: signal ?? AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new ProviderAdapterError("FAILED", `LM Studio models request failed: ${response.status}`);
    }
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    return (body.data ?? []).map((m) => m.id ?? "").filter((id) => id.length > 0);
  }

  private async resolveModel(controller: AbortController): Promise<string> {
    if (this.configuredModel) return this.configuredModel;
    if (this.cachedModel) return this.cachedModel;
    const models = await this.fetchModels(controller.signal);
    if (models.length === 0) throw new ProviderAdapterError("UNAVAILABLE", "LM Studio reports no models");
    this.cachedModel = models[0];
    return models[0];
  }

  private toMessages(request: ProviderTaskRequest): Array<{ role: string; content: string }> {
    const params = request.params as Record<string, unknown>;
    if (Array.isArray(params.messages)) {
      return (params.messages as Array<{ role: string; content: string }>).map((m) => ({
        role: String(m.role ?? "user"),
        content: String(m.content ?? ""),
      }));
    }
    const messages: Array<{ role: string; content: string }> = [];
    if (typeof params.system === "string" && params.system.length > 0) {
      messages.push({ role: "system", content: params.system });
    }
    messages.push({ role: "user", content: String(params.prompt ?? "") });
    return messages;
  }

  async execute(request: ProviderTaskRequest): Promise<ProviderResult> {
    const controller = new AbortController();
    this.controllers.set(request.taskId, controller);
    const startedAt = Date.now();
    try {
      request.onProgress?.({ stage: "preparing" });
      const model = await this.resolveModel(controller);
      request.onProgress?.({ stage: "loading-model" });
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: this.toMessages(request),
          stream: true,
          stream_options: { include_usage: true },
        }),
      });
      if (!response.ok) {
        const status = response.status;
        throw new ProviderAdapterError(
          status === 404 ? "UNSUPPORTED" : status >= 500 ? "FAILED" : "FAILED",
          `LM Studio completion failed: ${status}`
        );
      }
      const reader = response.body?.getReader();
      const content = await this.readStream(reader, request, controller);
      request.onProgress?.({ stage: "saving" });
      return {
        ok: true,
        output: { content, model, elapsedMs: Date.now() - startedAt },
      };
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
      return {
        ok: false,
        code: unreachable ? "UNAVAILABLE" : "FAILED",
        message,
      };
    } finally {
      this.controllers.delete(request.taskId);
    }
  }

  private async readStream(
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
    request: ProviderTaskRequest,
    _controller: AbortController
  ): Promise<string> {
    if (!reader) throw new ProviderAdapterError("FAILED", "LM Studio returned no body");
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      let generated = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: { choices?: Array<{ delta?: { content?: string } }> };
        try {
          chunk = JSON.parse(data) as typeof chunk;
        } catch {
          continue;
        }
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          content += delta;
          if (!generated) {
            generated = true;
            request.onProgress?.({ stage: "generating" });
          }
        }
      }
    }
    return content;
  }
}

export function createLmStudioAdapter(config: LmStudioConfig = {}): ProviderAdapter {
  return new LmStudioAdapter(config);
}
