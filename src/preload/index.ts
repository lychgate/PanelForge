// PanelForge — preload stub (S0.2).
//
// This file intentionally exposes NOTHING. It exists so the future restricted
// preload bridge (S0.3) has a stable path to build on, and so the initial
// BrowserWindow is created pointing at a preload from the start.
//
// It must not add: a renderer-visible bridge, electron passthrough,
// fs/path/require, or any IPC surface. S0.4 owns the IPC allowlist.
export {};
