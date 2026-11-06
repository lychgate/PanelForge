// PanelForge — resource profiles (S2.13, spec §10.2).
//
// Conservative, user-visible resource policy over the task queue:
//
// - Safe: one task at a time, smaller generation sizes, conservative
//   memory behavior, sequential model loading, optional cooling
//   intervals (default 3000 ms between batches).
// - Balanced: sequential generation by default (one at a time),
//   reasonable memory behavior, no inserted cooling delay.
// - Performance: more aggressive use (parallel batches up to the
//   profile concurrency), higher generation-size ceiling. Higher
//   concurrency is only where hardware supports it — hardware gating
//   arrives with detection/telemetry (S2.14–S2.16); this task keeps
//   the cap conservative and the policy explicit.
// - Custom: caller-supplied limits (validations below); any omitted
//   field falls back to Balanced.
//
// Enforcement (this module) — policy lands here, inputs there:
// - createProfileQueue wraps a queue + store: `runUntilIdle` executes
//   up to `queueConcurrency` tasks per batch (Promise.all), stalls
//   oversized tasks to `waiting-for-resources` instead of executing
//   them (memory behavior), and inserts `coolingIntervalMs` between
//   batches.
// - enqueue stamps `params.resourceProfile` so the S2.7 progress view
//   shows which policy a task ran under.
//
// Bounds that must never be crossed (spec §10.2): the application must
// not overclock hardware or make unsafe fan-control assumptions — this
// module never touches clocks, fans, or power limits; cooling intervals
// are the only thermal knob it exposes, always user-configured.

import { transitionTask } from "./transitions";
import type { TaskQueue } from "./queue";
import type { TaskStore, TaskRecord } from "./store";

export type ResourceProfileName = "safe" | "balanced" | "performance" | "custom";

export type ResourceMemoryBehavior = "conservative" | "reasonable" | "aggressive";

export type ResourceProfile = {
  name: ResourceProfileName;
  /** Max tasks executed in parallel per batch (1 = one at a time). */
  queueConcurrency: number;
  /** Largest generation size this profile will dispatch. */
  maxGenerationSize: { width: number; height: number };
  memoryBehavior: ResourceMemoryBehavior;
  /** Pause inserted between batches; 0 disables. */
  coolingIntervalMs: number;
  /** When true, models load one at a time (never two in flight). */
  sequentialModelLoading: boolean;
};

export type ResourceErrorCode = "UNKNOWN_PROFILE" | "INVALID_LIMITS";

export class ResourceError extends Error {
  code: ResourceErrorCode;
  constructor(code: ResourceErrorCode, message: string) {
    super(message);
    this.name = "ResourceError";
    this.code = code;
  }
}

const PROFILE_NAMES: readonly ResourceProfileName[] = ["safe", "balanced", "performance", "custom"];

