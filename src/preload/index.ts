// PanelForge — preload bridge (S0.3).
//
// Restricted bridge: exposes an explicitly empty, frozen API object.
// The full allowlist lives in S0.4; this bridge is deliberately minimal
// so context isolation can be verified without opening IPC early.
// It exposes nothing privileged — only a frozen placeholder object.

import { contextBridge } from "electron";

const api = Object.freeze({});

contextBridge.exposeInMainWorld("panelforge", api);

