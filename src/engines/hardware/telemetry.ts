// PanelForge — telemetry adapter interface (S2.15, spec §10.4).
//
// A stable boundary for optional hardware metrics (temperature, VRAM,
// utilization, ...): platform adapters sample metrics and report each
// one as a typed S2.14 Signal (Detected / Unavailable / Unknown —
// never zero, never fabricated).
//
// - `TelemetryAdapter` is the only contract: one `sample()` method.
//   Platform implementations (NVIDIA, OS memory, future drivers) are
//   added by registering a new adapter — the Resource Manager
//   (`src/engines/tasks/resources.ts`) is never touched.
// - `createTelemetryRegistry` collects adapters and samples them all.
//   An adapter that throws normalizes to unknown signals (never a
//   crash across the boundary); graceful display semantics land in
//   S2.16, thresholds in S2.17 — neither lives here.
// - Monitoring is optional and platform-dependent (§10.4): with no
//   adapters registered, callers see monitoring = Unknown.

import * as os from "os";
import * as child_process from "child_process";
import type { Signal } from "./detect";
import { isSignalStatus } from "./detect";

export type TelemetryMetricId =
  | "temperatureC"
  | "vramUsedBytes"
  | "vramTotalBytes"
  | "gpuUtilPercent"
  | "ramUsedBytes"
  | "ramTotalBytes";

export type TelemetrySample = {
  adapterId: string;
  checkedAt: string;
  metrics: Partial<Record<TelemetryMetricId, Signal<number>>>;
};

/** The entire platform contract: one sampling method, typed results. */
export type TelemetryAdapter = {
  readonly id: string;
  sample: () => Promise<TelemetrySample>;
};

export function isTelemetrySample(value: unknown): value is TelemetrySample {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  if (typeof s.adapterId !== "string" || typeof s.checkedAt !== "string") return false;
  if (s.metrics === null || typeof s.metrics !== "object") return false;
  for (const signal of Object.values(s.metrics as Record<string, unknown>)) {
    if (signal === null || typeof signal !== "object") return false;
    const sig = signal as Record<string, unknown>;
    if (!isSignalStatus(sig.status) || typeof sig.checkedAt !== "string") return false;
    if (sig.status === "detected" && (typeof sig.value !== "number" || !(sig.value > 0) || !Number.isFinite(sig.value))) {
      return false;
    }
    if (sig.status !== "detected" && sig.value !== undefined) return false;
  }
  return true;
}

function now(): string {
  return new Date().toISOString();
}

function unavailable(detail: string): Signal<number> {
  return { status: "unavailable", detail, checkedAt: now() };
}

function unknown(detail: string): Signal<number> {
  return { status: "unknown", detail, checkedAt: now() };
}

// ---- Registry ----

export type TelemetryRegistry = {
  register: (adapter: TelemetryAdapter) => void;
  list: () => string[];
  sampleAll: () => Promise<TelemetrySample[]>;
};

export function createTelemetryRegistry(): TelemetryRegistry {
  const adapters = new Map<string, TelemetryAdapter>();
  return {
    register: (adapter) => {
      adapters.set(adapter.id, adapter);
    },
    list: () => [...adapters.keys()],
    sampleAll: async () => {
      // Sequential sampling: telemetry is advisory, never a hot path;
      // order is stable (registration order) for deterministic output.
      const out: TelemetrySample[] = [];
      for (const adapter of adapters.values()) {
        try {
          const sample = await adapter.sample();
          out.push(isTelemetrySample(sample) ? sample : unknownSample(adapter.id, "malformed telemetry sample"));
        } catch (err) {
          out.push(unknownSample(adapter.id, err instanceof Error ? err.message : String(err)));
        }
      }
      return out;
    },
  };
}

function unknownSample(adapterId: string, detail: string): TelemetrySample {
  return {
    adapterId,
    checkedAt: now(),
    metrics: {
      temperatureC: unknown(detail),
      vramUsedBytes: unknown(detail),
      vramTotalBytes: unknown(detail),
      gpuUtilPercent: unknown(detail),
      ramUsedBytes: unknown(detail),
      ramTotalBytes: unknown(detail),
    },
  };
}

// ---- OS memory adapter (Node os module; always measurable) ----