export function isResourceProfileName(value: unknown): value is ResourceProfileName {
  return typeof value === "string" && (PROFILE_NAMES as readonly string[]).includes(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export const RESOURCE_PROFILES: Readonly<Record<ResourceProfileName, ResourceProfile>> = deepFreeze({
  safe: {
    name: "safe",
    queueConcurrency: 1,
    maxGenerationSize: { width: 1024, height: 1024 },
    memoryBehavior: "conservative",
    coolingIntervalMs: 3000,
    sequentialModelLoading: true,
  },
  balanced: {
    name: "balanced",
    queueConcurrency: 1,
    maxGenerationSize: { width: 2048, height: 2048 },
    memoryBehavior: "reasonable",
    coolingIntervalMs: 0,
    sequentialModelLoading: true,
  },
  performance: {
    name: "performance",
    queueConcurrency: 2,
    maxGenerationSize: { width: 4096, height: 4096 },
    memoryBehavior: "aggressive",
    coolingIntervalMs: 0,
    sequentialModelLoading: false,
  },
  custom: {
    name: "custom",
    queueConcurrency: 1,
    maxGenerationSize: { width: 2048, height: 2048 },
    memoryBehavior: "reasonable",
    coolingIntervalMs: 0,
    sequentialModelLoading: true,
  },
} satisfies Record<ResourceProfileName, ResourceProfile>);

export function listResourceProfiles(): ResourceProfileName[] {
  return [...PROFILE_NAMES];
}

/** Bounds for caller-supplied Custom limits (never unbounded, never unsafe). */
export const CUSTOM_LIMITS = {
  maxQueueConcurrency: 4,
  maxGenerationDimension: 8192,
  maxCoolingIntervalMs: 60000,
} as const;

export type CustomProfileOverrides = Partial<Omit<ResourceProfile, "name">>;

/**
 * Resolve a profile by name, applying overrides (presets honor partial
 * overrides too, merged onto the preset; Custom falls back to Balanced
 * for omitted fields). Unknown names throw UNKNOWN_PROFILE; out-of-range
 * limits throw INVALID_LIMITS. Pure policy — no hardware detection here (S2.14+).
 */
export function resolveResourceProfile(
  name: ResourceProfileName,
  custom: CustomProfileOverrides = {}
): ResourceProfile {
  if (!isResourceProfileName(name)) {
    throw new ResourceError("UNKNOWN_PROFILE", `Unknown resource profile: ${String(name)}`);
  }
  const base = RESOURCE_PROFILES[name];
  if (name !== "custom" && Object.keys(custom).length === 0) {
    return { ...base, maxGenerationSize: { ...base.maxGenerationSize } };
  }
  const fallback = name === "custom" ? RESOURCE_PROFILES.balanced : base;
  const concurrency = custom.queueConcurrency ?? fallback.queueConcurrency;
  const width = custom.maxGenerationSize?.width ?? base.maxGenerationSize.width;
  const height = custom.maxGenerationSize?.height ?? base.maxGenerationSize.height;
  const cooling = custom.coolingIntervalMs ?? fallback.coolingIntervalMs;
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > CUSTOM_LIMITS.maxQueueConcurrency
  ) {
    throw new ResourceError(
      "INVALID_LIMITS",
      `Custom queueConcurrency must be an integer in 1..${CUSTOM_LIMITS.maxQueueConcurrency}`
    );
  }
  for (const dim of [width, height]) {
    if (!Number.isInteger(dim) || dim < 1 || dim > CUSTOM_LIMITS.maxGenerationDimension) {
      throw new ResourceError(
        "INVALID_LIMITS",
        `Custom generation size dimensions must be integers in 1..${CUSTOM_LIMITS.maxGenerationDimension}`
      );
    }
  }
  if (typeof cooling !== "number" || !Number.isFinite(cooling) || cooling < 0 || cooling > CUSTOM_LIMITS.maxCoolingIntervalMs) {
    throw new ResourceError("INVALID_LIMITS", `Custom coolingIntervalMs must be in 0..${CUSTOM_LIMITS.maxCoolingIntervalMs}`);
  }
  return {
    name,
    queueConcurrency: concurrency,
    maxGenerationSize: { width, height },
    memoryBehavior: custom.memoryBehavior ?? fallback.memoryBehavior,
    coolingIntervalMs: cooling,
    sequentialModelLoading: custom.sequentialModelLoading ?? fallback.sequentialModelLoading,
  };
}

/** True when a task requests a generation size larger than the profile allows. */
export function isOversizedForProfile(params: Record<string, unknown>, profile: ResourceProfile): boolean {
  const { width, height } = profile.maxGenerationSize;
  const w =
    typeof params.width === "number" ? params.width : (params.size as { width?: unknown } | undefined)?.width;
  const h =
    typeof params.height === "number" ? params.height : (params.size as { height?: unknown } | undefined)?.height;
  if (typeof w === "number" && w > width) return true;
  if (typeof h === "number" && h > height) return true;
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type ProfileTaskQueue = TaskQueue;

/**
 * Wrap a queue so the profile's limits actually constrain execution:
 * concurrency per batch, memory parking, cooling pauses. `runTask`
 * and `runNext` enforce the memory gate only (single dispatch).
 */
export function createProfileQueue(
  queue: TaskQueue,
  store: TaskStore,
  profile: ResourceProfile
): ProfileTaskQueue {
  async function parkIfOversized(taskId: string): Promise<boolean> {
    const task = await store.getTask(taskId);
    if (!task) return false;
    if (isOversizedForProfile(task.params, profile)) {
      // Park rather than dispatch: the task waits for resources instead
      // of failing the queue or blowing the memory budget (§11.1).
      await transitionTask(store, taskId, "waiting-for-resources");
      return true;
    }
    return false;
  }

  async function runOneById(taskId: string): Promise<{ taskId: string; state: string }> {
    const task = await store.getTask(taskId);
    if (!task) throw new Error(`No task with id: ${taskId}`);
    if (task.state === "queued" && (await parkIfOversized(taskId))) {
      return { taskId, state: "waiting-for-resources" };
    }
    return queue.runTask(taskId);
  }

  async function runNextSingle(): Promise<{ taskId: string; state: string } | null> {
    const queued = (await store.listTasks()).filter((t) => t.state === "queued");
    if (queued.length === 0) return null;
    return runOneById(queued[0].taskId);
  }

  async function runUntilIdleProfile(): Promise<{ taskId: string; state: string }[]> {
    const done: { taskId: string; state: string }[] = [];
    let firstBatch = true;
    for (;;) {
      const queued = (await store.listTasks()).filter((t) => t.state === "queued");
      if (queued.length === 0) break;
      if (!firstBatch && profile.coolingIntervalMs > 0) {
        await delay(profile.coolingIntervalMs);
      }
      firstBatch = false;
      const batch = queued.slice(0, profile.queueConcurrency);
      const results = await Promise.all(batch.map((t) => runOneById(t.taskId)));
      done.push(...results);
    }
    return done;
  }

  return {
    enqueue: (taskType, params = {}, projectId = null) =>
      queue.enqueue(taskType, { ...params, resourceProfile: profile.name }, projectId),
    runNext: runNextSingle,
    runTask: runOneById,
    runUntilIdle: runUntilIdleProfile,
    pauseTask: (taskId) => queue.pauseTask(taskId),
    cancelTask: (taskId) => queue.cancelTask(taskId),
    resumeTask: (taskId) => queue.resumeTask(taskId),
    resumeInterrupted: () => queue.resumeInterrupted(),
  };
}


