# ChangeLog

All notable changes to PanelForge are documented here.
Format follows Keep a Changelog (task sections under `## [Unreleased]` once a release is cut).
The operational task register [`Docs/PanelForge-Task-Register.md`](Docs/PanelForge-Task-Register.md)
remains the authoritative progress record; this file summarizes what each task changed.

## [Unreleased]

### S0.11 — Initial Packaging (2026-11-05) — [`23b7897`](https://github.com/lychgate/PanelForge/commit/23b78973c7492166c2e84cdf4a22ab66d19318b4)

**Added**

- `forge.config.js` — Electron Forge packaging configuration (spec §14): `outDir:
  "forge-out"` (kept separate from the compiled `out/` app, which the packager
  would otherwise exclude), `.deb` maker, zip fallback, `ignore` list plus a
  `packageAfterCopy` cleanup hook that deterministically removes sources, tests,
  docs and probe scripts so the package ships only what the runtime needs.
- `.gitignore`: `forge-out/`.
- `vitest.config.js` — excludes `forge-out/**` and `out/**` from test collection
  (packaged copies of the app otherwise get collected as tests).
- `tests/packaging.test.js` — 5 tests (deb maker, outDir collision guard, scripts,
  no native add-ons, forge-out gitignored).

**Changed**

- `package.json`: `package` and `make` scripts; `@electron-forge/cli`,
  `@electron-forge/maker-deb`, `@electron-forge/maker-zip` devDependencies.
  (Two issues found during packaging and fixed: Forge's default `out/` output
  dir would have excluded the compiled app; the packager `ignore` regexes are
  best-effort here, hence the `packageAfterCopy` cleanup.)
- Verified: runnable package + `.deb`/`.zip` built; packaged binary and the
  extracted `.deb` both launched with the full lifecycle independently of the
  development environment (no native modules — `node:sqlite` is built-in).
- Register: S0.11 marked **Complete**; §11 next task is S0.12.
- `Plan.md`: S0.11 checked off (2026-11-05).

### S0.10 — Keyboard Shortcuts and Navigation Foundation (2026-11-05) — [`70c53e3`](https://github.com/lychgate/PanelForge/commit/70c53e37a475a44d2256a63052c44f849ccb1bb6)

**Added**

- `src/renderer/shortcuts.ts` — DOM-free shortcut registry (`createShortcutRegistry`):
  combo normalization (`Alt+1` → `alt+1`), exact `KeyInput` matching, duplicate
  id/combination rejection. Imported via dynamic `import()` in tests (ESM output).
- `src/renderer/navigation.ts` — DOM-free view manager (`createNavigation`):
  ordered views, single current view, unknown-view rejection.
- Renderer shell: Diagnostics + About views (both rendered from the S0.5 payload),
  named `.js`-suffixed ESM imports; `index.html` gains a labelled `<nav>`,
  `<main>`, and a visible `:focus-visible` outline so core navigation works with
  `Tab` + `Enter`.
- Application menu (main): File → Quit (`CmdOrCtrl+Q`), View → Reload
  (`CmdOrCtrl+R`) — accelerators work even when focus is not in the renderer.
- `Docs/PanelForge-Shortcuts.md` — shortcut documentation (`Alt+1`/`Alt+2`,
  `Tab`, `Ctrl+Q`, `Ctrl+R`).
- `tests/shortcuts.test.js` — 12 tests including a **live probe** that launches
  Electron and dispatches synthetic `Alt+2`/`Alt+1` keydown events against the
  real renderer, asserting the view switches without any mouse interaction.

**Changed**

- Register: S0.10 marked **Complete**; §11 next task is S0.11.

### S0.9 — Application Lifecycle Infrastructure (2026-11-05) — [`aa2d0b1`](https://github.com/lychgate/PanelForge/commit/aa2d0b117f9c6f9b9936cb7b584a2588e59927e0)

**Added**

- `src/core/lifecycle/service.ts` — application lifecycle service
  (`createLifecycleService` / `defaultLifecycleService`): ordered, failure-isolated
  startup steps with summaries; reverse-order, failure-isolated cleanup hooks;
  idempotent `shutdown()`; state machine
  `idle → starting → ready → shutting-down → closed`; broadcast
  `startup:step`/`startup:complete`/`shutdown:step`/`shutdown:complete` events.
  Dependency-free (steps/hooks are callbacks), so it unit-tests in plain Node.
- `tests/lifecycle.test.js` — 10 tests: step order, async steps, failing-step
  isolation, state transitions, event broadcast, reverse-order cleanup,
  failing-hook isolation, idempotent shutdown, main wiring.

**Changed**

- Main: startup rewired through lifecycle steps
  (`ipc → config+logging → database`); `registerCleanup("database")`;
  `before-quit` triggers `shutdown()`; a synchronous
  `PanelForge shutting down` entry is written first so the trace survives exit
  timing, followed by the best-effort `shutdown complete` summary. Window
  creation still happens unconditionally after startup completes (in the
  `whenReady` callback — unchanged behavior).
- Register: S0.9 marked **Complete**; §11 next task is S0.10.

