# ChangeLog

All notable changes to PanelForge are documented here.
Format follows Keep a Changelog (task sections under `## [Unreleased]` once a release is cut).
The operational task register [`Docs/PanelForge-Task-Register.md`](Docs/PanelForge-Task-Register.md)
remains the authoritative progress record; this file summarizes what each task changed.

## [Unreleased]

### S2.6 — Retry Handling (2026-11-05) — [`1b8cbbe`](https://github.com/lychgate/PanelForge/commit/1b8cbbeb608c9dabee527869972ab19f21ba0350)

**Added**

- `src/engines/tasks/retry.ts` — `retryTaskWithPolicy(store, queue, taskId, policy)`:
  bounded attempts (`maxAttempts`), exponential backoff (`backoffMs × 2^(n-1)`),
  failed-only guard, typed `RetryError` codes. Deferred: none — retries are
  explicit, never automatic storms.
- `TaskQueue.runTask(taskId)` — single-task execution (needed by retry); the
  `runNext` path now shares the same `executeOne` core.
- `tests/task-retry.test.js` — 6 tests: flaky-then-ok within budget, permanent
  failure stops after N, sibling isolation, INVALID_STATE/NOT_FOUND/INVALID_POLICY,
  no hardcoded paths.

**Changed**

- Sibling isolation is structural (only the retried task re-queues).
- Register: S2.6 marked **Complete**; §11 next task is S2.7.
- `Plan.md`: S2.6 checked off (2026-11-05).

### S2.5 — Pause and Cancellation (2026-11-05) — [`4f51ecb`](https://github.com/lychgate/PanelForge/commit/4f51ecbee42019679212df27590eee0ba18bb6fc)

**Added**

- `src/engines/tasks/queue.ts` — `pauseTask`/`cancelTask`/`resumeTask` with an
  optional per-type `InterruptorMap` (S2.1 interrupt contract, best-effort),
  plus a no-resurrection settle: an interrupted task's late executor result is
  ignored, so pause/cancel wins and cancelled tasks stay cancelled.
- `tests/task-pause.test.js` — 7 tests: in-flight pause + resume, in-flight
  cancel + no resurrection, interruptor call capture, queued pre-start pause,
  NOT_FOUND/terminal rejection, cancel-while-queued never executes.

**Changed**

- Transition graph: `queued → paused` added (pausing before start; resumes
  through the existing `paused → queued`); `preparing`/`loading-model → complete`
  added (fast executors that report no intermediate stages complete directly —
  §11: not every provider walks every state).
- Register: S2.5 marked **Complete**; §11 next task is S2.6.
- `Plan.md`: S2.5 checked off (2026-11-05).

### S2.4 — Task State Transitions (2026-11-05) — [`ba43acf`](https://github.com/lychgate/PanelForge/commit/ba43acf59440da15ce857fd84f2861b695d0c3ac)

**Added**

- `src/engines/tasks/transitions.ts` — the allowed transition graph over the 12
  states, `canTransition`/`allowedNextStates`, and the guarded
  `transitionTask()` (`TransitionError` with `INVALID_TRANSITION`/`NOT_FOUND`;
  complete/cancelled terminal; running states may crash-resume to queued).
- `tests/task-transitions.test.js` — 7 tests: happy-path walk, illegal-edge
  rejection, retry/cancel semantics, unknown-state/task codes, graph queries.

**Changed**

- The queue now drives state changes through `transitionTask()` (S2.3 stays green
  against the guards); the progress→generating transition is awaited before the
  final transition (fixed a fire-and-forget race it had).
- Register: S2.4 marked **Complete**; §11 next task is S2.5.
- `Plan.md`: S2.4 checked off (2026-11-05).

### S2.3 — Task Queue (2026-11-05) — [`c745a09`](https://github.com/lychgate/PanelForge/commit/c745a090c40cd866a4cbc13fe12a28efe4c3e5fd)

**Added**

- `src/engines/tasks/queue.ts` — sequential executor dispatch
  (`createTaskQueue(store, executors)`): `enqueue`, `runNext`, `runUntilIdle`,
  `resumeInterrupted` (running states reset to queued). Drives
  `queued → preparing → generating → complete/failed`; a failed task never
  aborts the queue (failure isolation, §11.4); tasks without a registered
  executor fail closed.
