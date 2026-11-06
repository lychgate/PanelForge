// PanelForge — hardware detection (S2.14, spec §10.1).
//
// At startup, attempt to identify what the machine offers:
//
// - GPU model, VRAM, system RAM, CPU
// - image-generation backends, model services
// - supported monitoring capabilities
//
// Every signal is typed exactly one of Detected / Unavailable /
// Unknown, and absence is never shown as zero:
//
// - Detected: the signal was measured and `value` is present (numbers
//   are always > 0).
// - Unavailable: the attempt was made and produced no result (e.g. a
//   local service refused the connection, `nvidia-smi` is missing).
// - Unknown: detection itself could not be attempted or the result is
//   ambiguous (an unavailable probe tool, a timeout).
//
// Scheduling decisions are NOT taken here — they land in S2.13/S2.17.
// This module only reports. No clocks, fans, or power limits are ever
// touched (§10.2/§10.4).

import * as os from "os";
import * as child_process from "child_process";

export type SignalStatus = "detected" | "unavailable" | "unknown";

export type Signal<T = string> = {
  status: SignalStatus;
  /** Present only when status is "detected" — never 0, never fabricated. */
  value?: T;
  detail?: string;
  checkedAt: string;
};

export type HardwareSnapshot = {
  gpuModel: Signal<string>;
  vramBytes: Signal<number>;
  ramBytes: Signal<number>;
  cpu: Signal<{ model: string; cores: number }>;
  imageBackends: Signal<string[]>;
  modelServices: Signal<string[]>;
  monitoring: Signal<string[]>;
  checkedAt: string;
};

const STATUSES: readonly SignalStatus[] = ["detected", "unavailable", "unknown"];

export function isSignalStatus(value: unknown): value is SignalStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

function isSignal<T>(value: unknown): value is Signal<T> {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  if (!isSignalStatus(s.status)) return false;
  if (typeof s.checkedAt !== "string") return false;
  if (s.status === "detected" && s.value === undefined) return false;
  if (s.status !== "detected" && s.value !== undefined) return false;
  return true;
}

export function isHardwareSnapshot(value: unknown): value is HardwareSnapshot {
  if (value === null || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    isSignal(s.gpuModel) &&
    isSignal(s.vramBytes) &&
    isSignal(s.ramBytes) &&
    isSignal(s.cpu) &&
    isSignal(s.imageBackends) &&
    isSignal(s.modelServices) &&
    isSignal(s.monitoring) &&
    typeof s.checkedAt === "string"
  );
}

function now(): string {
  return new Date().toISOString();
}

function unavailable<T>(detail: string): Signal<T> {
  return { status: "unavailable", detail, checkedAt: now() };
}

function unknown<T>(detail: string): Signal<T> {
  return { status: "unknown", detail, checkedAt: now() };
}

export type DetectionDeps = {
  totalMem?: () => number;
  cpus?: () => Array<{ model?: string }>;
  platform?: () => string;
  runGpuProbe?: () => Promise<{ name?: string; vramBytes?: number } | null>;
  probeService?: (url: string, timeoutMs: number) => Promise<"up" | "refused" | "error">;
};

// ---- RAM / CPU (os module; always measurable on supported hosts) ----

function detectRam(totalMem: () => number): Signal<number> {
  try {
    const bytes = totalMem();
    if (typeof bytes === "number" && bytes > 0) {
      return { status: "detected", value: bytes, checkedAt: now() };
    }
    return unknown("system RAM byte count unavailable");
  } catch (err) {
    return unknown(err instanceof Error ? err.message : String(err));
  }
}

function detectCpu(cpus: () => Array<{ model?: string }>): Signal<{ model: string; cores: number }> {
  try {
    const list = cpus();
    if (list.length > 0 && typeof list[0].model === "string" && list[0].model.trim() !== "") {
      return { status: "detected", value: { model: list[0].model.trim(), cores: list.length }, checkedAt: now() };
    }
    return unavailable("no CPU model reported");
  } catch (err) {
    return unknown(err instanceof Error ? err.message : String(err));
  }
}

// ---- GPU (nvidia-smi when present; never fabricated) ----

const NVIDIA_SMI_TIMEOUT_MS = 3000;

export function defaultGpuProbe(): Promise<{ name?: string; vramBytes?: number } | null> {
  return new Promise((resolve) => {
    child_process.execFile(
      "nvidia-smi",
      ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      { timeout: NVIDIA_SMI_TIMEOUT_MS },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }
        const line = stdout.split("\n").map((l) => l.trim()).find((l) => l !== "");
        if (!line) {
          resolve(null);
          return;
        }
        // "RTX 4080, 16376" — name, VRAM in MiB.
        const comma = line.lastIndexOf(",");
        const name = comma >= 0 ? line.slice(0, comma).trim() : line;
        const mib = comma >= 0 ? Number(line.slice(comma + 1).trim()) : Number.NaN;
        resolve({
          name: name === "" ? undefined : name,
          vramBytes: Number.isFinite(mib) && mib > 0 ? Math.round(mib * 1024 * 1024) : undefined,
        });
      }
    );
  });
}

