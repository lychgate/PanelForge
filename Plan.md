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
- [x] S2.10 ComfyUI Connection Adapter — completed 2026-11-05
- [x] S2.11 Provider Health Checks — completed 2026-11-05
- [x] S2.12 Mock Provider Testing — completed 2026-11-05
- [x] S2.13 Resource Profiles — completed 2026-11-05
- [x] S2.14 Hardware Detection — completed 2026-11-05
- [x] S2.15 Telemetry Adapter Interface — completed 2026-11-05
- [x] S2.16 Graceful Telemetry Failure — completed 2026-11-05
- [x] S2.17 Cooling Down State — completed 2026-11-05
- [x] S2.18 Small GPU Mode — completed 2026-11-05

## Stage 3 — Manuscript Analysis and Art Style Profiles

> Expanded planning 2026-11-05 (owner-authorized expansion, awaiting task-level
> approval): 14 micro-tasks S3.1–S3.14, spine first (source records + TXT/MD +
> deterministic segmentation), then entity extraction + canon classification
> (§2.7), then DOCX/EPUB/PDF parsers, then Art Style Manager. Infra only — no
> generation UI. See `Docs/PanelForge-Task-Register.md` §4E Stage 3 for full
> per-task Goal/Scope/Deliverables/Deps/Acceptance/Stop.

- [x] S3.1 Source document records (manuscript rows + asset linkage; originals preserved) — completed 2026-11-05
- [x] S3.2 TXT/Markdown import + normalization (hash + offset-preserving spans) — completed 2026-11-05
- [x] S3.3 Chapter extraction (deterministic heading segmentation) — completed 2026-11-05
- [x] S3.4 Scene extraction (deterministic segmentation + override framework) — completed 2026-11-05
- [x] S3.5 Source relationships (chapter→scene→span links with offset verification) — completed 2026-11-05
- [x] S3.6 Entity extraction framework (characters/locations/objects/events/chronology) — completed 2026-11-05
- [x] S3.7 Canon classification (explicit / interpretation / suggestion / unknown; anti-fabrication) — completed 2026-11-05
- [x] S3.8 DOCX import (parser dependency) — completed 2026-11-05
- [x] S3.9 EPUB import (parser dependency) — completed 2026-11-05
- [x] S3.10 PDF import (text extraction; OCR deferred as Unknown) — completed 2026-11-05
- [x] S3.11 Art Style Manager (CRUD + canonical default) — completed 2026-11-06
- [x] S3.12 Style profile persistence (project store + asset references) — completed 2026-11-06
- [x] S3.13 Style variants + priority resolution (§9.1/§9.2 lock strength + conflict warnings) — completed 2026-11-06
- [x] S3.14 Stage 3 acceptance fixture (import → extract → classify → style a scene) — completed 2026-11-06

## Stage 4 — Character Studio

> Expanded planning 2026-11-06 (owner-authorized expansion, awaiting task-level
> approval): 12 micro-tasks S4.1–S4.12, spine first (profile CRUD → version
> records → reference association → completeness tiers/MVRS), then entity
> bridge (link, never auto-create), version binding (opaque panel_id until
> Stage 6), approval, generation-request records (records+approval only — no
> live generation; ComfyUI execution stays Stage 7), comparison + history,
> acceptance fixture last. Infra only — no model provisioning. See
> `Docs/PanelForge-Task-Register.md` §4E Stage 4 for full per-task
> Goal/Scope/Deliverables/Deps/Acceptance/Stop.

- [x] S4.1 Character profile records (§8.4 fields + CRUD) — completed 2026-11-06
- [x] S4.2 Character version records (independently identifiable labels) — completed 2026-11-06
- [x] S4.3 Reference asset association (portrait/front/side/rear/expression/pose/clothing/equipment slots) — completed 2026-11-06
- [x] S4.4 Reference completeness scoring (Basic / Recommended / Full tiers, missing-slot warnings) — completed 2026-11-06
- [x] S4.5 Minimum Viable Reference Set config (tiers editable, defaults = §8.4) — completed 2026-11-06
- [x] S4.6 Entity → character bridge (explicit create-from-entity; source span link; never auto-create) — completed 2026-11-06
- [x] S4.7 Character version binding (panel_id opaque until Stage 6; one exact version; wrong-version warnings) — completed 2026-11-06
- [x] S4.8 Generation approval (pending/approved/rejected gate on binding) — completed 2026-11-06
- [x] S4.9 Generation-request records (request shape + validation only; zero provider calls) — completed 2026-11-06
- [x] S4.10 Reference comparison (slot-by-slot + field diffs, read-only) — completed 2026-11-06
- [x] S4.11 Character history (append-only lifecycle replay) — completed 2026-11-06
- [x] S4.12 Stage 4 acceptance fixture (create → versions → references → tiers → approve → bind → gate) — completed 2026-11-06