- `tests/task-queue.test.js` — 9 tests: FIFO order and completion, empty
  queue, failure isolation, `ok:false` handling, fail-closed, progress
  callbacks, resume-to-queued, persisted-restart execution, no hardcoded paths.

**Changed**

- `src/engines/tasks/store.ts`: task listing is ordered by insertion (rowid)
  so FIFO order is deterministic even within the same millisecond.
- No real providers yet (S2.9–S2.10); pause/cancel/retry and transition
  ownership land in S2.5/S2.6/S2.4.
- Register: S2.3 marked **Complete**; §11 next task is S2.4.
- `Plan.md`: S2.3 checked off (2026-11-05).

### S2.2 — Persistent Task Records (2026-11-05) — [`ca9b34c`](https://github.com/lychgate/PanelForge/commit/ca9b34c9d1e95fc8232ea5077314b3be46067e2f)

**Added**

- `src/engines/tasks/store.ts` — persistent task records in the app database:
  `createTask` / `getTask` / `listTasks` / `setState` over the `tasks` table
  (UUID task_id, task_type, 12 §11.1 states as machine strings, JSON params,
  optional project link, created/updated timestamps; `defaultTaskStore` singleton).
- `tasks` table via app DB migration 002 (`002_tasks`).
- `tests/task-records.test.js` — 7 tests: create/get roundtrip, restart
  persistence, state updates, all 12 states, typed errors, list order.

**Changed**

- `tests/database.test.js`: migration list now asserts `002_tasks`.
- Records layer only — queueing/execution arrive with S2.3+, transition
  ownership with S2.4.
- Register: S2.2 marked **Complete**; §11 next task is S2.3.
- `Plan.md`: S2.2 checked off (2026-11-05).

### S2.1 — Provider Interface Definitions (2026-11-05) — [`c44c989`](https://github.com/lychgate/PanelForge/commit/c44c9894ebed259b109eebf15e091ce39fdac816)

**Added**

- `src/engines/provider/types.ts` — the adapter contract: `ProviderAdapter`
  (execute/interrupt/health), task types (`text`/`image`), progress stages,
  `ProviderErrorCode` (7 codes), health statuses
  (`ready`/`unavailable`/`unknown`), runtime validators, `listTaskTypes`.
  Progress percentages are only valid when measured (finite 0–100); the
  contract rejects invented values. No real provider code; zero
  renderer/UI/Electron/network imports.
- `tests/provider-contract.test.js` — 7 tests: fake-adapter conformance,
  progress/health/result validation, code taxonomy, dependency-free source.

**Changed**

- Register: S2.1 marked **Complete**; §11 next task is S2.2.
- `Plan.md`: S2.1 checked off (2026-11-05).

### S1.11 — Stage 1 Test Fixture (2026-11-05) — [`682d753`](https://github.com/lychgate/PanelForge/commit/682d753311c66ac23bed1290a4a38ed198038a03)

**Added**

- `tests/stage1-fixture.test.js` — 2 tests: one sample project exercises the
  whole Stage 1 lifecycle (create → identify → list/metadata → import asset →
  integrity → copy → reopen at a new path → snapshot → restore (integrity ok) →
  rename → archive), plus a gate test that ends with zero missing or modified
  assets. No production code changed.
- `Docs/PanelForge-Project-Format.md`: fixture section.

**Changed**

- Register: S1.11 marked **Complete**; **Stage 1 is complete**; §11 next task is S2.1.
- `Plan.md`: S1.11 checked off (2026-11-05); Stage 1 marked complete.

### S1.10 — Basic Project Interface (2026-11-05) — [`31aa931`](https://github.com/lychgate/PanelForge/commit/31aa931bb348284b19341ed2c96ff604f09f4d79)

**Added**

- Six project IPC channels (`panelforge:project.{create,list,open,close,rename,archive}`):
  validated args, S1.3 operations under the Core-owned manager, and preserved
  typed envelope codes. Optional `parentDir` (defaults to main-resolved
  `<userData>/projects`, so the renderer never deals in absolute paths).
- Preload frozen `project.*` bridge + Projects view (create form, list,
  open/close/rename/archive, `Alt+3`) with `aria-current` focus management.