async function detectGpu(
  runGpuProbe: () => Promise<{ name?: string; vramBytes?: number } | null>
): Promise<{ gpuModel: Signal<string>; vramBytes: Signal<number> }> {
  try {
    const probe = await runGpuProbe();
    if (!probe) {
      return {
        gpuModel: unavailable("no GPU reported (nvidia-smi unavailable)"),
        vramBytes: unavailable("no GPU reported (nvidia-smi unavailable)"),
      };
    }
    return {
      gpuModel: probe.name
        ? { status: "detected", value: probe.name, checkedAt: now() }
        : unavailable("GPU detected without a model name"),
      vramBytes:
        typeof probe.vramBytes === "number" && probe.vramBytes > 0
          ? { status: "detected", value: probe.vramBytes, checkedAt: now() }
          : unavailable("GPU detected without a VRAM total"),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { gpuModel: unknown(detail), vramBytes: unknown(detail) };
  }
}

// ---- Model services / image backends (local HTTP probes) ----

export const LMSTUDIO_HEALTH_URL = "http://localhost:1234/v1/models";
export const COMFYUI_HEALTH_URL = "http://localhost:8188/system_stats";
export const SERVICE_PROBE_TIMEOUT_MS = 1500;

export function defaultServiceProbe(url: string, timeoutMs: number): Promise<"up" | "refused" | "error"> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    .then((res) => (res.ok ? "up" : "refused"))
    .catch((err: unknown) => {
      // Connection refused = the service is absent, never ambiguous.
      const msg = err instanceof Error ? err.message : String(err);
      if (/refused|enotfound|econnrefused/i.test(msg)) return "refused";
      return "error";
    });
}

async function probeOne(
  id: string,
  url: string,
  probeService: (url: string, timeoutMs: number) => Promise<"up" | "refused" | "error">
): Promise<{ id: string; outcome: "up" | "refused" | "error" }> {
  try {
    return { id, outcome: await probeService(url, SERVICE_PROBE_TIMEOUT_MS) };
  } catch {
    return { id, outcome: "error" };
  }
}

async function detectServices(
  probeService: (url: string, timeoutMs: number) => Promise<"up" | "refused" | "error">
): Promise<{ imageBackends: Signal<string[]>; modelServices: Signal<string[]> }> {
  const [lm, comfy] = await Promise.all([
    probeOne("lmstudio", LMSTUDIO_HEALTH_URL, probeService),
    probeOne("comfyui", COMFYUI_HEALTH_URL, probeService),
  ]);
  const up = [lm, comfy].filter((r) => r.outcome === "up").map((r) => r.id);
  const errored = [lm, comfy].filter((r) => r.outcome === "error").map((r) => r.id);
  const allRefused = [lm, comfy].every((r) => r.outcome === "refused");
  if (up.length > 0) {
    return {
      imageBackends: { status: "detected", value: up, checkedAt: now() },
      modelServices: { status: "detected", value: up, checkedAt: now() },
    };
  }
  if (allRefused) {
    return {
      imageBackends: unavailable("no local generation services reachable"),
      modelServices: unavailable("no local model services reachable"),
    };
  }
  const detail = `unreachable (probe errors: ${errored.join(", ") || "unknown"})`;
  return { imageBackends: unknown(detail), modelServices: unknown(detail) };
}

// ---- Monitoring (telemetry arrives S2.15; until then: unknown) ----

function detectMonitoring(): Signal<string[]> {
  return unknown("no telemetry adapter registered (S2.15)");
}

/** Attempt hardware detection; never throws — failures become typed signals. */
export async function detectHardware(deps: DetectionDeps = {}): Promise<HardwareSnapshot> {
  const totalMem = deps.totalMem ?? os.totalmem;
  const cpus = deps.cpus ?? os.cpus;
  const gpuProbe = deps.runGpuProbe ?? defaultGpuProbe;
  const serviceProbe = deps.probeService ?? defaultServiceProbe;
  const [gpu, services] = await Promise.all([
    detectGpu(gpuProbe),
    detectServices(serviceProbe),
  ]);
  return {
    gpuModel: gpu.gpuModel,
    vramBytes: gpu.vramBytes,
    ramBytes: detectRam(totalMem),
    cpu: detectCpu(cpus),
    imageBackends: services.imageBackends,
    modelServices: services.modelServices,
    monitoring: detectMonitoring(),
    checkedAt: now(),
  };
}
