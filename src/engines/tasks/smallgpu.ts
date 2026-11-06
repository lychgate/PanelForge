// PanelForge — small GPU mode (S2.18, spec §10.3).
//
// First-class low-VRAM operation targeting GTX 1660 Ti-class hardware
// (practical compatibility — not a guarantee for every model/workflow):
//
// - One panel/task at a time (concurrency 1).
// - Sequential model loading (never two models in flight).
// - Lower-resolution drafts (1024×1024 ceiling, enforced by the
//   S2.13 memory gate — oversized work parks, never dispatches).
// - Optional upscaling/tiling remains per-backend executor behavior;
//   this module only constrains the envelope.
// - Releasing resources: `createSmallGpuQueue` invokes `releaseHook`
//   after every execution so providers can unload models (default
//   no-op; each backend decides what releasing means for it).
// - CPU fallback + lower-resource retries after OOM: a FAILED result
//   matching OOM downsizes the task (halve resolution, min 256×256)
//   and retries with `resourceMode: "cpu-fallback"` on params.
//
// Approved art is never silently replaced: a task whose params carry
// `approvedImageId` is never downgraded or retried — the OOM retry
// refuses fail-closed instead. Every other param is preserved verbatim.

import { createProfileQueue, resolveResourceProfile, type ResourceProfile } from "./resources";
import type { TaskQueue } from "./queue";
import type { TaskStore } from "./store";

export const SMALL_GPU_TARGET = "GTX 1660 Ti-class (practical compatibility target, not a guarantee)";

export type SmallGpuProfile = ResourceProfile & {
  /** Providers call `releaseHook` after each execution to unload models. */
  releaseAfterEachTask: true;
};

/** Small-GPU envelope over the S2.13 policy (conservative, sequential, 1024 cap). */
export function resolveSmallGpuProfile(): SmallGpuProfile {
  const base = resolveResourceProfile("safe");
  return {
    ...base,
    name: "safe",
    queueConcurrency: 1,
    maxGenerationSize: { width: 1024, height: 1024 },
    memoryBehavior: "conservative",
    coolingIntervalMs: 3000,
    sequentialModelLoading: true,
    releaseAfterEachTask: true,
  };
}

export type SmallGpuQueue = TaskQueue & {
  profile: SmallGpuProfile;
};

/**
 * Profile queue pinned to the small-GPU envelope, releasing after
 * each execution via `releaseHook` (defaults to no-op).
 */
export function createSmallGpuQueue(
  queue: TaskQueue,
  store: TaskStore,
  releaseHook: () => void = () => {}
): SmallGpuQueue {
  const profile = resolveSmallGpuProfile();
  const profileQueue = createProfileQueue(queue, store, profile);
  async function releaseAfter<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } finally {
      try {
        releaseHook();
      } catch {
        // Releasing is best-effort; it never fails the task.
      }
    }
  }
  return {
    ...profileQueue,
    profile,
    runNext: () => releaseAfter(() => profileQueue.runNext()),
    runTask: (taskId) => releaseAfter(() => profileQueue.runTask(taskId)),
    runUntilIdle: () => releaseAfter(() => profileQueue.runUntilIdle()),
  };
}

// ---- Lower-resource OOM retry ----

export const OOM_MIN_DIMENSION = 256;
export const RESOURCE_MODE_CPU_FALLBACK = "cpu-fallback";

export function isOomMessage(message: string): boolean {
  return /out of memory|oom|cuda.*memory|memory.*exceeded/i.test(message);
}

export type OomRetryOutcome = {
  taskId: string;
  retried: boolean;
  reason: string;
  width: number | null;
  height: number | null;
};

function halve(value: number, min: number): number {
  return Math.max(min, Math.floor(value / 2));
}

/**
 * After an OOM failure, downsize the task and re-execute once in
 * cpu-fallback mode. Refuses (retried: false) when the task is not
 * failed, carries an approved image, or is already at minimum size.
 * Never overwrites params other than width/height/resourceMode.
 */
export async function retryOomWithLowerResources(
  store: TaskStore,
  queue: TaskQueue,
  taskId: string
): Promise<OomRetryOutcome> {
  const record = await store.getTask(taskId);
  if (!record) return { taskId, retried: false, reason: "not-found", width: null, height: null };
  if (record.state !== "failed") {
    return { taskId, retried: false, reason: `not-failed:${record.state}`, width: null, height: null };
  }
  if (typeof record.params.approvedImageId === "string" && record.params.approvedImageId !== "") {
    return { taskId, retried: false, reason: "approved-image-never-replaced", width: null, height: null };
  }
  const width = typeof record.params.width === "number" ? record.params.width : null;
  const height = typeof record.params.height === "number" ? record.params.height : null;
  if (width === null || height === null) {
    return { taskId, retried: false, reason: "no-sized-params", width: null, height: null };
  }
  if (width <= OOM_MIN_DIMENSION && height <= OOM_MIN_DIMENSION) {
    return { taskId, retried: false, reason: "already-minimum", width, height };
  }
  const newWidth = halve(width, OOM_MIN_DIMENSION);
  const newHeight = halve(height, OOM_MIN_DIMENSION);
  // Params are immutable through the store API; a fresh record carries
  // the downsized request. The original stays failed (nothing is
  // overwritten in place; history is preserved).
  const retry = await store.createTask({
    taskType: record.taskType,
    params: { ...record.params, width: newWidth, height: newHeight, resourceMode: RESOURCE_MODE_CPU_FALLBACK, retriedFrom: taskId },
    projectId: record.projectId,
  });
  await queue.runTask(retry.taskId);
  return { taskId: retry.taskId, retried: true, reason: "oom-downsized", width: newWidth, height: newHeight };
}