- `tests/ipc.test.js` now 9 tests (8-channel allowlist, full round-trip through
  the envelope, typed codes) and `tests/project-interface.test.js` (5 tests,
  including a live renderer probe driving `Alt+3`).

**Changed**

- `SafeErrorCode` extended with project operation codes.
- Register: S1.10 marked **Complete**; §11 next task is S1.11.
- `Plan.md`: S1.10 checked off (2026-11-05).

### S1.9 — Project Portability Test (2026-11-05) — [`78e1949`](https://github.com/lychgate/PanelForge/commit/78e1949c0ab19cc835b28c3d5ec3b285003ceb62)

**Added**

- `tests/portability.test.js` — 5 tests proving the portability proof: a project
  copied to a different directory path (different nesting depth) opens normally
  (identify + metadata + list + asset integrity, all via the standard APIs);
  a moved project still opens after the original is deleted; the marker and
  database rows contain no machine-specific absolute paths; the operations list
  works at the new location; identity and metadata survive the move unchanged.

**Changed**

- No production code changed — S1.9 is the test itself.
- Register: S1.9 marked **Complete**; §11 next task is S1.10.
- `Plan.md`: S1.9 checked off (2026-11-05).

### S1.8 — Backup and Snapshot System (2026-11-05) — [`24246a5`](https://github.com/lychgate/PanelForge/commit/24246a56eb172c9c9b0716a8d81d10a5955addbb)

**Added**

- `src/core/project/backup.ts` — snapshots inside the project
  (`backups/snapshots/<id>/` with `project.json`, `project.db`, `files/`, and a
  `manifest.json` byte-hash map), external backups (snapshot copied out of the
  project), `verifySnapshot` (manifest byte-hash comparison: missing/modified
  reported), `restoreSnapshot` (copy into a fresh target — never over the
  original — then identify + integrity verification), and explicit retention
  (`pruneSnapshots(keep)`).
- `tests/backup-snapshot.test.js` — 9 tests: snapshot structure and manifest,
  clean verification, tamper detection, restore-then-integrity with the original
  undamaged, refusal of tampered/occupied/self restores, external backup copy,
  retention pruning, NOT_FOUND.

**Changed**

- Format/retention/restore semantics are engineering judgment where the spec is
  silent (documented in the module header): full copies, no dedup, explicit
  pruning, fresh-target restores only.
- Register: S1.8 marked **Complete**; §11 next task is S1.9.
- `Plan.md`: S1.8 checked off (2026-11-05).

### S1.7 — Atomic Metadata Operations (2026-11-05) — [`a3d9141`](https://github.com/lychgate/PanelForge/commit/a3d9141699fd30b212aa3d07bee00685510bd1c8)

**Added**

- Atomic writes everywhere in project metadata: `withMetadataTransaction`
  (serialized `BEGIN IMMEDIATE` batches — a throwing batch rolls back fully),
  an fsync-backed `project.json` marker write (S1.1), and
  `checkpointProjectDatabase` (WAL checkpoint = basic autosave; every write is
  already a full commit, so there is no dirty state to lose).
- Corruption recovery at open (D10): `PRAGMA integrity_check`; a corrupted
  database is preserved as `<db>.bak-<timestamp>` and a fresh database starts,
  with `recovered`/`backupPath` reported to the caller. A recovery dialog UI
  remains a later task.
- `tests/atomic-metadata.test.js` — 8 tests: transaction commit, interrupted-
  write rollback (values untouched), serialized concurrency, corruption recovery
  (original preserved, fresh DB usable), healthy-DB no-recovery, checkpoint,
  fsync source check.

**Changed**

- Project DB open in `openProjectDatabase` now runs versioned migrations from a
  table (`001_initial`, `002_asset_registry`) and performs the recovery check;
  `database/project.db` callers receive the richer `{db, recovered, backupPath}` shape.
- Register: S1.7 marked **Complete**; §11 next task is S1.8.
- `Plan.md`: S1.7 checked off (2026-11-05).

### S1.6 — Asset Integrity Checking (2026-11-05) — [`9ec25bb`](https://github.com/lychgate/PanelForge/commit/9ec25bbc971092e56f5f5c9a628c828eccc3a426)

**Added**

