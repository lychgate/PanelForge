// PanelForge — configuration service (S0.6).
//
// Centralizes application configuration. The service stores a single JSON
// file in the Electron userData directory (via app.getPath("userData")),
// never a hardcoded machine-specific path. Writes are atomic (tmp + rename)
// and reads are defensive (missing file → defaults; corrupt JSON → backup
// + defaults). This is the user-data path handling required by S0.6.

import * as fs from "fs";
import * as path from "path";

export const CONFIG_VERSION = 1;

export type PanelForgeConfig = {
  version: number;
  theme: string;
  logLevel: string;
  launchAtStartup: boolean;
  diagnosticsEnabled: boolean;
};

export const DEFAULT_CONFIG: PanelForgeConfig = {
  version: CONFIG_VERSION,
  theme: "system",
  logLevel: "info",
  launchAtStartup: false,
  diagnosticsEnabled: true,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function resolveUserDataDir(explicitBaseDir?: string): string {
  if (explicitBaseDir) return explicitBaseDir;
  const envOverride = process.env.PANELFORGE_USER_DATA_DIR;
  if (envOverride && envOverride.trim() !== "") return envOverride;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron");
    if (app && typeof app.getPath === "function" && app.isReady && app.isReady()) {
      return app.getPath("userData");
    }
    if (app && typeof app.getPath === "function") {
      // app not ready yet (early startup): fall back below; main calls
      // ensureConfigDir inside app.whenReady, so the real path is used then.
      return app.getPath("userData");
    }
  } catch {
    // Electron unavailable (unit tests) — fall through.
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, ".config", "panelforge");
}

export type ConfigService = {
  getUserDataDir: () => string;
  getConfigDir: () => string;
  getConfigPath: () => string;
  getUserDataSubPath: (...parts: string[]) => string;
  ensureConfigDir: () => string;
  loadConfig: () => PanelForgeConfig;
  saveConfig: (cfg: PanelForgeConfig) => PanelForgeConfig;
  updateConfig: (patch: Partial<PanelForgeConfig>) => PanelForgeConfig;
  resetConfig: () => PanelForgeConfig;
};

export function createConfigService(explicitBaseDir?: string): ConfigService {
  const userDataDir = resolveUserDataDir(explicitBaseDir);
  const configDir = path.join(userDataDir, "config");
  const configPath = path.join(configDir, "config.json");

  function getUserDataDir(): string {
    return userDataDir;
  }
  function getConfigDir(): string {
    return configDir;
  }
  function getConfigPath(): string {
    return configPath;
  }
  function ensureConfigDir(): string {
    fs.mkdirSync(configDir, { recursive: true });
    return configDir;
  }

  function normalizeWithDefaults(raw: unknown): PanelForgeConfig {
    if (!isPlainObject(raw)) return { ...DEFAULT_CONFIG };
    const cfg = { ...DEFAULT_CONFIG, ...(raw as Record<string, unknown>) } as unknown as PanelForgeConfig;
    // Version migration: any older version gets current defaults filled.
    cfg.version = CONFIG_VERSION;
    if (typeof cfg.theme !== "string") cfg.theme = DEFAULT_CONFIG.theme;
    if (typeof cfg.logLevel !== "string") cfg.logLevel = DEFAULT_CONFIG.logLevel;
    if (typeof cfg.launchAtStartup !== "boolean") cfg.launchAtStartup = DEFAULT_CONFIG.launchAtStartup;
    if (typeof cfg.diagnosticsEnabled !== "boolean") cfg.diagnosticsEnabled = DEFAULT_CONFIG.diagnosticsEnabled;
    return cfg;
  }

  function backupCorruptFile(): void {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(configPath, `${configPath}.bak-${stamp}`);
    } catch {
      // Backup is best-effort; defaults are still returned.
    }
  }

  function loadConfig(): PanelForgeConfig {
    if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };
    try {
      const text = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(text) as unknown;
      return normalizeWithDefaults(parsed);
    } catch {
      backupCorruptFile();
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(cfg: PanelForgeConfig): PanelForgeConfig {
    const normalized = normalizeWithDefaults(cfg);
    ensureConfigDir();
    const tmpPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(normalized, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmpPath, configPath);
    return normalized;
  }

  function updateConfig(patch: Partial<PanelForgeConfig>): PanelForgeConfig {
    const current = loadConfig();
    const next = { ...current, ...patch, version: CONFIG_VERSION };
    return saveConfig(next);
  }

  function resetConfig(): PanelForgeConfig {
    return saveConfig({ ...DEFAULT_CONFIG });
  }

  function getUserDataSubPath(...parts: string[]): string {
    const joined = path.join(userDataDir, ...parts);
    const normalized = path.resolve(joined);
    const base = path.resolve(userDataDir);
    if (normalized !== base && !normalized.startsWith(base + path.sep)) {
      throw new Error("User data path escapes userData directory");
    }
    return normalized;
  }

  return {
    getUserDataDir,
    getConfigDir,
    getConfigPath,
    getUserDataSubPath,
    ensureConfigDir,
    loadConfig,
    saveConfig,
    updateConfig,
    resetConfig,
  };
}

// Default singleton for the running app. Main calls ensureConfigDir/loadConfig
// on startup so the settings location always exists.
export const defaultConfigService = createConfigService();
