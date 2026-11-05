// PanelForge — Electron main process (S0.2).
//
// Creates the initial BrowserWindow with secure defaults from its first
// launch (Q2, owner-approved 2026-11-05), loads the initial renderer page,
// and handles basic app lifecycle (launch / close / quit).
//
// Boundary: S0.2 is launch only. Security *verification* and documentation
// belong to S0.3; IPC allowlist belongs to S0.4; logging/config/lifecycle
// infrastructure belong to S0.6–S0.9. This file must not reach into those.

import { app, BrowserWindow, shell } from "electron";
import path from "path";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // Secure defaults from the first launch (Q2). S0.3 verifies and
      // documents these; S0.2 applies them so no temporary insecure
      // window is ever created.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "../preload/index.js"),
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

  // No webviews in S0.2.
  win.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  return win;
}

void app.whenReady().then(() => {
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