- `src/core/project/integrity.ts` — `verifyProjectIntegrity()`: compares every
  registry row against its file and returns an integrity report
  (`{projectId, checkedAt, entries, summary}`) with per-asset
  `ok|missing|modified|unreadable` statuses and expected/actual SHA-256 hashes.
  Verification is read-only; paths resolve through the S1.4 symlink-safe checker.
- `tests/asset-integrity.test.js` — 7 tests: clean project all-ok, deleted →
  missing, tampered → modified (actual hash recorded), mixed-damage counts,
  empty registry, marker requirement, no-mutation guarantee.

**Changed**

- Register: S1.6 marked **Complete**; §11 next task is S1.7.
- `Plan.md`: S1.6 checked off (2026-11-05).

### S1.5 — Asset Registry (2026-11-05) — [`96b28fd`](https://github.com/lychgate/PanelForge/commit/96b28fd3abd53bc60dffe4a1ba7e864b32bcf4d7)

**Added**

- `src/core/project/registry.ts` — asset registry in `database/project.db`
  (migration 002 `assets` table): `importAsset` (external copy-in, SHA-256 hash,
  UID row — identity is the ID, never the path, per D6), `copyAsset` (mints a
  new identity; the original is unchanged), `getAsset`, `listAssets`.
  `relative_path` is unique per project (duplicate destinations rejected);
  destinations resolve through the S1.4 path service.
- `tests/asset-registry.test.js` — 9 tests: import copy+hash+row, get/list
  retrieval, copy new-identity behavior, duplicate-path rejection (import and
  copy), source/ID errors, traversal rejection, persistence.

**Changed**

- Project metadata migrations are now a versioned list (002 adds the registry;
  pre-existing v1 databases migrate forward), and the open/queue/busy-retry
  helpers are shared with the registry.
- S1.5 records the §7.4 subset (UID + relative path + type + dates + hash);
  version/approval/relationships/provenance remain later tasks.
- Register: S1.5 marked **Complete**; §11 next task is S1.6.
- `Plan.md`: S1.5 checked off (2026-11-05).

### S1.4 — Relative Asset Path Service (2026-11-05) — [`89214ff`](https://github.com/lychgate/PanelForge/commit/89214ff122cbba87235ab5f391d6ab3b609ef422)

**Added**

- `src/core/project/paths.ts` — relative asset path service: `normalizeRelative`
  (lexical canonicalization; rejects absolute paths, backslashes, and escapes),
  `resolveInProject` (canonicalize + join + symlink-resolved target verification —
  a link pointing outside the project is rejected even when its spelling looks
  valid), and the `toStoragePath` inverse. Non-existent files resolve by parent.
- `tests/project-paths.test.js` — 10 tests: correct resolution of valid paths,
  normalization, traversal/absolute/backslash rejection, symlink escape rejected
  + internal symlink accepted, non-existent-file resolution, storage inverse.

**Changed**

- `Docs/PanelForge-Project-Format.md` (paths section already specified these
  rules; S1.4 implements them).
- Register: S1.4 marked **Complete**; §11 next task is S1.5.
- `Plan.md`: S1.4 checked off (2026-11-05).

### S1.3 — Basic Project Operations (2026-11-05) — [`dea5e4c`](https://github.com/lychgate/PanelForge/commit/dea5e4c54f8e15b4ec10add55497c95b3c5f30de)

**Added**

- `src/core/project/operations.ts` — basic operations over the S1.1/S1.2 project
  layer: `createProjectAt` (folder + marker + metadata), `listProjects`
  (valid projects only, junk skipped), `openProject`/`closeProject`
  (in-process open-set exclusivity), `renameProject` (folder + metadata name,
  project ID unchanged), `archiveProject` (moves into sibling `.archived/`,
  leaving the active library). All failures are `ProjectOpError` with typed
  codes (`INVALID_NAME`, `INVALID_ARGUMENTS`, `NOT_FOUND`, `NOT_A_PROJECT`,
  `CORRUPT_MARKER`, `UNSUPPORTED_VERSION`, `ALREADY_OPEN`, `ALREADY_CLOSED`,
  `ALREADY_EXISTS`, `INVALID_STATE`).
- `tests/project-operations.test.js` — 9 tests covering each operation
  independently and each error code.

**Changed**

- Semantics for what the spec leaves unspecified (engineering judgment,
  documented): rename renames folder + metadata; archive moves to
  `<parent>/.archived/<folder>`; rename/archive while open are rejected.
