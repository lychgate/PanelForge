# PanelForge — Development Plan

Development roadmap from [`Docs/PanelForge.pdf`](Docs/PanelForge.pdf) v1.2 (authoritative spec),
recorded operationally in [`Docs/PanelForge-Task-Register.md`](Docs/PanelForge-Task-Register.md).
Stage 0 and Stage 1 must complete before Character Studio or real ComfyUI integration.
Tasks are completed one at a time with owner review between tasks.

> Check off a task and fill in its completion date when its acceptance is verified.
> Stages 2–11 are currently recorded as task groups only (the spec does not define
> per-task breakdowns for them yet) — they remain single stage-level entries until expanded.

## Stage 0 — Application Foundation

- [x] S0.1 Repository and Package Baseline — completed 2026-11-05
- [x] S0.2 Electron Application Launch — completed 2026-11-05
- [x] S0.3 Secure BrowserWindow Configuration — completed 2026-11-05
- [x] S0.4 IPC Foundation — completed 2026-11-05
- [x] S0.5 Safe Diagnostic Operation — completed 2026-11-05
- [x] S0.6 Configuration and User Paths — completed 2026-11-05
- [x] S0.7 Logging and Error Handling — completed 2026-11-05
- [x] S0.8 SQLite Foundation — completed 2026-11-05
- [x] S0.9 Application Lifecycle Infrastructure — completed 2026-11-05
- [x] S0.10 Keyboard Shortcuts and Navigation Foundation — completed 2026-11-05
- [x] S0.11 Initial Packaging — completed 2026-11-05
- [x] S0.12 Stage 0 Verification — completed 2026-11-05

Stage 0 completion: **complete** (2026-11-05 — see `Docs/PanelForge-Stage0-Completion.md`).

## Stage 1 — Project Management and Portable Storage

- [x] S1.1 Project Folder Format — completed 2026-11-05
- [x] S1.2 Project Metadata Schema — completed 2026-11-05
- [x] S1.3 Basic Project Operations — completed 2026-11-05
- [x] S1.4 Relative Asset Path Service — completed 2026-11-05
- [x] S1.5 Asset Registry — completed 2026-11-05
- [x] S1.6 Asset Integrity Checking — completed 2026-11-05
- [x] S1.7 Atomic Metadata Operations — completed 2026-11-05
- [ ] S1.8 Backup and Snapshot System
- [ ] S1.9 Project Portability Test
- [ ] S1.10 Basic Project Interface
- [ ] S1.11 Stage 1 Test Fixture

Stage 1 completion: **pending**.

## Stage 2 — AI Orchestration and Resource Management

> Groups only (provider adapters for LM Studio/ComfyUI, persistent task records,
> task queue, pause/cancel/retry, resource profiles, hardware detection,
> telemetry, Small GPU Mode, mock-provider testing). Task breakdown pending.

- [ ] Stage 2 — not started

## Stage 3 — Manuscript Analysis and Art Style Profiles

- [ ] Stage 3 — not started

## Stage 4 — Character Studio

- [ ] Stage 4 — not started

## Stage 5 — Location and Object Studio

- [ ] Stage 5 — not started

## Stage 6 — Storyboard Studio

- [ ] Stage 6 — not started

## Stage 7 — Art Studio

- [ ] Stage 7 — not started

## Stage 8 — Comic Layout Studio

- [ ] Stage 8 — not started

## Stage 9 — Continuity and QA

- [ ] Stage 9 — not started

## Stage 10 — Publishing and Export

- [ ] Stage 10 — not started

## Stage 11 — Advanced Features (Deferred)

> Headless CLI, batch/daemon, LoRA, animation, cloud sync, etc. Explicitly deferred;
> the Core Engine must support future headless operation.

- [ ] Stage 11 — not started (deferred)
