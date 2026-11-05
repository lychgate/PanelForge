// PanelForge — renderer entry (S0.5).
//
// Renders a static placeholder page and surfaces the S0.5 diagnostic:
// on load, the renderer calls the preload bridge and displays the
// main-process response. The renderer has no direct Node.js or
// ipcRenderer access — only the preload bridge.

export {};

type PanelForgeApi = {
  diagnostics: {
    get(): Promise<{
      ok: boolean;
      data?: {
        appName: string;
        electronVersion: string;
        nodeVersion: string;
        platform: string;
        arch: string;
        channel: string;
        timestamp: string;
      };
      code?: string;
      message?: string;
    }>;
  };
  version: Record<string, never>;
};

type PanelForgeWindow = Window & { panelforge: PanelForgeApi };

const win = window as unknown as PanelForgeWindow;

const root = document.getElementById("root");
if (root) {
  root.textContent = "PanelForge — initial window (S0.5)";
  const status = document.createElement("div");
  status.id = "diagnostic-status";
  status.textContent = "diagnostic: pending";
  root.appendChild(status);

  win.panelforge.diagnostics
    .get()
    .then((result) => {
      if (result.ok && result.data) {
        status.textContent =
          `diagnostic: ok ${result.data.appName} electron=${result.data.electronVersion} node=${result.data.nodeVersion}`;
      } else {
        status.textContent = `diagnostic: error ${result.code} ${result.message}`;
      }
    })
    .catch((err: unknown) => {
      status.textContent = `diagnostic: exception ${String(err)}`;
    });
}
