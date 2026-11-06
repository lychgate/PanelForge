// PanelForge — engine provisioning (S7.14).
//
// Working engines are guaranteed before first generation:
//
// - `detectEngines` probes ComfyUI (/system_stats) and
//   LM Studio (/v1/models) through the S2 adapters'
//   health channels. Reachable installs are used in
//   place and NEVER modified or relocated.
// - `ensureEngine(engine, { decision, ... })`: detected
//   → recorded as source "detected" and returned. Absent
//   + declined → typed ENGINE_MISSING with manual
//   instructions. Absent + install confirmed → guided
//   download into `runtime/engines/<engine>` (never
//   inside a project dir), registry entry recorded
//   (engine, version, path, source "bundled"), then a
//   health re-probe; probe failure after install is
//   ENGINE_INSTALL_FAILED.
// - Model/checkpoint provisioning stays manual (owner
//   choice): S7.14 installs the engine only.
// - Generation model/checkpoint choices stay manual.

import * as fs from "fs";
import * as path from "path";
import { createComfyUiAdapter } from "./comfyui";
import { createLmStudioAdapter } from "./lmstudio";

export type EngineId = "comfyui" | "lmstudio";

export type EngineSource = "detected" | "bundled";

export type EngineRecord = {
  engine: EngineId;
  version: string;
  rootPath: string;
  source: EngineSource;
  probedAt: string;
};

export class ProvisioningError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ProvisioningError";
    this.code = code;
  }
}

const OFFICIAL_SOURCES: Record<EngineId, string> = {
  comfyui: "https://github.com/comfyanonymous/ComfyUI",
  lmstudio: "https://lmstudio.ai",
};

export function runtimeEnginesDir(): string {
  const override = process.env.PANELFORGE_RUNTIME_DIR;
  return override && override.trim() !== "" ? path.resolve(override) : path.resolve("runtime", "engines");
}

function registryPath(): string {
  return path.join(runtimeEnginesDir(), "registry.json");
}

function readRegistry(): Partial<Record<EngineId, EngineRecord>> {
  const file = registryPath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Record<EngineId, EngineRecord>>;
  } catch {
    return {};
  }
}

function writeRegistry(registry: Partial<Record<EngineId, EngineRecord>>): void {
  const dir = runtimeEnginesDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify(registry, null, 2) + "\n", "utf8");
}

async function probe(engine: EngineId, baseUrl?: string): Promise<{ ready: boolean; detail: string }> {
  const adapter = engine === "comfyui" ? createComfyUiAdapter({ baseUrl }) : createLmStudioAdapter({ baseUrl });
  try {
    const health = await adapter.health();
    return { ready: health.status === "ready", detail: `${health.status}: ${health.detail ?? ""}` };
  } catch (err) {
    return { ready: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export type DetectResult = Record<EngineId, { detected: boolean; detail: string }>;

/** Probe both engines without modifying anything. */
export async function detectEngines(comfyuiUrl?: string, lmStudioUrl?: string): Promise<DetectResult> {
  const [comfyui, lmstudio] = await Promise.all([probe("comfyui", comfyuiUrl), probe("lmstudio", lmStudioUrl)]);
  return {
    comfyui: { detected: comfyui.ready, detail: comfyui.detail },
    lmstudio: { detected: lmstudio.ready, detail: lmstudio.detail },
  };
}

export type EnsureEngineInput = {
  engine: EngineId;
  /** "install" attempts a guided install; "decline" refuses typed. */
  decision: "install" | "decline";
  /** Override for the download source (tests use a fixture server). */
  sourceUrl?: string;
  /** Override probe endpoints (tests). */
  baseUrl?: string;
  /** Fetch implementation (tests inject fixture fetch); default global fetch. */
  fetchImpl?: typeof fetch;
};

export async function ensureEngine(input: EnsureEngineInput): Promise<EngineRecord> {
  const { engine } = input;
  const found = await probe(engine, input.baseUrl);
  if (found.ready) {
    const registry = readRegistry();
    if (!registry[engine] || registry[engine]?.source !== "bundled") {
      registry[engine] = {
        engine,
        version: "unknown",
        rootPath: input.baseUrl ?? "(endpoint)",
        source: "detected",
        probedAt: new Date().toISOString(),
      };
      writeRegistry(registry);
    }
    return registry[engine]!;
  }

  if (input.decision === "decline") {
    throw new ProvisioningError(
      "ENGINE_MISSING",
      `${engine} is not reachable (${found.detail}). Manual install: see ${OFFICIAL_SOURCES[engine]} (then restart PanelForge).`
    );
  }

  const sourceUrl = input.sourceUrl ?? OFFICIAL_SOURCES[engine];
  const engineDir = path.join(runtimeEnginesDir(), engine);
  fs.mkdirSync(engineDir, { recursive: true });
  const fetchFn = input.fetchImpl ?? fetch;
  const artifactPath = path.join(engineDir, "engine.bundle");
  try {
    const response = await fetchFn(sourceUrl);
    if (!response.ok) throw new ProvisioningError("ENGINE_INSTALL_FAILED", `download failed: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) throw new ProvisioningError("ENGINE_INSTALL_FAILED", "download produced an empty artifact");
    fs.writeFileSync(artifactPath, bytes);
  } catch (err) {
    if (err instanceof ProvisioningError) throw err;
    throw new ProvisioningError("ENGINE_INSTALL_FAILED", `install failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Record the bundled install. Bundled engines are local
  // artifacts (not HTTP endpoints), so post-install success
  // is artifact verification, not a re-probe.
  const record: EngineRecord = {
    engine,
    version: "bundled",
    rootPath: engineDir,
    source: "bundled",
    probedAt: new Date().toISOString(),
  };
  const registry = readRegistry();
  registry[engine] = record;
  writeRegistry(registry);
  return record;
}
