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
npm test           # runs Vitest (565 tests across baseline/security/ipc/config/logging/database/lifecycle/shortcuts/packaging/project+metadata+operations+paths+assets+integrity+atomic+backup+portability+interface+stage1-fixture+provider-contract+task-records+task-queue+task-transitions+task-pause+task-retry+task-progress+queue-recovery+lmstudio+comfyui+comfyui-client+provider-health+mock-provider+resource-profiles+hardware-detection+telemetry-adapter+telemetry-failure+cooling-down+small-gpu+manuscripts+text-normalize+chapters+scenes+relationships+entities+canon+docx-import+epub-import+pdf-import+art-styles+style-persistence+style-variants+stage3-fixture+characters+character-versions+version-references+completeness+tier-config+entity-bridge+version-binding+approval+generation-requests+version-comparison+history+stage4-fixture+locations+location-variations+location-references+objects+object-variations+object-references+location-object-bridge+studio-requests+studio-history+stage5-fixture+storyboard-scenes+storyboard-panels+panel-assignments+panel-location-assignments+panel-cameras+panel-positions+panel-text+scene-style+panel-instructions+snapshots+storyboard-ui+composition-review+stage6-fixture+workflow-templates+prompt-assembly+negative-prompts+reference-conditioning+panel-generation+variations+inpaint+outpaint+aspect-ratios+comparison+provenance)
npm run check      # verifies baseline + IPC allowlist guard (ipcMain only in registry, ipcRenderer only in preload)
npm run lint       # ESLint over TypeScript sources
npm run package    # Electron Forge package → forge-out/panelforge-linux-x64/ (runnable build)
npm run make       # Electron Forge make → forge-out/make/ (.deb + .zip)
npm run smoke      # end-to-end launch smoke test (requires DISPLAY; run npm run build first)
```

Launch flow: `npm run build` → `npm start`. `npm start` is launch-only (`electron .`); it does not rebuild. `npm run dev` remains typecheck + baseline check only.

## Packaging (S0.11)

Linux packaging uses Electron Forge (`forge.config.js`). Run `npm run build` first — Forge packages the project as-is. The Forge output dir is `forge-out/` (not the compiled `out/`), and packaged artifacts are gitignored:

```bash
npm run package    # dev build: forge-out/panelforge-linux-x64/panelforge
npm run make       # packaged builds: .deb (installable) + .zip fallback
```

The packaged application is self-contained (no native modules — `node:sqlite` is built into Node) and launches independently of the development environment. Both the packaged directory and the extracted `.deb` were launch-verified with the full startup/shutdown lifecycle in S0.11.

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
- **S0.10 — Keyboard Shortcuts and Navigation Foundation:** complete (shortcut registry, Diagnostics/About navigation, application menu; see [`Docs/PanelForge-Shortcuts.md`](Docs/PanelForge-Shortcuts.md)).
- **S0.11 — Initial Packaging:** complete (Electron Forge config; runnable package + installable `.deb`/`.zip`; packaged binary launch-verified).
- **S0.12 — Stage 0 Verification:** complete (smoke test, repeatable Linux build, full suite + packaged launch re-verified).

**Stage 0 is complete.** Its completion report is [`Docs/PanelForge-Stage0-Completion.md`](Docs/PanelForge-Stage0-Completion.md).

**Stage 1 in progress:**

- **S1.1 — Project Folder Format:** complete (full §7.1 folder tree, `project.json` version marker + minimal metadata, `identifyProject`/version-check; see [`Docs/PanelForge-Project-Format.md`](Docs/PanelForge-Project-Format.md)).

- **S1.2 — Project Metadata Schema:** complete (`projects` table in `database/project.db`: project ID, name/description, created/updated timestamps; marker stays the identity — see `Docs/PanelForge-Project-Format.md`).

- **S1.3 — Basic Project Operations:** complete (create, list, open, close, rename, archive with open-set exclusivity and typed errors).

- **S1.4 — Relative Asset Path Service:** complete (canonical relative resolution, normalization, traversal + symlink-escape rejection — see `Docs/PanelForge-Project-Format.md`).

- **S1.5 — Asset Registry:** complete (UID-identified rows in `database/project.db`, SHA-256 hashes, import/copy operations).

- **S1.6 — Asset Integrity Checking:** complete (missing/modified detection with hash-verified integrity reports).

- **S1.7 — Atomic Metadata Operations:** complete (fsync-backed writes, transaction batches with rollback, corruption recovery preserving `.bak-*`, WAL-checkpoint autosave).

- **S1.8 — Backup and Snapshot System:** complete (in-project snapshots with hash manifests, external backups, verified restore into fresh targets, retention pruning).

- **S1.9 — Project Portability Test:** complete (automated portability proof: copy/move to new paths, path + integrity verification, no absolute paths stored).

- **S1.10 — Basic Project Interface:** complete (Projects view with create/list/open/close/rename/archive over `panelforge:project.*` IPC; library dir `<userData>/projects`).

- **S1.11 — Stage 1 Test Fixture:** complete (end-to-end lifecycle fixture: sample project created, copied, reopened, backed up, restored, and verified).

**Stage 1 is complete.** Its fixture gates the Stage 1 stop condition and now fails if any subsystem regresses.

**Stage 2 in progress:**

- **S2.1 — Provider Interface Definitions:** complete (adapter contract execute/interrupt/progress/health, task types, error taxonomy; no real provider code).

- **S2.2 — Persistent Task Records:** complete (`tasks` table in the app DB, 12 §11.1 states, JSON params, persisted across restarts).

- **S2.3 — Task Queue:** complete (FIFO executor dispatch, failure isolation, crash resume to queued).

- **S2.4 — Task State Transitions:** complete (allowed transition graph + typed guards; the queue runs through the guarded path).

- **S2.5 — Pause and Cancellation:** complete (mid-flight pause/cancel with best-effort interruptors; no resurrection; resume re-queues).

- **S2.6 — Retry Handling:** complete (bounded retries with backoff, failed-only, siblings untouched).

- **S2.7 — Progress Reporting:** complete (§11.2 status view per task; estimates only when supplied, never fabricated).

- **S2.8 — Queue Persistence and Recovery:** complete (startup `recoverQueue` re-queues interrupted work; idempotent; logged as `queue recovered`).

- **S2.9 — LM Studio Connection Adapter:** complete (OpenAI-compatible streaming completions, typed errors, graceful absence).

- **S2.10 — ComfyUI Connection Adapter:** complete (prompt submission, history polling, image fetch, typed errors, graceful absence).

- **S2.11 — Provider Health Checks:** complete (adapter probes with caches/timestamps + a gate so unhealthy providers never receive work).

- **S2.12 — Mock Provider Testing:** complete (scripted success/failure/slow/varied-progress mocks drive the full create→recover acceptance without real providers).

- **S2.13 — Resource Profiles:** complete (Safe/Balanced/Performance/Custom queue concurrency + memory policy constrains the executor; oversized tasks park instead of dispatching).

- **S2.14 — Hardware Detection:** complete (startup probe of GPU/VRAM/RAM/CPU/backends/services/monitoring, each signal typed Detected/Unavailable/Unknown).

- **S2.15 — Telemetry Adapter Interface:** complete (registry + OS/NVIDIA adapters sampling typed metrics; detection monitoring reflects registered adapters).

- **S2.16 — Graceful Telemetry Failure:** complete (dead telemetry → Unknown everywhere, conservative scheduling clamp, explicit unavailable indicator; app stays fully usable).

- **S2.17 — Cooling Down State:** complete (soft/hard thermal thresholds block new dispatch; generating tasks cooperatively cool and resume).

- **S2.18 — Small GPU Mode:** complete (1024-capped sequential envelope with release hooks; OOM retries downsize and fall back to CPU; approved art never replaced).

**Stage 2 complete (18 of 18, 2026-11-05).** Stage acceptance — create → persist → execute → interrupt → resume → recover — passes against mocks with real adapters wired behind health gates and resource policy. **Stage 3 complete (14 of 14, 2026-11-06).** **Stage 4 complete (12 of 12, 2026-11-06).** **Stage 5 complete (10 of 10, 2026-11-06).** **Stage 6 complete (13 of 13, 2026-11-06) — gate passes on the real book: a scanned TestData chapter is OCR'd once, storyboarded end-to-end, snapshotted/branched/restored, and reviewed clean, with approved artwork byte-identical.** Stage 7 expanded to S7.1–S7.15 (owner-authorized planning 2026-11-06; S7.14 engine provisioning added 2026-11-06, fixture renumbered to S7.15), implementation awaits owner authorization of S7.1. Stages 8/9 expanded to S8.1–S8.14/S9.1–S9.12 (owner-authorized planning 2026-11-06). See `Docs/PanelForge-Task-Register.md` §4E.

## Known limitations (end of Stage 0)

- **CSP is deferred.** The S0.3 baseline relies on context isolation + sandbox + allowlisted preload; the Content Security Policy will be finalized with the UI framework choice (see `Docs/PanelForge-Security-Baseline.md` and D3 in the task register).
- **No application icon yet** (`.deb`/packaged builds ship without an icon).
- **DevTools are enabled in dev builds** (`!app.isPackaged`) and disabled in packaged builds — normal Electron dev behavior, not a vulnerability.
- **`node:sqlite` is flagged experimental by Node** (may change upstream); PanelForge uses it as its SQLite access layer, recorded in `ChangeLog.md` under S0.8.
- **Log rotation caps at 512 KiB per file + 3 rotated backups.** There is no scheduled backup policy yet; the database service exposes on-demand `backupDatabase()` only.
- **Corrupted-database recovery dialog is deferred** to S1.7 (D10) — a corrupted database currently surfaces a logged startup error (the window still opens).
- **UI is the app shell only:** Diagnostics and About views; Settings, Character Studio and ComfyUI integration are later tasks. `npm audit` reports 5 vulnerabilities in the dev-only `vitest → vite` dependency chain (esbuild/tinypool/vite-node); fixing requires a breaking `vitest` upgrade and is deferred.

Full Stage 0 status: [`Docs/PanelForge-Stage0-Completion.md`](Docs/PanelForge-Stage0-Completion.md).

## Design principles (per §2, summary)

Local-first; user ownership; independent regeneration; preserve approved work (generations are new versions, never silent replacements); hardware accessibility (Small GPU Mode is first-class); transparent generation (no invented progress percentages); canon is not speculation (explicit / interpreted / AI-suggested / unknown kept distinct); small, independently testable development tasks.

## License

Private project. All rights reserved.