### S0.8 — SQLite Foundation (2026-11-05) — [`c7bbc8c`](https://github.com/lychgate/PanelForge/commit/c7bbc8c689e124ab41149b2c413b5ab2d2aa1f2d)

**Added**

- `src/database/service.ts` — centralized SQLite service (`createDatabaseService` /
  `defaultDatabaseService`) using Node's built-in `node:sqlite` (`DatabaseSync`).
  Database at `<userData>/database/panelforge.db`; no new dependency, no native build;
  D8/Q3 library decision recorded. Verified available in plain Node 22.23.1 and
  Electron 45's bundled Node 24.22.2.
- Required pragmas applied at open: `journal_mode=WAL`, `foreign_keys=ON`,
  `busy_timeout=5000`.
- Migration mechanism: in-code numbered migrations (forward-only) tracked in the
  `schema_migrations` table and auto-run on open; initial migration `001_initial`
  creates `schema_migrations` + a minimal `kv_store` smoke table.
- Serialized writes: Core-Engine-owned write queue (arrival order, one writer at a
  time), `transaction()` with `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`, and busy/locking
  retries (max 3).
- `backupDatabase()` producing a standalone copy under `database/backups/`
  (consistent snapshot; automatic scheduling deferred).
- `tests/database.test.js` — 10 tests: pragmas, migration recording + no re-apply,
  persistence across restarts, 20 concurrent writes → count 20, FK enforcement,
  transaction rollback, readable backup, query-before-init failure, no hardcoded
  paths, main wiring.
- Main: database initialization on startup (ready entry logged) and close on
  `before-quit`. `tsconfig.node.json` include extended to `src/database/**/*.ts`.

**Changed**

- Startup failure handling: a failed database initialization is recorded via
  `logError` and never blocks the window from opening.
- Register: S0.8 marked **Complete**; Q3 (SQLite library) marked Decided
  (`node:sqlite`); §11 next task is S0.9.

### S0.7 — Logging and Error Handling (2026-11-05) — [`38015a1`](https://github.com/lychgate/PanelForge/commit/38015a159ab3e028976473247ee5effe81b899f5)

**Added**

- `src/core/logging/service.ts` — central logging service
  (`createLogService` / `defaultLogService`). JSON-line entries
  `{timestamp, level, message}` at `<userData>/logs/panelforge.log` (mode `0600`).
- Levels `debug`/`info`/`warn`/`error` with minimum-level filtering (default `info`;
  set from the S0.6 config `logLevel` at startup).
- Size-limited rotation: 512 KiB active log rotates into
  `panelforge-1.log` … `panelforge-3.log`; the oldest backup is deleted.
- Redaction as implemented: `token=`/`password=`/secret-like `key=value` patterns are
  replaced with `[REDACTED]`, the home directory path is replaced with `<home>`,
  and entries longer than 1024 characters are truncated. Message content not
  matching these patterns is logged as-is.
- `logError()` records Error name + message in the same entry shape (no stacks).
  Logging never throws.
- `tests/logging.test.js` — 12 tests: entry shape/location, min-level filtering,
  error recording without stacks, rotation within the size limit (test limits),
  redaction, message capping, never-throws, no hardcoded paths, main/registry wiring.

**Changed**

- Main: startup records `PanelForge starting` through the log service; the config
  failure path now routes through `logError` instead of `console.error`.
- IPC registry: handler failures are recorded via `logError`; the renderer
  envelope is unchanged (`HANDLER_ERROR`, no sensitive detail).
- Register: S0.7 marked **Complete**; §11 next task is S0.8.

### S0.6 — Configuration and User Paths (2026-11-05) — [`913d575`](https://github.com/lychgate/PanelForge/commit/913d575b5a94c7dcccd1eb055cd591372ea518cd)

**Added**

- `src/core/config/service.ts` — centralized configuration service
  (`createConfigService` / `defaultConfigService`). Settings at
  `<userData>/config/config.json`; userData via `app.getPath("userData")`
  (`PANELFORGE_USER_DATA_DIR` override for tests, `~/.config/panelforge` fallback
  outside Electron) — never a hardcoded machine-specific path.
- `CONFIG_VERSION=1` with defaults
  `{theme:"system", logLevel:"info", launchAtStartup:false, diagnosticsEnabled:true}`.
- Safe I/O: missing file → defaults; corrupt JSON → timestamped `.bak-` backup +
  defaults; older versions migrated by filling current defaults; atomic writes
  (tmp + rename, `0600`); traversal guard in `getUserDataSubPath()`.
- API: `ensureConfigDir`, `loadConfig`, `saveConfig`, `updateConfig`,
  `resetConfig` (settings file is only created on first save/update/reset;
  startup creates the directory and loads — it does not write defaults).
- `tests/config.test.js` — 12 tests: defaults, settings location, round-trip,
  atomicity, corrupt backup, migration, traversal guard, no hardcoded paths,
  main wiring.

**Changed**

- Main: calls `ensureConfigDir()` + `loadConfig()` in `app.whenReady`
  (try/catch; failures never block the window).