## Stage 5 — Location and Object Studio

> Expanded planning 2026-11-06 (owner-authorized expansion, awaiting task-level
> approval): 10 micro-tasks S5.1–S5.10, spine first (location profiles →
> variations → references; object profiles → variations → references), then
> entity bridge (link, never auto-create), generation-request records
> (records only), asset history, acceptance fixture last. Infra only — no
> live generation (Stage 7 owns ComfyUI execution). See
> `Docs/PanelForge-Task-Register.md` §4E Stage 5 for full per-task
> Goal/Scope/Deliverables/Deps/Acceptance/Stop.

- [x] S5.1 Location profile records (§8.5 fields + CRUD) — completed 2026-11-06
- [x] S5.2 Location variations (identifiable states like "Ravenholt, winter, damaged") — completed 2026-11-06
- [x] S5.3 Location reference association (exterior/interior/overview/detail/day/night/weather/damaged slots) — completed 2026-11-06
- [x] S5.4 Object profile records (§8.6 fields + CRUD) — completed 2026-11-06
- [x] S5.5 Object variations (states like "OmniPad, pristine/damaged") — completed 2026-11-06
- [x] S5.6 Object reference association (front/side/detail/in-use/damaged slots) — completed 2026-11-06
- [x] S5.7 Entity → location/object bridge (explicit create-from-entity; link, never auto-create) — completed 2026-11-06
- [x] S5.8 Generation-request records (request shape + validation only; zero provider calls) — completed 2026-11-06
- [x] S5.9 Asset history (append-only lifecycle replay) — completed 2026-11-06
- [x] S5.10 Stage 5 acceptance fixture (create → variants → reference → regenerate independently) — completed 2026-11-06

## Stage 6 — Storyboard Studio

> Expanded planning 2026-11-06 (owner-authorized expansion, awaiting task-level
> approval): 13 micro-tasks S6.1–S6.13, spine first (scene + panel records →
> assignments → camera/positioning → dialogue → style overrides →
> instructions → full-copy snapshots + lineage branching → composition
> review), then a minimal hand-rolled UI (owner decision 2026-11-06: no
> framework; final CSP still deferred), then the acceptance fixture on
> `tests/TestData`. Infra first, minimal UI second — no generation
> (Stage 7 owns ComfyUI execution). See
> `Docs/PanelForge-Task-Register.md` §4E Stage 6 for full per-task spec.

- [x] S6.1 Scene records (source chain via S3.5; wrap, never rewrite, extraction scenes) — completed 2026-11-06
- [x] S6.2 Panel records (editable sequences with no artwork; reorder persists) — completed 2026-11-06
- [x] S6.3 Character and version assignment (S4.7 opaque IDs become real FKs; approved-only gate) — completed 2026-11-06
- [x] S6.4 Location assignment (exact location + optional variation per panel) — completed 2026-11-06
- [x] S6.5 Camera and shot definitions (closed vocab + free-text angle) — completed 2026-11-06
- [x] S6.6 Character positioning (foreground/midground/background + left/center/right guidance only) — completed 2026-11-06
- [x] S6.7 Dialogue, captions, actions, and expressions (editable line rows) — completed 2026-11-06
- [x] S6.8 Scene style overrides (S3.13 resolveStyle consumer; default fallback) — completed 2026-11-06
- [x] S6.9 Panel instructions (generation-ready text for Stage 7) — completed 2026-11-06
- [x] S6.10 Storyboard snapshots + lightweight branching (full-copy snapshots, parent lineage) — completed 2026-11-06
- [x] S6.11 Minimal storyboard UI (read/edit without artwork; hand-rolled HTML/CSS + shortcuts; new IPC channels) — completed 2026-11-06
- [x] S6.12 Composition review (gap/mismatch warnings naming panel + fix) — completed 2026-11-06
- [x] S6.13 Stage 6 acceptance fixture (storyboard a TestData chapter; approved artwork stays byte-identical) — completed 2026-11-06; Stage 6 gate passes 13/13

## Stage 7 — Art Studio

> Expanded planning 2026-11-06 (owner-authorized expansion, awaiting task-level
> approval): 15 micro-tasks S7.1–S7.15, spine first (ComfyUI integration →
> workflow templates → template prompt assembly with optional LLM assist →
> negative prompts → approved-reference conditioning → individual generation
> → variations → inpaint → outpaint → aspect ratios → comparisons →
> provenance → version history/approval/restoration), then acceptance
> fixture last. First live-generation stage — both repaint ops
> coordinate-based (no mask UI); workflow templates are portable project
> files, hash-verified. See `Docs/PanelForge-Task-Register.md` §4E Stage 7
> for full per-task spec.

