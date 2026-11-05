// PanelForge — bounded, explicit retries (S2.6).
//
// Retries re-execute a single failed task under a caller-chosen policy:
//
//   retryTask(store, queue, taskId, { maxAttempts, backoffMs })
//
// - Only failed tasks may be retried (anything else is INVALID_STATE).
// - Bounded: at most maxAttempts executions; a permanently failing task
//   stays failed without looping forever (no auto-retry storms).
// - Exponential backoff between attempts (backoffMs × 2^(n-1)).
// - Sibling isolation is structural: only this task's record is re-queued
//   and re-run; every other record is untouched (§11.4 — a failed task
//   never destroys completed sibling outputs).
//
// attemptsMade is reported on the result for diagnostics.

import type { TaskStore, TaskRecord } from "./store";
import { transitionTask } from "./transitions";

export type RetryPolicy = {
  /** Total execution attempts allowed per retry invocation (>= 1). */
  maxAttempts: number;
  /** Base delay in ms; grows exponentially between attempts. */
  backoffMs: number;
};

export type RetryErrorCode = "INVALID_STATE" | "NOT_FOUND" | "INVALID_POLICY";

export class RetryError extends Error {
  code: RetryErrorCode;
  constructor(code: RetryErrorCode, message: string) {
    super(message);
    this.name = "RetryError";
    this.code = code;
  }
}

export type RetryOutcome = {
  taskId: string;
  attemptsMade: number;
  state: string;
};

type RetryQueue = {
  runTask: (taskId: string) => Promise<{ taskId: string; state: string }>;
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function retryTaskWithPolicy(
  store: TaskStore,
  queue: RetryQueue,
  taskId: string,
  policy: RetryPolicy = { maxAttempts: 3, backoffMs: 50 }
): Promise<RetryOutcome> {
  if (!policy || !Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RetryError("INVALID_POLICY", "maxAttempts must be a positive integer");
  }
  if (typeof policy.backoffMs !== "number" || !(policy.backoffMs >= 0)) {
    throw new RetryError("INVALID_POLICY", "backoffMs must be a non-negative number");
  }
  const record: TaskRecord | null = await store.getTask(taskId);
  if (!record) throw new RetryError("NOT_FOUND", `No task with id: ${taskId}`);
  if (record.state !== "failed") {
    throw new RetryError("INVALID_STATE", `Only failed tasks can be retried (current: ${record.state})`);
  }
  let attemptsMade = 0;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (attempt > 1) await delay(policy.backoffMs * 2 ** (attempt - 2));
    const current = (await store.getTask(taskId)) as TaskRecord;
    if (current.state === "failed") {
      // Re-queue through the guarded path (failed → queued is legal).
      await transitionTask(store, taskId, "queued");
    }
    const result = await queue.runTask(taskId);
    attemptsMade = attempt;
    if (result.state === "complete") break;
    if (result.state !== "failed") break;
  }
  const after = (await store.getTask(taskId)) as TaskRecord;
  return { taskId, attemptsMade, state: after.state };
}
