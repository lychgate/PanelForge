# PanelForge — Stage 0 Completion Report (S0.12)

**Date:** 2026-11-05 · **Authoritative spec:** `Docs/PanelForge.pdf` v1.2 · **Range:** S0.1–S0.12

Stage 0 (Application Foundation) is complete: a reliable Electron application with
secure architecture, configuration, logging, and database infrastructure — the
stop condition for this stage. Evidence below was re-run during S0.12 (all green
on the final tree); per-task history is in [`ChangeLog.md`](../ChangeLog.md) and
the task register (`Docs/PanelForge-Task-Register.md`, §§4/10–12).

## Completion checklist (per S0.12 acceptance)

- [x] **All Stage 0 tests pass** — `npm test`: **82 passed** (1 baseline + 12 config
      + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging
      + 7 ipc + 13 security), incl. two live Electron probes (renderer isolation,
      keyboard navigation). `npm run typecheck` + `npm run build` + `npm run check` green.
- [x] **No critical security or startup issues** — 13 security tests (secure
      `BrowserWindow` defaults, frozen preload bridge, renderer has no
      Node/require/fs/electron, only two allowlisted IPC channels with validated
      args); every task's live-launch verification closed clean with no stray processes.
- [x] **Linux build is repeatable** — `npm run build` → `npm run package`/`make`
      reproducibly produces `forge-out/panelforge-linux-x64/` +
      `panelforge_0.1.0_amd64.deb` + zip; the packaged binary **and the extracted
      `.deb`** both launched with the full lifecycle (`PanelForge starting →
      database ready (journal=wal, …) → startup complete → shutting down →
      shutdown complete`) with the app fully independent of the dev environment.

## What Stage 0 built

| Area | Delivered |
|---|---|
| App shell | Secure BrowserWindow, preload allowlist, Diagnostics/About navigation |
| IPC | `panelforge:diagnostics.ping/.get` — allowlist, typed contracts, validation inside the registry |
| Config | `<userData>/config/config.json` (atomic writes, defaults, corrupt backup, migration) |
| Logging | JSON-line logs at `<userData>/logs/panelforge.log`, 512 KiB × 4 files rotation, redaction |
| Database | `node:sqlite` at `<userData>/database/panelforge.db`, WAL + FK + busy 5000, tracked migrations, serialized writes, on-demand backup |
| Lifecycle | Ordered startup steps, reverse-order cleanup hooks, idempotent shutdown, lifecycle events |
| Packaging | Electron Forge `.deb` + zip, self-contained (no native modules), `forge-out/` gitignored |

## Known limitations (end of Stage 0)

Facts only — full detail in the README (Known limitations) and register (D1, D3, D10):

- CSP deferred to the UI-framework choice; DevTools enabled in dev builds only.
- No app icon yet; no auto-update exists (offline, local-first by design).
- `node:sqlite` experimental upstream; log rotation caps at 512 KiB × 4; DB backups on-demand only.
- Corrupted-DB recovery dialog deferred to S1.7 (D10) — currently a logged startup error, window still opens.
- `npm audit`: 5 vulns in the dev-only vitest→vite chain (fix needs a breaking upgrade; deferred).
- UI is the shell only (Diagnostics/About); Settings, Character Studio and ComfyUI are later stages.

## What's next — Stage 1 entry (not started)

Stage 1 (Project Management and Portable Storage) is the next milestone. Entry
candidates carry open decisions recorded in the register: **D5** (canonical-store
contradiction — blocks S1.1), **D6** (Character ≠ version ≠ asset modeling —
refines at S1.5/S1.4), and Stage 2–11 remain task groups needing expansion
(Needs Clarification). Nothing from Stage 1 was started during Stage 0.

## Verification evidence (S0.12 session, final tree)

```
[smoke] PASS — startup, artifacts, shutdown, no strays   (DISPLAY=:0 npm run smoke)
Test Files  9 passed · Tests  82 passed                  (DISPLAY=:0 npm test)
forge-out/make/deb/x64/panelforge_0.1.0_amd64.deb + .zip (electron-forge make)
packaged + extracted-.deb launches: starting → database ready (journal=wal) →
startup complete → shutting down → shutdown complete; no strays
```
