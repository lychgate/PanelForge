// PanelForge — graceful telemetry failure (S2.16, spec §10.4).
//
// When telemetry cannot be obtained, the app must not substitute zero,
// invent an estimate, crash, or disable the Resource Manager:
//
// - `displayMetric` renders non-detected metrics as "Unknown" — never
//   "0", never an approximation.
// - `summarizeTelemetry` aggregates samples into a single availability
//   verdict + explicit indicator ("Telemetry unavailable").
// - `resolveEffectiveProfile` clamps scheduling to conservative defaults
//   (concurrency 1) while telemetry is unavailable; the user's
//   configured cooling interval is preserved (user-configurable).
//
// App usability never depends on telemetry: queues run on the effective
// (clamped) profile exactly as before. Threshold-based pausing lands in
// S2.17 — nothing here pauses work on temperature.

import type { Signal } from "./detect";
import type { TelemetrySample, TelemetryMetricId } from "./telemetry";
import { isTelemetrySample } from "./telemetry";
import type { ResourceProfile } from "../tasks/resources";

export const TELEMETRY_UNAVAILABLE_INDICATOR = "Telemetry unavailable";

export const UNKNOWN_DISPLAY = "Unknown";

export type TelemetryAvailability = {
  /** True when at least one metric was actually measured. */
  available: boolean;
  /** Explicit indicator for the UI/log layer; "" when available. */
  indicator: string;
  detectedCount: number;
  metricCount: number;
};

export type MetricDisplay = {
  display: string;
  available: boolean;
};

/** Human-readable metric value; absence is "Unknown", never "0". */
export function displayMetric(signal: Signal<number>, unit: string = ""): MetricDisplay {
  if (signal.status === "detected" && typeof signal.value === "number" && signal.value > 0) {
    return { display: `${signal.value}${unit}`, available: true };
  }
  return { display: UNKNOWN_DISPLAY, available: false };
}

const METRIC_IDS: readonly TelemetryMetricId[] = [
  "temperatureC",
  "vramUsedBytes",
  "vramTotalBytes",
  "gpuUtilPercent",
  "ramUsedBytes",
  "ramTotalBytes",
];

/** Aggregate samples into one availability verdict. Empty = unavailable. */
export function summarizeTelemetry(samples: TelemetrySample[]): TelemetryAvailability {
  let detectedCount = 0;
  let metricCount = 0;
  const valid = samples.filter((s) => isTelemetrySample(s));
  for (const sample of valid) {
    for (const id of METRIC_IDS) {
      const signal = sample.metrics[id];
      if (!signal) continue;
      metricCount++;
      if (signal.status === "detected" && typeof signal.value === "number" && signal.value > 0) {
        detectedCount++;
      }
    }
  }
  const available = detectedCount > 0;
  return {
    available,
    indicator: available ? "" : TELEMETRY_UNAVAILABLE_INDICATOR,
    detectedCount,
    metricCount,
  };
}

/**
 * Effective scheduling profile under current telemetry: when telemetry
 * is unavailable, concurrency clamps to 1 (conservative scheduling
 * default, §10.4); the user-configured cooling interval is untouched.
 */
export function resolveEffectiveProfile(profile: ResourceProfile, samples: TelemetrySample[]): ResourceProfile {
  const availability = summarizeTelemetry(samples);
  if (availability.available) return { ...profile, maxGenerationSize: { ...profile.maxGenerationSize } };
  return {
    ...profile,
    queueConcurrency: Math.min(profile.queueConcurrency, 1),
    memoryBehavior: "conservative",
    maxGenerationSize: { ...profile.maxGenerationSize },
  };
}

/** True when telemetry is fully usable (at least one measured metric). */
export function isTelemetryAvailable(samples: TelemetrySample[]): boolean {
  return summarizeTelemetry(samples).available;
}
