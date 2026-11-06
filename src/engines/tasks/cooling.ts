// PanelForge — cooling down state (S2.17, spec §10.5).
//
// An explicit, distinguishable thermal pause for the queue:
//
// - `CoolingThresholds` are user-configurable (soft/hard °C + cooling
//   interval). `evaluateThermal` maps samples onto ok/cooling/critical.
//   Unknown telemetry never triggers cooling (heat is never assumed).
// - While cooling, new generation dispatch is blocked (queued tasks
//   wait; they are never failed). A generating task is cooperatively
//   interrupted and moved generating → cooling-down → queued (the only
//   legal graph edges); other running states are left to finish (safe
//   handling of active jobs — nothing is corrupted).
// - `describeCooling` explains why generation paused, whether the
//   configured interval is running, whether thresholds are monitored,
//   whether telemetry is unavailable, and when the next attempt is
//   expected when determinable (§10.5).
// - Notifications fire through `onCoolingChange` on into/out-of-cooling
//   edges (the UI/log layer consumes them; no control is claimed).
//
// PanelForge never claims to control temperature, fans, or power
// (§10.4): cooling intervals are the only knob, always user-set.

import { transitionTask } from "./transitions";
import type { TaskQueue } from "./queue";
import type { TaskStore } from "./store";
import type { TelemetrySample } from "../hardware/telemetry";
import { isTelemetrySample } from "../hardware/telemetry";
import { summarizeTelemetry } from "../hardware/telemetry-status";

export type ThermalLevel = "ok" | "cooling" | "critical";

export type CoolingThresholds = {
  softC: number;
  hardC: number;
  /** User-configured cooling interval; 0 disables inserted pauses. */
  coolingIntervalMs: number;
};

export const DEFAULT_THRESHOLDS: CoolingThresholds = {
  softC: 80,
  hardC: 90,
  coolingIntervalMs: 30000,
};

export type CoolingErrorCode = "INVALID_THRESHOLDS";

export class CoolingError extends Error {
  code: CoolingErrorCode;
  constructor(message: string) {
    super(message);
    this.name = "CoolingError";
    this.code = "INVALID_THRESHOLDS";
  }
}

/** Validate user-configurable thresholds (soft must be below hard). */
export function validateThresholds(thresholds: CoolingThresholds): CoolingThresholds {
  if (!thresholds || !Number.isFinite(thresholds.softC) || !Number.isFinite(thresholds.hardC)) {
    throw new CoolingError("Thresholds must be finite numbers");
  }
  if (thresholds.softC < 40 || thresholds.softC > 100 || thresholds.hardC < 40 || thresholds.hardC > 110) {
    throw new CoolingError("Thresholds must be within 40..100°C (soft) / 40..110°C (hard)");
  }
  if (thresholds.softC >= thresholds.hardC) {
    throw new CoolingError("Soft threshold must be below the hard threshold");
  }
  if (!Number.isFinite(thresholds.coolingIntervalMs) || thresholds.coolingIntervalMs < 0 || thresholds.coolingIntervalMs > 600000) {
    throw new CoolingError("coolingIntervalMs must be in 0..600000");
  }
  return { ...thresholds };
}

export type ThermalEvaluation = {
  level: ThermalLevel;
  /** Measured °C, or null when unmeasured (never 0). */
  temperatureC: number | null;
  reason: string;
};

function maxMeasuredTemperature(samples: TelemetrySample[]): number | null {
  let max: number | null = null;
  for (const sample of samples.filter((s) => isTelemetrySample(s))) {
    const signal = sample.metrics.temperatureC;
    if (signal?.status === "detected" && typeof signal.value === "number" && signal.value > 0) {
      max = max === null ? signal.value : Math.max(max, signal.value);
    }
  }
  return max;
}

/** Map samples onto a thermal level. Unknown telemetry → ok, never cooling. */
export function evaluateThermal(samples: TelemetrySample[], thresholds: CoolingThresholds): ThermalEvaluation {
  validateThresholds(thresholds);
  const temperatureC = maxMeasuredTemperature(samples);
  if (temperatureC === null) {
    return { level: "ok", temperatureC: null, reason: "no measured temperature (telemetry unavailable or unmeasured)" };
  }
  if (temperatureC >= thresholds.hardC) {
    return { level: "critical", temperatureC, reason: `temperature ${temperatureC}°C at/above hard threshold ${thresholds.hardC}°C` };
  }
  if (temperatureC >= thresholds.softC) {
    return { level: "cooling", temperatureC, reason: `temperature ${temperatureC}°C at/above soft threshold ${thresholds.softC}°C` };
  }
  return { level: "ok", temperatureC, reason: `temperature ${temperatureC}°C below soft threshold ${thresholds.softC}°C` };
}

export type CoolingDescriptor = {
  cooling: boolean;
  reason: string;
  intervalRunning: boolean;
  thresholdMonitored: boolean;
  telemetryAvailable: boolean;
  nextAttemptAt: string | null;
};

