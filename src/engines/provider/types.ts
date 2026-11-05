// PanelForge — provider adapter contract (S2.1).
//
// The interface every AI provider adapter (LM Studio, ComfyUI, mocks, ...)
// implements. It is deliberately free of renderer/UI/Electron and network
// dependencies: adapters are pure client logic over an injected
// provider-specific transport, so the task queue (S2.3) can dispatch
// against this contract alone and adapters unit-test without the app.
//
// Contract summary:
// - execute(request): runs one task; reports progress via onProgress;
//   resolves with a result (success carries opaque output; failure
//   carries a ProviderErrorCode — never a stack).
// - interrupt(taskId): best-effort stop for a running task. A task that
//   was interrupted reports INTERRUPTED, never success.
// - health(): readiness without executing work.
//
// Progress honesty (spec §11.1/§2.6): adapters MUST NOT invent
// percentages. `percent` is only present when the provider reports a
// measurable value (finite, 0-100); otherwise the queue shows an
// indeterminate indicator. Validators below enforce this shape.

export type ProviderId = "lmstudio" | "comfyui" | "mock";

export type TaskType = "text" | "image";

export type ProviderStage =
  | "preparing"
  | "loading-model"
  | "generating"
  | "post-processing"
  | "saving"
  | "complete";

export type ProviderProgress = {
  stage: ProviderStage;
  /** Measured completion when the provider reports it; never invented. */
  percent?: number;
  message?: string;
};

export type ProviderTaskRequest = {
  taskId: string;
  taskType: TaskType;
  params: Record<string, unknown>;
  onProgress?: (progress: ProviderProgress) => void;
};

export type ProviderErrorCode =
  | "UNAVAILABLE"
  | "UNSUPPORTED"
  | "BUSY"
  | "TIMEOUT"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED";

export type ProviderResult =
  | { ok: true; output: unknown }
  | { ok: false; code: ProviderErrorCode; message: string };

export type ProviderHealthStatus = "ready" | "unavailable" | "unknown";

export type ProviderHealth = {
  status: ProviderHealthStatus;
  detail?: string;
  checkedAt: string;
};

export class ProviderAdapterError extends Error {
  code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ProviderAdapterError";
    this.code = code;
  }
}

export type ProviderAdapter = {
  readonly id: ProviderId;
  readonly displayName: string;
  execute: (request: ProviderTaskRequest) => Promise<ProviderResult>;
  interrupt: (taskId: string) => void;
  health: () => Promise<ProviderHealth>;
};

const STAGES: readonly ProviderStage[] = [
  "preparing",
  "loading-model",
  "generating",
  "post-processing",
  "saving",
  "complete",
];

const TASK_TYPES: readonly TaskType[] = ["text", "image"];
const HEALTH_STATUSES: readonly ProviderHealthStatus[] = ["ready", "unavailable", "unknown"];

/** True when the value is a structurally valid provider progress event. */
export function isProviderProgress(value: unknown): value is ProviderProgress {
  if (value === null || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (!STAGES.includes(p.stage as ProviderStage)) return false;
  if (p.percent !== undefined) {
    if (typeof p.percent !== "number" || !Number.isFinite(p.percent)) return false;
    if (p.percent < 0 || p.percent > 100) return false;
  }
  if (p.message !== undefined && typeof p.message !== "string") return false;
  return true;
}

/** True when the value is a structurally valid provider health report. */
export function isProviderHealth(value: unknown): value is ProviderHealth {
  if (value === null || typeof value !== "object") return false;
  const h = value as Record<string, unknown>;
  if (!HEALTH_STATUSES.includes(h.status as ProviderHealthStatus)) return false;
  return typeof h.checkedAt === "string";
}

/** True when the value is a structurally valid provider result. */
export function isProviderResult(value: unknown): value is ProviderResult {
  if (value === null || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.ok !== "boolean") return false;
  if (r.ok) return "output" in r;
  return typeof r.code === "string" && typeof r.message === "string";
}

export function listTaskTypes(): TaskType[] {
  return [...TASK_TYPES];
}