- Register: S0.6 marked **Complete**; §11 next task is S0.7.

### S0.5 — Safe Diagnostic Operation (2026-11-05) — [`95da22b`](https://github.com/lychgate/PanelForge/commit/95da22be0e0da5e791a1ea633558a1000f6dae1e)

**Added**

- `panelforge:diagnostics.get` IPC handler returning
  `{appName, electronVersion, nodeVersion, platform, arch, channel, timestamp}`.
- Preload frozen `diagnostics.get()` wrapping `ipcRenderer.invoke` for the single
  approved channel.
- Renderer: calls the bridge on load and renders `#diagnostic-status`
  (`index.html` switched to `<script type="module">` so ESM loads).

**Changed**

- `tests/ipc.test.js` extended with diagnostics.get cases (7 tests);
  `tests/security.test.js` verifies the bridge diagnostic call.

### S0.4 — IPC Foundation (2026-11-05) — [`8026da3`](https://github.com/lychgate/PanelForge/commit/8026da3416f7619a638faddfd0969c35f8e38de8)

**Added**

- `src/core/ipc/registry.ts` — the only place `ipcMain.handle` is called:
  frozen channel allowlist, argument validation, and the safe
  `IpcResult<T>` envelope (`{ok:true,data}` / `{ok:false,code,message}`).
- `src/shared/types/index.ts` — `SafeErrorCode`, `IpcResult<T>`, `IpcRequest<TArgs>`,
  `DiagnosticsPingArgs/Data`.
- `tests/ipc.test.js` — 6 tests (allowlist, `INVALID_ARGUMENTS`, envelope).

**Changed**

- Main calls `registerIpcHandlers()` at startup; no direct `ipcMain.handle` in main.
- `scripts/check.js` IPC guard: `ipcMain` only in the registry.

### S0.3 — Secure BrowserWindow Configuration (2026-11-05) — [`4c8d10b`](https://github.com/lychgate/PanelForge/commit/4c8d10b5582e67b9317fb1ce2e4e279208d7520e)

**Added**

- `Docs/PanelForge-Security-Baseline.md` — security baseline document.
- `tests/security.test.js` — 12 static checks + live renderer probe
  (`hasRequire:false, hasProcess:false, hasFs:false, hasElectron:false, hasPanelforge:true`).
- Restricted preload bridge: frozen empty `window.panelforge` via `contextBridge`.
- Navigation guards (local file only) and window-open deny handler.

**Changed**

- `devTools: !app.isPackaged` (enabled in dev, disabled in packaged builds).
- `scripts/check.js` guard updated for the bridge (comments stripped before grep).
- CSP intentionally deferred (decided with the UI framework choice).

### S0.2 — Electron Application Launch (2026-11-05) — [`0d73f1a`](https://github.com/lychgate/PanelForge/commit/0d73f1aff014129b089f04b7972e182f501a9e47)

**Added**

- `electron` devDependency (only dependency added by S0.2).
- `src/main/index.ts` — main process; secure BrowserWindow defaults from the first
  launch (Q2): `contextIsolation`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity`, `allowRunningInsecureContent: false`.
- `src/renderer/index.html` + `index.ts` — initial renderer.
- `src/preload/index.ts` — inert stub (no IPC yet; zero-IPC grep verified).
- `scripts/copy-renderer-html.js` (built-in `fs`/`path` only) so the renderer HTML
  is copied by `build`; canonical launch is `electron .` via `package.json`
  `main: out/node/main/index.js`.

**Changed**

- `package.json`: `start: electron .`; `build` appends the HTML copy;
  `npm run dev` remains typecheck + baseline check only, `start` launch-only.
- `tsconfig` `rootDir: src` fixed the renderer output path to
  `out/web/renderer/`.
- Register: S0.2 marked **Complete** (register [`dd38b88`](https://github.com/lychgate/PanelForge/commit/dd38b8878f2964058caff275f6b42b2137c5179f)).

### S0.1 — Repository and Package Baseline (2026-11-05) — [`55853fb`](https://github.com/lychgate/PanelForge/commit/55853fb7de4f7f02a5ea4c725a9f4eb5f9ee25bf)

**Added**

- Git repository root with private `package.json` (`name: panelforge`).
- Split `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json`.
- `.gitignore` (node_modules, out, logs, env/secrets, models, temp) and `README.md`.
- `src/` scaffolding (main/preload/renderer/core/engines/modules/database/shared
  placeholders).
- `scripts/check.js`, `scripts/dev-check.js`, and `tests/baseline.test.js`.
- Dependencies: `typescript`, `vitest`, `eslint` only — no database, Electron,
  or AI packages (D8/Q3 deferred to S0.8).

**Changed**

- Register: S0.1 marked **Complete** (register [`e1e14e8`](https://github.com/lychgate/PanelForge/commit/e1e14e86b48442a9fdd4331ce2aac40f53c5d59d)); register v3.1
  corrections recorded (Q2 approved, Q3/Q4/Q5 deferred, S1.5a removed from the
  implementation sequence, one-task-at-a-time promoted to approved protocol).