- [x] S7.1 ComfyUI workflow integration (submit → poll → harvest; Small GPU honored) — completed 2026-11-06; Stage 7 now 1 of 14
- [ ] S7.2 Workflow templates (project files under `workflows/`, hash-verified registry)
- [ ] S7.3 Prompt assembly (templates from S6.9 + style + reference tags; optional LM Studio polish)
- [ ] S7.4 Negative prompt handling (per-job + style defaults, job wins)
- [ ] S7.5 Reference conditioning (approved refs by slot; unapproved refuse)
- [ ] S7.6 Individual panel generation (engine: request → ComfyUI → asset → artwork row; never overwrite)
- [ ] S7.7 Variations (N versions per job; Small GPU cap honored)
- [ ] S7.8 Inpainting (coordinate regions; no mask UI)
- [ ] S7.9 Outpainting (canvas-extension params; no mask UI)
- [ ] S7.10 Aspect ratio adjustment (style vocabulary; new versions only)
- [ ] S7.11 Side-by-side + approved-reference comparison (all four §8.8 modes)
- [ ] S7.12 Generation provenance (template + hash, prompt, seed, model, timestamp)
- [ ] S7.13 Version history, approval, and restoration (restore returns pointer, never deletes)
- [ ] S7.14 Engine provisioning (detect-or-install under runtime/engines; user installs untouched)
- [ ] S7.15 Stage 7 acceptance fixture (brief → artwork → approve; approved work preserved)

## Stage 8 — Comic Layout Studio (expanded 2026-11-06: S8.1–S8.14)

> Owner decisions: SVG vector-first pages (raster at Stage 10); lettering as overlay records, baked at export; hand-rolled HTML/CSS + TypeScript UI (owner 2026-11-06: no framework — consistent with S6.11); PDF library pdfkit.

- [ ] S8.1 Page records (format traditional|webtoon, size, margin)
- [ ] S8.2 Panel placement (mm geometry, artwork by asset reference)
- [ ] S8.3 Traditional layout templates (grid presets)
- [ ] S8.4 Webtoon / vertical layout (continuous scroll geometry)
- [ ] S8.5 Borders (presets, vector, never baked into artwork)
- [ ] S8.6 Balloons + tails (speech/caption/thought, anchors)
- [ ] S8.7 Dialogue/caption editing (overlay text only, artwork byte-identical)
- [ ] S8.8 Sound effects (SFX vector lettering records)
- [ ] S8.9 Reading order (explicit per-page order)
- [ ] S8.10 Layout snapshots (full copies, parent lineage)
- [ ] S8.11 SVG page render (deterministic vector composition)
- [ ] S8.12 Layout UI — hand-rolled canvas (drag/resize, keyboard alternatives, no export buttons)
- [ ] S8.13 Traceability (pages → storyboard panels + versions)
- [ ] S8.14 Stage 8 acceptance fixture (both formats, lettering editable, artwork untouched)

## Stage 9 — Continuity and QA (expanded 2026-11-06: S9.1–S9.12)

> Owner decisions: severity thresholds tunable per project; checks use recorded/explicit facts only (unknown skips, never guesses); suppression requires rationale and is auditable.

- [ ] S9.1 QA threshold settings (per-kind severity + noise caps)
- [ ] S9.2 Version/age checks (S4.7 era + assignments)
- [ ] S9.3 Clothing/equipment checks (canon explicit-only)
- [ ] S9.4 Injury/wound checks (recorded injury states)
- [ ] S9.5 Location checks (panel vs scene location)
- [ ] S9.6 Chronology checks (extraction vs storyboard order, dated entries)
- [ ] S9.7 Reference checks (artwork vs version references)
- [ ] S9.8 Severity aggregation (Critical/Warning/Informational, deterministic)
- [ ] S9.9 Suppression / overrides (rationale-required, auditable)
- [ ] S9.10 Recommendations (concrete fix per warning)
- [ ] S9.11 QA review UI (warnings + suppress, read-only checks)
- [ ] S9.12 Stage 9 acceptance fixture (planted inconsistencies → severities)

## Stage 10 — Publishing and Export

- [ ] Stage 10 — not started

## Stage 11 — Advanced Features (Deferred)

> Headless CLI, batch/daemon, LoRA, animation, cloud sync, etc. Explicitly deferred;
> the Core Engine must support future headless operation.

- [ ] Stage 11 — not started (deferred)
