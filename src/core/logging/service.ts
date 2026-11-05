// PanelForge — central logging service (S0.7).
//
// Single module for diagnostics in the main process:
//
// - Entries are JSON lines {timestamp, level, message} in
//   <userData>/logs/panelforge.log (never a hardcoded path; resolution
//   mirrors the S0.6 config service: app.getPath("userData"), falling
//   back to ~/.config/panelforge outside Electron).
// - Size-limited rotation: when the active log would exceed
//   DEFAULT_MAX_FILE_BYTES, it is rotated into numbered backups
//   (panelforge-1.log … panelforge-<MAX_BACKUPS>.log) and the oldest
//   backup is deleted. The active file is created lazily on first write.
// - Consistent error reporting: logError() records Error name + message
//   (no stack — stacks can contain file-system paths) in the same entry
//   shape. Messages are redacted (token/password/secret values, the home
//   directory) and length-capped so sensitive data is not unnecessarily
//   logged.
// - Never throws: logging must not crash the app it instruments.

import * as fs from "fs";
import * as path from "path";

export const LOG_FILE_NAME = "panelforge.log";
export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
export const MAX_BACKUPS = 3;
export const MAX_MESSAGE_CHARS = 1024;

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function isLogLevel(value: unknown): value is LogLevel {
  return (
    value === "debug" || value === "info" || value === "warn" || value === "error"
  );
}

function resolveUserDataDir(explicitBaseDir?: string): string {
  if (explicitBaseDir) return explicitBaseDir;
  const envOverride = process.env.PANELFORGE_USER_DATA_DIR;
  if (envOverride && envOverride.trim() !== "") return envOverride;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      return app.getPath("userData");
    }
  } catch {
    // Electron unavailable (unit tests) — fall through.
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, ".config", "panelforge");
}

// Strip credential values, the home directory, and over-long payloads so
// logs stay useful without carrying sensitive information.
export function redactSensitive(text: string): string {
  let redacted = text;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home && home.length > 1) {
    redacted = redacted.split(home).join("<home>");
  }
  redacted = redacted.replace(
    /(token|password|passwd|secret|api[-_ ]?key|authorization)(["']?\s*[:=]\s*["']?)([^\s"']+)/gi,
    "$1$2[REDACTED]"
  );
  if (redacted.length > MAX_MESSAGE_CHARS) {
    redacted = redacted.slice(0, MAX_MESSAGE_CHARS) + "…[truncated]";
  }
  return redacted;
}

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  errorName?: string;
};

export type LogServiceOptions = {
  maxFileBytes?: number;
  maxBackups?: number;
  minLevel?: LogLevel;
};

export type LogService = {
  getLogDir: () => string;
  getLogPath: () => string;
  ensureLogDir: () => string;
  getMinLevel: () => LogLevel;
  setMinLevel: (level: LogLevel) => void;
  log: (level: LogLevel, message: string) => LogEntry | null;
  debug: (message: string) => LogEntry | null;
  info: (message: string) => LogEntry | null;
  warn: (message: string) => LogEntry | null;
  error: (message: string) => LogEntry | null;
  logError: (err: unknown, context?: string) => LogEntry | null;
};

export function createLogService(
  explicitBaseDir?: string,
  opts: LogServiceOptions = {}
): LogService {
  const userDataDir = resolveUserDataDir(explicitBaseDir);
  const logDir = path.join(userDataDir, "logs");
  const logPath = path.join(logDir, LOG_FILE_NAME);
  const maxFileBytes =
    opts.maxFileBytes && opts.maxFileBytes > 0 ? opts.maxFileBytes : DEFAULT_MAX_FILE_BYTES;
  const maxBackups =
    opts.maxBackups !== undefined && opts.maxBackups >= 0
      ? opts.maxBackups
      : MAX_BACKUPS;
  let minLevel: LogLevel = isLogLevel(opts.minLevel) ? opts.minLevel : "info";

  function getLogDir(): string {
    return logDir;
  }
  function getLogPath(): string {
    return logPath;
  }
  function ensureLogDir(): string {
    fs.mkdirSync(logDir, { recursive: true });
    return logDir;
  }
  function getMinLevel(): LogLevel {
    return minLevel;
  }
  function setMinLevel(level: LogLevel): void {
    if (isLogLevel(level)) minLevel = level;
  }

  function backupPath(index: number): string {
    return path.join(logDir, `panelforge-${index}.log`);
  }

  function rotateIfNeeded(incomingBytes: number): void {
    if (!fs.existsSync(logPath)) return;
    const size = fs.statSync(logPath).size;
    if (size + incomingBytes <= maxFileBytes) return;
    if (maxBackups === 0) {
      fs.rmSync(logPath);
      return;
    }
    const oldest = backupPath(maxBackups);
    if (fs.existsSync(oldest)) fs.rmSync(oldest);
    for (let i = maxBackups - 1; i >= 1; i--) {
      const src = backupPath(i);
      if (fs.existsSync(src)) fs.renameSync(src, backupPath(i + 1));
    }
    fs.renameSync(logPath, backupPath(1));
  }

  function writeEntry(entry: LogEntry): void {
    ensureLogDir();
    const line = JSON.stringify(entry) + "\n";
    rotateIfNeeded(Buffer.byteLength(line, "utf8"));
    fs.appendFileSync(logPath, line, { encoding: "utf8", mode: 0o600 });
  }

  function log(level: LogLevel, message: string): LogEntry | null {
    try {
      const lvl: LogLevel = isLogLevel(level) ? level : "info";
      if (LEVEL_RANK[lvl] < LEVEL_RANK[minLevel]) return null;
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: lvl,
        message: redactSensitive(typeof message === "string" ? message : String(message)),
      };
      writeEntry(entry);
      return entry;
    } catch {
      // Logging must never crash the app.
      return null;
    }
  }

  function logError(err: unknown, context?: string): LogEntry | null {
    try {
      const name = err instanceof Error ? err.name : typeof err;
      const detail = err instanceof Error ? err.message : String(err);
      const prefix = context ? `${context}: ` : "";
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        message: redactSensitive(`${prefix}${name}: ${detail}`),
        errorName: name,
      };
      writeEntry(entry);
      return entry;
    } catch {
      return null;
    }
  }

  return {
    getLogDir,
    getLogPath,
    ensureLogDir,
    getMinLevel,
    setMinLevel,
    log,
    debug: (m) => log("debug", m),
    info: (m) => log("info", m),
    warn: (m) => log("warn", m),
    error: (m) => log("error", m),
    logError,
  };
}

// Default singleton for the running app. Main sets the minimum level from
// the S0.6 config and writes the startup entry on launch.
export const defaultLogService = createLogService();
