// PanelForge — scripted mock provider adapters (S2.12).
//
// Test doubles implementing the S2.1 contract with deterministic,
// scriptable behaviors, so the whole Stage-2 stage acceptance
// (create → persist → execute → interrupt → resume → recover) passes
// against mocks instead of real providers or the UI:
//
// - "success": immediate successful result.
// - "failure": always a typed FAILED result.
// - "slow": waits `delayMs` (default 30) between progress stages;
//   interrupt cancels the wait → INTERRUPTED.
// - "mixed": varied progress — emits each stage with a measured percent
//   per step (supplied by the test via `script`, so percent is never
//   invented here).
// - `failNext`: the first N executions fail (retry, S2.6).
// - `healthStatus`: health defaults to ready; set unavailable to gate.
//
// Mocks are test-support only and must never ship as production
// behavior — no production module imports this file.

import type {
  ProviderAdapter,
  ProviderHealth,
  ProviderId,
  ProviderProgress,
  ProviderResult,
  ProviderTaskRequest,
} from "./types";

export type MockBehavior = "success" | "failure" | "slow" | "mixed";

export type MockAdapterConfig = {
  id?: ProviderId;
  behavior?: MockBehavior;
  delayMs?: number;
  failNext?: number;
  healthStatus?: ProviderHealth["status"];
  /** Scripted progress events for "mixed" (measured percents only). */
  script?: ProviderProgress[];
  output?: unknown;
};

export type MockAdapter = ProviderAdapter & {
  getCalls: () => { execute: number; interrupt: number };
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createMockAdapter(config: MockAdapterConfig = {}): MockAdapter {
  const behavior = config.behavior ?? "success";
  const delayMs = config.delayMs ?? 30;
  let failuresLeft = config.failNext ?? 0;
  const calls = { execute: 0, interrupt: 0 };
  const pending = new Map<string, { cancelled: boolean }>();

  const adapter: MockAdapter = {
    id: (config.id ?? "mock") as ProviderId,
    displayName: config.id ? `Mock ${config.id}` : "Mock",
    execute: async (request: ProviderTaskRequest): Promise<ProviderResult> => {
      calls.execute++;
      if (failuresLeft > 0) {
        failuresLeft--;
        return { ok: false, code: "FAILED", message: "mock failure (failNext)" };
      }
      const state = { cancelled: false };
      pending.set(request.taskId, state);
      try {
        if (behavior === "failure") {
          return { ok: false, code: "FAILED", message: "mock always fails" };
        }
        if (behavior === "slow") {
          request.onProgress?.({ stage: "generating" });
          for (let i = 0; i < 5; i++) {
            for (let tick = 0; tick < Math.max(1, Math.ceil(delayMs / 10)); tick++) {
              await sleep(10);
              if (state.cancelled) {
                return { ok: false, code: "INTERRUPTED", message: "Interrupted" };
              }
            }
          }
          return { ok: true, output: config.output ?? null };
        }
        if (behavior === "mixed") {
          const script: ProviderProgress[] = config.script ?? [
            { stage: "preparing" },
            { stage: "generating", percent: 25 },
            { stage: "generating", percent: 50 },
            { stage: "generating", percent: 75 },
            { stage: "saving" },
          ];
          for (const step of script) {
            request.onProgress?.(step);
            if (state.cancelled) {
              return { ok: false, code: "INTERRUPTED", message: "Interrupted" };
            }
            await sleep(Math.min(delayMs, 5));
          }
          return { ok: true, output: config.output ?? null };
        }
        // success
        request.onProgress?.({ stage: "generating", percent: 100 });
        return { ok: true, output: config.output ?? null };
      } finally {
        pending.delete(request.taskId);
      }
    },
    interrupt: (taskId: string) => {
      calls.interrupt++;
      const state = pending.get(taskId);
      if (state) state.cancelled = true;
    },
    health: async (): Promise<ProviderHealth> => ({
      status: config.healthStatus ?? "ready",
      detail: config.healthStatus === "ready" ? undefined : "mock configured unavailable",
      checkedAt: new Date().toISOString(),
    }),
    getCalls: () => ({ execute: calls.execute, interrupt: calls.interrupt }),
  };
  return adapter;
}
