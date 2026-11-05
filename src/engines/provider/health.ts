// PanelForge — provider health checks (S2.11).
//
// Knows whether a provider is usable before dispatching work to it:
//
// - checkProviderHealth(adapter, opts?) probes one adapter: it validates
//   the adapter's own health report (shape, S2.1), then optionally
//   verifies expected models are present. Unreachable providers report
//   `unavailable`; malformed reports degrade to `unknown` — never a
//   fabricated `ready`.
// - HealthMonitor runs probes for a registry of adapters and caches each
//   report with its timestamp.
// - createGatedExecutor wraps an adapter so the queue never dispatches
//   to unhealthy providers: it returns a typed UNAVAILABLE result
//   without executing anything.

import {
  isProviderHealth,
  type ProviderAdapter,
  type ProviderHealth,
  type ProviderResult,
  type ProviderTaskRequest,
} from "./types";
import type { TaskExecutor } from "../tasks/queue";

export type ProviderHealthReport = ProviderHealth & {
  // Loose on purpose: future providers can join without widening the S2.1 union.
  providerId: string;
};

export type HealthErrorCode = "UNHEALTHY";

export class HealthError extends Error {
  code: HealthErrorCode;
  constructor(message: string) {
    super(message);
    this.name = "HealthError";
    this.code = "UNHEALTHY";
  }
}

/** Probe one adapter (with optional expected-model verification). */
export async function checkProviderHealth(
  adapter: ProviderAdapter,
  opts: { expectedModels?: string[] } = {}
): Promise<ProviderHealthReport> {
  let raw: ProviderHealth;
  try {
    raw = await adapter.health();
  } catch (err) {
    return {
      providerId: adapter.id,
      status: "unavailable",
      detail: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    };
  }
  const checkedAt = raw?.checkedAt && typeof raw.checkedAt === "string" ? raw.checkedAt : new Date().toISOString();
  if (!isProviderHealth(raw)) {
    return {
      providerId: adapter.id,
      status: "unknown",
      detail: "malformed health report from adapter",
      checkedAt,
    };
  }
  if (raw.status !== "ready") {
    return { providerId: adapter.id, ...raw, checkedAt };
  }
  if (opts.expectedModels && opts.expectedModels.length > 0) {
    const models = await listAdapterModels(adapter).catch(() => null);
    if (models && models.length > 0) {
      const missing = opts.expectedModels.filter((m) => !models.includes(m));
      if (missing.length > 0) {
        return {
          providerId: adapter.id,
          status: "unavailable",
          detail: `missing models: ${missing.join(", ")}`,
          checkedAt,
        };
      }
    }
    // When the adapter exposes no model list, treat as ready (models are
    // per-executor call parameters, not a readiness gate).
  }
  return { providerId: adapter.id, ...raw, checkedAt };
}

/** Model listing, when the adapter exposes one (otherwise empty). */
export async function listAdapterModels(adapter: ProviderAdapter): Promise<string[]> {
  const candidate = adapter as unknown as { models?: () => Promise<string[]> };
  if (typeof candidate.models === "function") {
    return candidate.models();
  }
  return [];
}

export type HealthMonitor = {
  register: (adapter: ProviderAdapter) => void;
  checkAll: (opts?: { expectedModels?: string[] }) => Promise<ProviderHealthReport[]>;
  report: (providerId: string) => ProviderHealthReport | null;
  listReports: () => ProviderHealthReport[];
  isReady: (providerId: string) => boolean;
  requireReady: (providerId: string) => ProviderHealthReport;
};

export function createHealthMonitor(): HealthMonitor {
  const adapters = new Map<string, ProviderAdapter>();
  const cache = new Map<string, ProviderHealthReport>();

  function register(adapter: ProviderAdapter): void {
    adapters.set(adapter.id, adapter);
  }

  async function checkAll(opts: { expectedModels?: string[] } = {}): Promise<ProviderHealthReport[]> {
    const entries: [string, Promise<ProviderHealthReport>][] = [];
    for (const [id, adapter] of adapters) {
      entries.push([id, checkProviderHealth(adapter, opts)]);
    }
    const reports: ProviderHealthReport[] = [];
    for (const [, pending] of entries) {
      const report = await pending;
      reports.push(report);
      cache.set(report.providerId, report);
    }
    return reports;
  }

  function report(providerId: string): ProviderHealthReport | null {
    return cache.get(providerId) ?? null;
  }

  function listReports(): ProviderHealthReport[] {
    return [...cache.values()];
  }

  function isReady(providerId: string): boolean {
    return cache.get(providerId)?.status === "ready";
  }

  function requireReady(providerId: string): ProviderHealthReport {
    const current = report(providerId);
    if (!current || current.status !== "ready") {
      throw new HealthError(
        `Provider is not ready: ${providerId}${current ? ` (${current.status}${current.detail ? `: ${current.detail}` : ""})` : " (unchecked)"}`
      );
    }
    return current;
  }

  return { register, checkAll, report, listReports, isReady, requireReady };
}

/**
 * Gate an adapter as a queue executor: unhealthy providers fail fast
 * with a typed UNAVAILABLE result and never execute.
 */
export function createGatedExecutor(adapter: ProviderAdapter, monitor: HealthMonitor): TaskExecutor {
  return async (request: ProviderTaskRequest): Promise<ProviderResult> => {
    if (!monitor.isReady(adapter.id)) {
      const current = monitor.report(adapter.id);
      return {
        ok: false,
        code: "UNAVAILABLE",
        message: `Provider is not ready: ${adapter.displayName}${current?.detail ? ` (${current.detail})` : ""}`,
      };
    }
    return adapter.execute(request);
  };
}