- No IPC channels added this task — operation UIs arrive with S1.10.
- Register: S1.3 marked **Complete**; §11 next task is S1.4.
- `Plan.md`: S1.3 checked off (2026-11-05).

### S1.2 — Project Metadata Schema (2026-11-05) — [`a6d8566`](https://github.com/lychgate/PanelForge/commit/a6d8566bcaa42347bc051348067f266a7ff73023)

**Added**

- `src/core/project/metadata.ts` — project database service on
  `database/project.db` (the authoritative store per D5):
  `projects(project_id, name, description, created_at, updated_at)`, WAL +
  foreign keys + busy timeout 5000, tracked migrations, serialized writes with
  busy retry, and `createProjectMetadata` / `getProjectMetadata` /
  `updateProjectMetadata` (name validation, typed error codes:
  `INVALID_ARGUMENTS` / `NOT_A_PROJECT` / `ALREADY_EXISTS` / `NOT_FOUND`).
  `projectId` and `createdAt` come from the S1.1 marker.
- `tests/project-metadata.test.js` — 8 tests: marker-identity rows, roundtrip,
  reopen persistence, `updated_at` bump, validation and error codes, and
  marker-required checks.

**Changed**

- `Docs/PanelForge-Project-Format.md`: metadata schema section.
- Register: S1.2 marked **Complete**; §11 next task is S1.3.
- `Plan.md`: S1.2 checked off (2026-11-05).

### S1.1 — Project Folder Format (2026-11-05) — [`3a6d599`](https://github.com/lychgate/PanelForge/commit/3a6d5993c20d3157a0955b8f12dc6385438da63f)

**Added**

- `src/core/project/service.ts` — project folder format (`PROJECT_FORMAT_VERSION=1`,
  full §7.1 tree, `ProjectMetadata` `{formatVersion, projectId, createdAt}`,
  `createProject` (tree + atomic marker), `identifyProject` (identification +
  version-check with typed codes), `resolveProjectPath` (D7 relative-path
  enforcement)).
- `Docs/PanelForge-Project-Format.md` — the folder specification (layout,
  marker fields, version-check rules, D5 canonical-store statement, path rules).
- `tests/project.test.js` — 11 tests: marker content, complete tree, D5 paths,
  identify positive/negative/corrupt/newer-version, traversal rejection, atomicity.

**Changed**

- Owner adopted the D5 proposal (recorded as [APPROVED CHANGE — owner]):
  `database/project.db` is the authoritative operational store; `project.json`
  is the version/ID marker + minimal manifest; JSON files inside the project
  are regenerable mirrors (database wins on conflict).
- Register: S1.1 marked **Complete**; §11 next task is S1.2.
- `Plan.md`: S1.1 checked off (2026-11-05).

### S0.12 — Stage 0 Verification (2026-11-05) — [`a548284`](https://github.com/lychgate/PanelForge/commit/a548284dda33b1016d43a63d35bb8e508d35cf8a)

**Added**

- `scripts/smoke-test.js` — repeatable end-to-end launch check (`npm run smoke`):
  isolated userData dir, asserts the full lifecycle (`PanelForge starting →
  database ready (journal=wal) → startup complete → shutting down →
  shutdown complete`), config/logs/database artifacts present, no stray
  processes. Skips (exit 0) when headless.
- `Docs/PanelForge-Stage0-Completion.md` — Stage 0 completion report: acceptance
  checklist, delivered-components table, known limitations, Stage 1 entry notes.

**Changed**

- `README.md`: ops section gains `npm run smoke`; a Known limitations section
  (CSP deferred, no icon, devTools-in-dev, experimental upstream `node:sqlite`,
  rotation/backup limits, deferred recovery dialog, audit notes) and Stage 0
  marked complete with S1.1 named as next (awaiting authorization).
- Verified on the final tree: typecheck + build + `npm run check` + 82 tests green;
  clean `rm -rf forge-out && electron-forge make` rebuild; packaged binary
  launched with the full lifecycle, no strays.
- Register: S0.12 marked **Complete**; **Stage 0 is complete**; §11 next task is S1.1.
- `Plan.md`: S0.12 checked off (2026-11-05); Stage 0 marked complete.

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