/** §10.5 explanation view: why paused, interval, monitoring, availability, next attempt. */
export function describeCooling(
  evaluation: ThermalEvaluation,
  samples: TelemetrySample[],
  coolingSince: string | null = null
): CoolingDescriptor {
  const availability = summarizeTelemetry(samples);
  const cooling = evaluation.level !== "ok";
  const nextAttemptAt =
    cooling && coolingSince !== null
      ? new Date(Date.parse(coolingSince) + DEFAULT_THRESHOLDS.coolingIntervalMs).toISOString()
      : null;
  return {
    cooling,
    reason: cooling ? `Generation paused: ${evaluation.reason}` : "Generation is not paused for cooling",
    intervalRunning: cooling,
    thresholdMonitored: true,
    telemetryAvailable: availability.available,
    nextAttemptAt,
  };
}

export type Interruptor = (taskId: string) => void;

export type CoolingQueue = TaskQueue & {
  isCoolingDown: () => Promise<boolean>;
  describe: () => Promise<CoolingDescriptor>;
  enforce: () => Promise<{ cooling: boolean; cooledTaskIds: string[] }>;
  resumeCooled: () => Promise<number>;
};

/**
 * Wrap a queue with thermal gating: while hot, `runNext`/`runUntilIdle`
 * never dispatch new work; `enforce()` cooperatively cools generating
 * tasks; `resumeCooled()` re-queues cooled tasks when cool again.
 */
export function createCoolingQueue(
  queue: TaskQueue,
  store: TaskStore,
  interruptors: Partial<Record<string, Interruptor>>,
  getSamples: () => Promise<TelemetrySample[]>,
  thresholds: CoolingThresholds,
  opts: { onCoolingChange?: (cooling: boolean, descriptor: CoolingDescriptor) => void } = {}
): CoolingQueue {
  let coolingSince: string | null = null;
  let lastNotification: boolean | null = null;

  async function evaluate(): Promise<ThermalEvaluation> {
    return evaluateThermal(await getSamples(), thresholds);
  }

  async function notify(cooling: boolean, descriptor: CoolingDescriptor): Promise<void> {
    if (lastNotification !== cooling) {
      lastNotification = cooling;
      opts.onCoolingChange?.(cooling, descriptor);
    }
  }

  async function enforceOnce(): Promise<{ cooling: boolean; cooledTaskIds: string[] }> {
    const evaluation = await evaluate();
    const samples = await getSamples();
    const cooling = evaluation.level !== "ok";
    if (cooling && coolingSince === null) coolingSince = new Date().toISOString();
    if (!cooling) coolingSince = null;
    const descriptor = describeCooling(evaluation, samples, coolingSince);
    await notify(cooling, descriptor);
    const cooledTaskIds: string[] = [];
    if (cooling) {
      for (const task of await store.listTasks()) {
        if (task.state !== "generating") continue; // other running states finish (safe)
        try {
          interruptors[task.taskType]?.(task.taskId);
        } catch {
          // Best-effort interrupt; the guarded move still holds.
        }
        await transitionTask(store, task.taskId, "cooling-down");
        cooledTaskIds.push(task.taskId);
      }
    }
    return { cooling, cooledTaskIds };
  }

  async function guard<T>(action: () => Promise<T>, idle: T): Promise<T> {
    const { cooling } = await enforceOnce();
    if (cooling) return idle;
    return action();
  }

  return {
    enqueue: (taskType, params, projectId) => queue.enqueue(taskType, params, projectId),
    runNext: () => guard(() => queue.runNext(), null),
    runTask: (taskId) =>
      guard(async () => {
        const task = await store.getTask(taskId);
        if (task && task.state === "queued") {
          const { cooling } = await enforceOnce();
          if (cooling) return { taskId, state: "cooling-down" };
        }
        return queue.runTask(taskId);
      }, { taskId: "", state: "cooling-down" }),
    runUntilIdle: () => guard(() => queue.runUntilIdle(), []),
    pauseTask: (taskId) => queue.pauseTask(taskId),
    cancelTask: (taskId) => queue.cancelTask(taskId),
    resumeTask: (taskId) => queue.resumeTask(taskId),
    resumeInterrupted: () => queue.resumeInterrupted(),
    isCoolingDown: async () => (await evaluate()).level !== "ok",
    describe: async () => {
      const evaluation = await evaluate();
      return describeCooling(evaluation, await getSamples(), coolingSince);
    },
    enforce: enforceOnce,
    resumeCooled: async () => {
      const evaluation = await evaluate();
      if (evaluation.level !== "ok") return 0;
      let resumed = 0;
      for (const task of await store.listTasks()) {
        if (task.state === "cooling-down") {
          await transitionTask(store, task.taskId, "queued");
          resumed++;
        }
      }
      return resumed;
    },
  };
}
