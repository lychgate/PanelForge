// PanelForge — preload bridge (S0.4).
//
// Restricted bridge: exposes an explicitly empty, frozen API object.
// The full allowlist lives in S0.4; this bridge is deliberately minimal
// so context isolation can be verified without opening IPC early.
// It exposes nothing privileged — only a frozen placeholder object.
//
// S0.4 note: no IPC methods are exposed yet; S0.5 adds a diagnostic method.

import { contextBridge } from "electron";

const api = Object.freeze({});

contextBridge.exposeInMainWorld("panelforge", api);
