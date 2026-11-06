# PanelForge — Security Baseline (S0.3)

Documents the Electron security defaults established in **S0.3**. S0.2 applied
these flags from the first window (Q2, owner-approved 2026-11-05); S0.3
**verifies them by tests, adds the restricted preload bridge, and records
the baseline here**. S0.4 owns the IPC allowlist; CSP is a documented
deferral (below).

> **Superseded notes (written as S0.3, read today):** the bridge is no
> longer empty — since S0.5 it exposes `diagnostics.get`, and the S0.4
> allowlist now covers the 9 registered channels (see
> `src/core/ipc/registry.ts`). The IPC guard in `scripts/check.js`
> enforces that `ipcMain` lives only in the registry and
> `ipcRenderer` only in preload. CSP remains deferred until the UI
> framework choice (see §4 and register D3).

## 1. webPreferences baseline (verified by tests)

| Flag | Value | Verified |
|---|---|---|
| `contextIsolation` | `true` | Static assertion in `tests/security.test.js` against `out/node/main/index.js` |
| `nodeIntegration` | `false` | Static assertion (same) |
| `sandbox` | `true` | Static assertion (same) |
| `webSecurity` | `true` | Static assertion (same) |
| `allowRunningInsecureContent` | `false` | Static assertion (same) |
| `preload` | `path.join(__dirname, "../preload/index.js")` | Static assertion |
| `devTools` | `!app.isPackaged` (enabled in dev, disabled in packaged builds) | Documented; packaged-build check deferred to S0.11 |
| Renderer Node access | None — `contextIsolation:true` + `nodeIntegration:false` + `sandbox:true` ensure renderer cannot `require('fs')`, `process`, `require`, etc. | Integration probe in `tests/security.test.js` (loads the Electron app and inspects the renderer world) |

## 2. Preload bridge

- `src/preload/index.ts` is the **restricted bridge**: it imports only
  `contextBridge` from Electron and exposes an explicitly empty, frozen
  object as `window.panelforge`.
  ```ts
  const api = Object.freeze({});
  contextBridge.exposeInMainWorld("panelforge", api);
  ```
- **The bridge is deliberately minimal.** No privileged operations are
  exposed in S0.3. The full **allowlist** (one method per operation,
  validation, centralized registration) is **S0.4's deliverable** (see D1).
  Adding methods now would absorb S0.4's scope.
- Preload path is resolved in main (`../preload/index.js` relative to
  `out/node/main/index.js`).

## 3. Navigation and external opens

| Handler | Behavior | Owner |
|---|---|---|
| `setWindowOpenHandler` | Deny; open external via `shell.openExternal(url)` | S0.3 |
| `will-navigate` | Allow only the local renderer `file:///` URL; `preventDefault` otherwise | S0.3 |
| `will-attach-webview` | `preventDefault` (no webviews) | S0.3 |

## 4. CSP — deferred (no meta CSP in S0.3)

**No CSP meta is added in S0.3.** Exact directives depend on the UI framework
choice (§14, left open) and on how Electron serves local assets. Per the
register D3 correction, `frame-ancestors` must be a header (not meta) and
`img-src file:` is too broad — the final policy will use a controlled local
asset loader. **Owner may approve the principle (restrictive, self-only);
exact directives are deferred to S0.3 + UI-framework / S0.11 work.** This
deferral is intentional and documented here so it isn't mistaken for
oversight.

## 5. Test coverage

Run via `npm test` (Vitest, same as baseline):

| Test | What it proves |
|---|---|
| `static: webPreferences flags present in compiled main` | Context isolation, disabled node integration, sandbox, webSecurity, insecure content off, preload path — all asserted against `out/node/main/index.js` |
| `static: preload exposes frozen empty api and no IPC bridge` | `Object.freeze({})` + `window.panelforge`; no `ipcRenderer`/`ipcMain` tokens in preload |
| `static: renderer has no Node.js access tokens` | `src/renderer/index.ts` contains no `require`/`process`/`fs`/`ipcRenderer` |
| `integration: renderer cannot access Node.js (probe)` | Launches Electron, evaluates in renderer world: `typeof require/fs/process/electron/window.panelforge` — fails if any `require`/`fs` exists |

## 6. What S0.3 does NOT do (boundaries)

- **No IPC allowlist** — S0.4.
- **No CSP meta** — deferred (above).
- **No packaged-build DevTools check** — S0.11 (Forge).
- **No config / logging / DB** — S0.6–S0.8.
