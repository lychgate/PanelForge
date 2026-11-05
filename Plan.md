# PanelForge — Development Plan

Development roadmap from [`Docs/PanelForge.pdf`](Docs/PanelForge.pdf) v1.2 (authoritative spec),
recorded operationally in [`Docs/PanelForge-Task-Register.md`](Docs/PanelForge-Task-Register.md).
Stage 0 and Stage 1 must complete before Character Studio or real ComfyUI integration.
Tasks are completed one at a time with owner review between tasks.

> Check off a task and fill in its completion date when its acceptance is verified.
> Stage 2 is broken into S2.1–S2.18 (owner-approved); Stages 3–11 are still
> recorded as task groups only until expanded the same way.

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
- [x] S1.8 Backup and Snapshot System — completed 2026-11-05
- [x] S1.9 Project Portability Test — completed 2026-11-05
- [x] S1.10 Basic Project Interface — completed 2026-11-05
- [x] S1.11 Stage 1 Test Fixture — completed 2026-11-05

Stage 1 completion: **complete** (2026-11-05 — gated by `tests/stage1-fixture.test.js`).

## Stage 2 — AI Orchestration and Resource Management

> 18 tasks, one per spec group: spine first (records + queue), then providers
> (LM Studio before ComfyUI), then resources. Infra only — no generation UI.
> See `Docs/PanelForge-Task-Register.md` §4D for the full task definitions.

- [x] S2.1 Provider Interface Definitions — completed 2026-11-05
- [x] S2.2 Persistent Task Records — completed 2026-11-05
- [x] S2.3 Task Queue — completed 2026-11-05
- [x] S2.4 Task State Transitions — completed 2026-11-05
- [x] S2.5 Pause and Cancellation — completed 2026-11-05
- [x] S2.6 Retry Handling — completed 2026-11-05
- [x] S2.7 Progress Reporting — completed 2026-11-05
- [x] S2.8 Queue Persistence and Recovery — completed 2026-11-05
- [x] S2.9 LM Studio Connection Adapter — completed 2026-11-05
- [ ] S2.10 ComfyUI Connection Adapter
- [ ] S2.11 Provider Health Checks
- [ ] S2.12 Mock Provider Testing
- [ ] S2.13 Resource Profiles
- [ ] S2.14 Hardware Detection
- [ ] S2.15 Telemetry Adapter Interface
- [ ] S2.16 Graceful Telemetry Failure
- [ ] S2.17 Cooling Down State
- [ ] S2.18 Small GPU Mode

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
