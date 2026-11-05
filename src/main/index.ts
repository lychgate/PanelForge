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

import { app, BrowserWindow, Menu, shell } from "electron";
import path from "path";
import { registerIpcHandlers } from "../core/ipc/registry";
import { defaultConfigService } from "../core/config/service";
import { defaultLogService, isLogLevel } from "../core/logging/service";
import { defaultDatabaseService } from "../database/service";
import { defaultLifecycleService } from "../core/lifecycle/service";

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
  // S0.10: minimal application menu with keyboard accelerators
  // (see Docs/PanelForge-Shortcuts.md).
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          {
            label: "Quit",
            accelerator: "CmdOrCtrl+Q",
            click: () => app.quit(),
          },
        ],
      },
      {
        label: "View",
        submenu: [
          {
            label: "Reload",
            accelerator: "CmdOrCtrl+R",
            click: () => BrowserWindow.getFocusedWindow()?.reload(),
          },
        ],
      },
    ])
  );
  // S0.9: ordered startup sequence + cleanup hooks, owned by the
  // lifecycle service. Each step failure is recorded (via the log
  // service) and never blocks the window from opening.
  defaultLifecycleService.registerCleanup({
    name: "database",
    run: () => {
      try {
        defaultDatabaseService.close();
      } catch (err) {
        defaultLogService.logError(err, "database close");
      }
    },
  });
  void defaultLifecycleService
    .start([
      {
        name: "ipc",
        run: () => {
          registerIpcHandlers();
        },
      },
      {
        // S0.6: ensure the settings location exists and can be read safely.
        // S0.7: set the log minimum level from the config, create the log
        // location, and record a startup entry.
        name: "config+logging",
        run: () => {
          try {
            defaultConfigService.ensureConfigDir();
            const cfg = defaultConfigService.loadConfig();
            if (isLogLevel(cfg.logLevel)) defaultLogService.setMinLevel(cfg.logLevel);
            defaultLogService.ensureLogDir();
            defaultLogService.info("PanelForge starting");
          } catch (err) {
            defaultLogService.logError(err, "startup");
          }
        },
      },
      {
        // S0.8: initialize the SQLite foundation (WAL + FK + busy timeout,
        // migrations). Failure is recorded but never blocks the window.
        name: "database",
        run: () => {
          try {
            const init = defaultDatabaseService.initialize();
            defaultLogService.info(
              `database ready (journal=${init.journalMode}, migrations=${init.appliedMigrations.join(",") || "none"})`
            );
          } catch (err) {
            defaultLogService.logError(err, "database");
          }
        },
      },
    ])
    .then((summary) => {
      defaultLogService.info(
        summary.ok ? "startup complete" : `startup completed with failures: ${summary.failed.join(", ")}`
      );
    });
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

// S0.9: run the ordered shutdown sequence (all registered cleanup hooks,
// e.g. closing the database handle) so nothing is left behind. The
// "shutting down" entry is written synchronously first so the trace
// survives even if the process exits before the async summary runs.
app.on("before-quit", () => {
  defaultLogService.info("PanelForge shutting down");
  void defaultLifecycleService.shutdown().then((summary) => {
    defaultLogService.info(
      summary.ok ? "shutdown complete" : `shutdown completed with failures: ${summary.failed.join(", ")}`
    );
  });
});
