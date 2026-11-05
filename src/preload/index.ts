// PanelForge — preload bridge (S0.5).
//
// Restricted bridge: exposes a frozen API object via contextBridge.
// S0.5 adds ONE diagnostic method: `diagnostics.get()` — the first
// renderer → main round-trip proving the S0.4 allowlist end-to-end.
// The preload wraps the single approved channel and does not expose
// ipcRenderer itself to the renderer.

import { contextBridge, ipcRenderer } from "electron";
import type {
  DiagnosticsGetData,
  IpcResult,
} from "../shared/types";

const api = Object.freeze({
  diagnostics: Object.freeze({
    async get(): Promise<IpcResult<DiagnosticsGetData>> {
      try {
        return await ipcRenderer.invoke("panelforge:diagnostics.get", {
          args: { token: "diagnostic" },
        }) as unknown as IpcResult<DiagnosticsGetData>;
      } catch (err) {
        return {
          ok: false,
          code: "HANDLER_ERROR",
          message: `Diagnostic failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  }),
  version: Object.freeze({}),
});

contextBridge.exposeInMainWorld("panelforge", api);

