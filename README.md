# PanelForge

Local-first desktop application for creating illustrated stories, comics, graphic novels, and webtoons using a combination of traditional creative tools and AI-assisted production.

> **Authoritative spec:** [`Docs/PanelForge.pdf`](Docs/PanelForge.pdf) — Product & Technical Design Specification, v1.2 Consolidated Development Baseline, Approved for Development.
>
> **Operational record:** [`Docs/PanelForge-Task-Register.md`](Docs/PanelForge-Task-Register.md) — task register, decision log, and progress tracker. The spec remains the authoritative source of requirements; the register records how work proceeds against it.
>
> **Change history:** [`ChangeLog.md`](ChangeLog.md) — full task-by-task change history, updated as each task completes.

**Positioning:** A local-first comic studio built for creators, not just people with flagship GPUs. Generation may take longer on modest systems, but the process stays manageable through sequential processing, visible progress, resource-aware scheduling, and independently saved results. Primary hardware target: NVIDIA GTX 1660 Ti class systems (~6 GB VRAM). Initial platform: Linux Mint.

## Prerequisites

- Node.js >= 22.13 (required for built-in `node:sqlite`, unflagged in 22.13), npm >= 10
- Linux Mint (initial development platform)
- Git

## Quick start

```bash
npm install
npm run build      # compile TS to out/node (main/preload) + out/web (renderer) + copy index.html
npm start          # launch Electron (reads package.json "main": out/node/main/index.js)
npm run dev        # runs typecheck + baseline check (does NOT build or launch)
npm run typecheck  # TypeScript check for node + web projects
npm test           # runs Vitest (65 tests across baseline/security/ipc/config/logging/database/lifecycle)
npm run check      # verifies baseline + IPC allowlist guard (ipcMain only in registry, ipcRenderer only in preload)
npm run lint       # ESLint over TypeScript sources
```

Launch flow: `npm run build` → `npm start`. `npm start` is launch-only (`electron .`); it does not rebuild. `npm run dev` remains typecheck + baseline check only.

## Project layout (per §21 of the spec)

```
src/
  main/        Electron main process (BrowserWindow, startup wiring, lifecycle)
  preload/     Restricted preload bridge (allowlisted API only)
  renderer/    UI (no Node.js access; no raw IPC)
  core/
    config/    Centralized configuration service (settings location, atomic writes)
    logging/   Central logging service (rotating logs, redaction, error recording)
    lifecycle/ Application lifecycle service (ordered startup, cleanup hooks, events)
    ipc/       Centralized IPC allowlist + validation + dispatch (registry)
  engines/     LLM, image, analysis, export (Stage 2+, not started)
  modules/     manuscripts, characters, locations, objects, styles, storyboards, artwork, continuity, publishing
  database/    SQLite connection service, initial schema, migrations, serialized writes
  shared/      Shared types (IPC contracts) + interfaces
workflows/     ComfyUI workflow templates (Stage 7+)
resources/
tests/         baseline, security, ipc, config, logging, database suites
scripts/       check.js (baseline + IPC guard), copy-renderer-html.js, dev-check.js
Docs/          PanelForge.pdf (spec), PanelForge-Task-Register.md (operational record),
               PanelForge-Security-Baseline.md (S0.3 security baseline)
```

## User data locations

All application data lives under the Electron `userData` directory (resolved via `app.getPath("userData")`; in plain Node tests it falls back to `~/.config/panelforge`, and the `PANELFORGE_USER_DATA_DIR` environment variable overrides for probes/tests). No hardcoded machine-specific paths are used anywhere.

| Content | Location (relative to userData) | Since |
|---|---|---|
| Application settings | `config/config.json` (atomic tmp+rename, `0600`; defaults + corrupt-file backup + migration) | S0.6 |
| Application logs | `logs/panelforge.log` (JSON lines, redacted; per-file limit 512 KiB — when full, the active log rotates into `panelforge-1.log`, up to 3 rotated files are kept alongside the active log) | S0.7 |
| SQLite database | `database/panelforge.db` (WAL mode; backups to `database/backups/`) | S0.8 |

## IPC

Two allowlisted channels, both validated through the central registry (`src/core/ipc/registry.ts`) and exposed only via the frozen preload bridge:

- `panelforge:diagnostics.ping` — connectivity check
- `panelforge:diagnostics.get` — safe diagnostic payload (app/Electron/Node/platform/arch/timestamp)

The renderer has no raw IPC and no Node.js access (`contextIsolation`, `nodeIntegration: false`, `sandbox: true`; see [`Docs/PanelForge-Security-Baseline.md`](Docs/PanelForge-Security-Baseline.md)).

## Technology stack (per §14)

Electron, TypeScript, Node.js, SQLite, Drizzle ORM or equivalent, LM Studio (local LLM), ComfyUI (image generation), Sharp (image processing), SVG/Canvas (page composition), suitable PDF library, DOCX/EPUB/PDF parsers, Vitest + Playwright (testing), Electron Forge (packaging), Git.

**SQLite access (decided in S0.8, resolving D8/Q3):** Node's built-in `node:sqlite` (`DatabaseSync`) — verified available in both plain Node and Electron's bundled Node, so no new dependency or native rebuild is required. Drizzle may layer over this driver later. The database service applies `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000` at open, runs tracked migrations, serializes writes through a Core-Engine-owned queue, and can produce standalone backups.

## Development status

Stage 0 (Application Foundation) — mandatory sequence, one task at a time with owner review between tasks:

- **S0.1 — Repository and package baseline:** complete.
- **S0.2 — Electron application launch:** complete (secure-defaults window from first launch per Q2).
- **S0.3 — Secure BrowserWindow configuration:** complete (restricted bridge, navigation guards, security tests, baseline doc).
- **S0.4 — IPC Foundation:** complete (allowlist, typed contracts, handwritten validation, centralized registry).
- **S0.5 — Safe Diagnostic Operation:** complete (preload `diagnostics.get` + renderer test interface).
- **S0.6 — Configuration and User Paths:** complete (central `config/config.json` service; no hardcoded paths).
- **S0.7 — Logging and Error Handling:** complete (central log service; rotation, redaction, error recording).
- **S0.8 — SQLite Foundation:** complete (`node:sqlite` service; WAL/FK/busy timeout, migrations, serialized writes, backups).
- **S0.9 — Application Lifecycle Infrastructure:** complete (ordered startup steps + cleanup hooks + lifecycle events via `src/core/lifecycle/`).
- **S0.10 — Keyboard Shortcuts and Navigation Foundation:** **next, awaiting owner authorization** (shortcut registration, basic navigation structure, shortcut docs).

Remaining Stage 0 work after S0.9: S0.10–S0.12 (keyboard/navigation foundation, Linux packaging, verification/release prep). Stage 1 follows only after Stage 0 completes.

## Design principles (per §2, summary)

Local-first; user ownership; independent regeneration; preserve approved work (generations are new versions, never silent replacements); hardware accessibility (Small GPU Mode is first-class); transparent generation (no invented progress percentages); canon is not speculation (explicit / interpreted / AI-suggested / unknown kept distinct); small, independently testable development tasks.

## License

Private project. All rights reserved.
