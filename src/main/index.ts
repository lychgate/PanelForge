// PanelForge — Electron main process (S0.6).
//
// Creates the BrowserWindow with secure defaults (verified + documented in
// S0.3; originally applied in S0.2 per Q2), registers the IPC allowlist
// (S0.4), ensures the centralized config service (S0.6) has created the
// userData settings location, loads the initial renderer page, and handles
// basic app lifecycle (launch / close / quit).
//
// Boundary: S0.4 owns the IPC allowlist (see src/core/ipc/registry.ts).
// Main only calls registerIpcHandlers() at startup; handlers live in the
// registry, never here. Logging/lifecycle infrastructure belong to
// S0.7–S0.9. This file must not own IPC handlers directly.

import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { registerIpcHandlers } from "../core/ipc/registry";
import { defaultConfigService } from "../core/config/service";
import { defaultLogService, isLogLevel } from "../core/logging/service";
import { defaultDatabaseService } from "../database/service";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // Secure defaults (S0.3 baseline; see Docs/PanelForge-Security-Baseline.md).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "../preload/index.js"),
      // S0.3 documents the devTools policy: DevTools enabled in dev builds
      // (needed for verification), disabled in packaged builds (S0.11).
      devTools: !app.isPackaged,
    },
  });

  // Launch the initial renderer page (local bundle only; no remote URLs).
  void win.loadFile(path.join(__dirname, "../../web/renderer/index.html"));

  // Deny external opens by default; S0.3 formalizes navigation policy.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Restrict navigation to the local renderer file; block external nav.
  win.webContents.on("will-navigate", (event, url) => {
    const rendererUrl = "file:///" + path.join(__dirname, "../../web/renderer/index.html").replace(/\\/g, "/");
    if (url !== rendererUrl) {
      event.preventDefault();
    }
  });

  // No webviews in S0.3.
  win.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  return win;
}

void app.whenReady().then(() => {
  registerIpcHandlers();
  // S0.6: ensure the settings location exists and can be read safely.
  // S0.7: set the log minimum level from the config, create the log
  // location, and record a startup entry. Failures here must not prevent
  // the window from opening; errors are recorded via the log service.
  try {
    defaultConfigService.ensureConfigDir();
    const cfg = defaultConfigService.loadConfig();
    if (isLogLevel(cfg.logLevel)) defaultLogService.setMinLevel(cfg.logLevel);
    defaultLogService.ensureLogDir();
    defaultLogService.info("PanelForge starting");
  } catch (err) {
    defaultLogService.logError(err, "startup");
  }
  // S0.8: initialize the SQLite foundation (WAL + FK + busy timeout,
  // migrations). Failure is recorded but never blocks the window.
  try {
    const init = defaultDatabaseService.initialize();
    defaultLogService.info(
      `database ready (journal=${init.journalMode}, migrations=${init.appliedMigrations.join(",") || "none"})`
    );
  } catch (err) {
    defaultLogService.logError(err, "database");
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS apps typically stay open until Cmd+Q; on Linux/Windows quit.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// S0.8: close the database handle on quit (full lifecycle is S0.9).
app.on("before-quit", () => {
  try {
    defaultDatabaseService.close();
  } catch (err) {
    defaultLogService.logError(err, "database close");
  }
});