export function createOsMemoryAdapter(): TelemetryAdapter {
  return {
    id: "os-memory",
    sample: async () => {
      const total = os.totalmem();
      const free = os.freemem();
      const used = typeof total === "number" && typeof free === "number" ? total - free : NaN;
      const checkedAt = now();
      return {
        adapterId: "os-memory",
        checkedAt,
        metrics: {
          ramTotalBytes:
            typeof total === "number" && total > 0
              ? { status: "detected", value: total, checkedAt }
              : unavailable("system RAM total unavailable"),
          ramUsedBytes:
            Number.isFinite(used) && used > 0
              ? { status: "detected", value: used, checkedAt }
              : unavailable("system RAM used unavailable"),
        },
      };
    },
  };
}

// ---- NVIDIA adapter (nvidia-smi when present; first GPU) ----

const NVIDIA_TELEMETRY_TIMEOUT_MS = 3000;

export type NvidiaTelemetryDeps = {
  runProbe?: () => Promise<string | null>;
};

export function defaultNvidiaTelemetryProbe(): Promise<string | null> {
  return new Promise((resolve) => {
    child_process.execFile(
      "nvidia-smi",
      ["--query-gpu=temperature.gpu,memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"],
      { timeout: NVIDIA_TELEMETRY_TIMEOUT_MS },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }
        const line = stdout.split("\n").map((l) => l.trim()).find((l) => l !== "");
        resolve(line ?? null);
      }
    );
  });
}

/**
 * Parse one `nvidia-smi` CSV line:
 * "61, 2048, 16376, 42" → temperature 61°C, 2048 MiB used, 16376 MiB
 * total, 42% utilization. Missing/invalid fields stay absent (never 0).
 */
export function parseNvidiaTelemetryCsv(line: string): Partial<Record<TelemetryMetricId, Signal<number>>> {
  const parts = line.split(",").map((p) => p.trim());
  const [tempRaw, usedMibRaw, totalMibRaw, utilRaw] = parts;
  const checkedAt = now();
  const metrics: Partial<Record<TelemetryMetricId, Signal<number>>> = {};
  const temp = Number(tempRaw);
  if (Number.isFinite(temp) && temp > 0) {
    metrics.temperatureC = { status: "detected", value: temp, checkedAt };
  } else {
    metrics.temperatureC = unavailable("GPU temperature not reported");
  }
  const usedMib = Number(usedMibRaw);
  if (Number.isFinite(usedMib) && usedMib > 0) {
    metrics.vramUsedBytes = { status: "detected", value: Math.round(usedMib * 1024 * 1024), checkedAt };
  } else {
    metrics.vramUsedBytes = unavailable("GPU VRAM used not reported");
  }
  const totalMib = Number(totalMibRaw);
  if (Number.isFinite(totalMib) && totalMib > 0) {
    metrics.vramTotalBytes = { status: "detected", value: Math.round(totalMib * 1024 * 1024), checkedAt };
  } else {
    metrics.vramTotalBytes = unavailable("GPU VRAM total not reported");
  }
  const util = Number(utilRaw);
  if (Number.isFinite(util) && util >= 0 && util <= 100) {
    metrics.gpuUtilPercent =
      util === 0
        ? unavailable("GPU utilization reported as 0% (not a measurement)")
        : { status: "detected", value: util, checkedAt };
  } else {
    metrics.gpuUtilPercent = unavailable("GPU utilization not reported");
  }
  return metrics;
}

export function createNvidiaAdapter(deps: NvidiaTelemetryDeps = {}): TelemetryAdapter {
  const runProbe = deps.runProbe ?? defaultNvidiaTelemetryProbe;
  return {
    id: "nvidia",
    sample: async () => {
      let line: string | null;
      try {
        line = await runProbe();
      } catch (err) {
        return unknownSample("nvidia", err instanceof Error ? err.message : String(err));
      }
      if (!line) {
        const checkedAt = now();
        return {
          adapterId: "nvidia",
          checkedAt,
          metrics: {
            temperatureC: unavailable("nvidia-smi unavailable"),
            vramUsedBytes: unavailable("nvidia-smi unavailable"),
            vramTotalBytes: unavailable("nvidia-smi unavailable"),
            gpuUtilPercent: unavailable("nvidia-smi unavailable"),
          },
        };
      }
      return { adapterId: "nvidia", checkedAt: now(), metrics: parseNvidiaTelemetryCsv(line) };
    },
  };
}
