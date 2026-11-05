# PanelForge — Project Task Register

**Project:** PanelForge — local-first comic studio  
**Authoritative source:** `Docs/PanelForge.pdf` — Product & Technical Design Specification, v1.2 Consolidated Development Baseline, Status: Approved for Development, Initial Platform: Linux Mint, Primary Hardware Target: NVIDIA GTX 1660 Ti (6GB VRAM), Technology: Electron, TypeScript, Node.js, SQLite, local AI providers  
**This file:** `Docs/PanelForge-Task-Register.md`  
**Created:** 2026-11-05 — spec extraction only, no implementation  
**Last updated:** 2026-11-05 — v3.1 + S0.1 complete: register corrections applied (SQLite decision deferred to S0.8; S1.5a removed from sequence; one-task-at-a-time approved; Q2 approved — secure first window); S0.1 implemented and committed (55853fb). Stopping for owner review before S0.2.

The approved specification remains the authoritative source of product requirements. This register is the operational record. It does not amend the specification. Nothing in this file may be treated as an approved change unless explicitly marked **[APPROVED CHANGE — owner]**.

---

## 1. Current Project Status

- **Code:** S0.1 scaffold only (TS/Electron-ready baseline, no window/DB/AI). Git root commit 55853fb on `master`. See §10 for file list.
- **Stage 0:** S0.1 **Complete** (acceptance verified 2026-11-05 — see §10 test results). S0.2+ Not Started.
- **Stage 1–11:** Not Started. Stages 2–11 are recorded as task groups only (see §4).
- **Next eligible task:** S0.2 (see §11) — **awaiting owner authorization after S0.1 review**. Do not begin S0.2 without it.
- **Open decisions:** D1–D10 detail choices (§7) are **not approved** — owner direction is to approve progressively at their respective tasks (principles first; implementation details such as Zod or exact CSP directives left to the implementation task). Guardrails (§2), session protocol including one-task-at-a-time stop-and-review (§3), and Q2 (secure defaults from first window) are owner-approved. External-review recommendations in §7.1 are also **not approved** except where explicitly recorded as approved below.
- **S0.1 precondition (corrected 2026-11-05, v3.1):** S0.1 can begin **without** approving D1–D10. Those decisions are resolved when their respective tasks require them. SQLite library selection is **deferred to S0.8** (Q3/D8) — it is not an S0.1 prerequisite or decision, and S0.1 must not install a database dependency. S0.1 is authorized (owner, 2026-11-05); see §11.
- **Spec gaps blocking later work:** Stage 2–11 lack per-task Goal/Deliverables/Acceptance/Dependencies/Stop per §16.2. They are flagged Needs Clarification and must be expanded before implementation.

### 1.1 Source distinctions used throughout

- **[SPEC]** — Explicitly stated in `Docs/PanelForge.pdf`. Do not change without explicit owner authorization.
- **[RECOMMENDATION]** — Engineering proposal from audit/reviews (including external review). Not approved until owner marks it **[APPROVED CHANGE]**.
- **[APPROVED CHANGE — owner]** — Change explicitly reviewed and approved by the project owner after the baseline, with date/context.

### 1.2 Status definitions (reconciled with spec §16.3, 2026-11-05)

Spec-defined statuses [SPEC §16.3]: Not Started, Ready, In Progress, Blocked, Testing, Complete, Deferred.
Register extension [APPROVED CHANGE — owner]: Needs Clarification (used for tasks whose spec definition is incomplete/contradictory).

Mapping used in this register:
- **Not Started** = spec "Not Started".
- **Ready** (spec) = dependencies satisfied; may be treated as next-eligible candidate. This register records the next eligible task explicitly in §11 instead of flipping status to Ready.
- **In Progress** = work begun, acceptance not yet verified. Spec "Testing" maps here until acceptance is verified, then flips to Complete.
- **Blocked** = cannot proceed; blocker recorded in §9.
- **Complete** = spec "Complete"; acceptance criteria verified with tests recorded in §10. This register uses the spec spelling **Complete** (not "Completed") to avoid divergence with the specification. Never mark complete because code exists.
- **Deferred** = spec "Deferred" (Stage 11 items implicitly; explicit deferrals recorded when made).
- **Needs Clarification** (extension) = details incomplete, contradictory, or missing; resolve or document before implementation.

All current tasks are Not Started except Stage 2–11 groups, which are Needs Clarification.

### 1.3 Completeness flags

- **Complete in spec** — Goal, deliverables, and acceptance defined enough to implement as written.
- **Partial** — Goal and deliverables exist; acceptance, dependencies, or stop conditions are thin/ambiguous.
- **Incomplete** — Only a task-group name listed. Must be expanded per §16.2 before eligibility.

---

## 2. Owner-Approved Guardrails (not spec text)

**[APPROVED CHANGE — owner, 2026-11-05]**

1. Electron security and IPC architecture (allowlisted, typed, validated; no renderer Node access) are priority guardrails for Stage 0/1.
2. Project storage, asset identity, and portability (relative paths only; asset ID vs path) are priority guardrails for Stage 1.
3. SQLite ownership, transactions, migrations, and recovery (single Core-Engine-owned writer discipline; WAL + FK + busy timeout; atomic writes) are priority guardrails for Stage 0/1.

These three areas are adopted as guardrails. Their detailed implementations (D1–D10) remain **[RECOMMENDATION]** until approved.

---

## 3. Session Protocol **[APPROVED CHANGE — owner, 2026-11-05]**

### At the beginning of every development session
1. Read the approved specification.
2. Read this task register.
3. Read relevant engineering notes (§8).
4. Identify completed work, outstanding work, and blockers (§9).
5. Report the next recommended task before proceeding.

### During development
- Update task status as work progresses (§4).
- Record meaningful decisions and discoveries (§8).
- Record files created or modified (§10).
- Record test results (§10).
- Do not mark tasks complete until acceptance criteria have been verified.

### At the end of each session
- Update this register.
- Record what was accomplished (§10).
- Identify unresolved issues (§9).
- Identify the next eligible task and why it is next (§11).

### One-task-at-a-time rule [APPROVED CHANGE — owner, 2026-11-05]
After completing a task, **stop and wait for owner review and authorization before beginning the next task.** This is an actual stop, not a suggestion. In particular, do not begin S0.2 when S0.1 finishes without owner review of the repository, dependencies, scripts, and Git setup.

Never silently modify the approved specification or change approved architectural decisions. Request authorization when changes are necessary.

---

## 4. Stage and Milestone Task Register

### 4A. Milestones [SPEC §17]

| Milestone | Stages | Deliverable | Status |
|---|---|---|---|
| A — Reliable Desktop Foundation | 0–2 | Working Linux app, secure Electron, reliable SQLite, project infra, AI provider interfaces, persistent task queue, Resource Manager foundation | Not Started |
| B — Manuscript to Approved Artwork | 3–7 | Import/analyze manuscript, art styles, character references, locations/objects, storyboards, generate + approve panels | Not Started |
| C — Finished Comic Production | 8–10 | Assemble artwork, lettering, continuity checks, export comics/webtoons | Not Started |
| D — Advanced Production | 11 | Additional production automation and advanced capabilities | Not Started |

Milestones do not permit skipping intermediate acceptance tests [SPEC §17].

### 4B. Stage 0 — Application Foundation [SPEC §15]

**Goal [SPEC]:** Establish a reliable Electron application with secure architecture, configuration, logging, and database infrastructure.  
**Stop condition [SPEC]:** Do not proceed until the application shell, security boundary, configuration, logging, SQLite foundation, and Linux build are reliable.

All tasks: Status **Not Started** unless otherwise recorded. Dependencies marked [SPEC] or [RECOMMENDATION] (inferred from ordering where spec is silent).

#### S0.1 Repository and Package Baseline [SPEC]
- **Goal [SPEC]:** Create the project repository and initial package configuration.
- **Deliverables [SPEC]:** Git repository; Package configuration; Initial directory structure; Basic development scripts; README.
- **Acceptance [SPEC]:** Dependencies install successfully; Development scripts execute; Repository contains no generated build artifacts or secrets.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] None — first task.
- **Stop condition [SPEC]:** None stated beyond acceptance.
- **Completeness:** Complete in spec.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; commit 55853fb)
- **Task-boundary note [RECOMMENDATION — no spec change]:** S0.1 does **not** include Electron launch or window creation. Those belong to S0.2 [SPEC]. No deliverables moved between S0.1 and S0.2 in this register.
- **Implementation notes (2026-11-05):** Implemented S0.1 only. Files created: `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `.gitignore`, `README.md`, `src/{main,preload,renderer,core,engines,modules,database,shared/{types,interfaces}}/index.ts` placeholders, `scripts/check.js`, `scripts/dev-check.js`, `tests/baseline.test.js`. Dependencies: `typescript` + `vitest` + `eslint` only (devDependencies). **No Electron, no SQLite/Drizzle, no Sharp/PDF, no AI — deliberately boring.** Test results: see §10. Git: root commit 55853fb on `master`; working tree clean; `node_modules/` and `out/` gitignored.

#### S0.2 Electron Application Launch [SPEC]
- **Goal [SPEC]:** Create the initial desktop application.
- **Deliverables [SPEC]:** Electron main process; Basic BrowserWindow; Initial renderer page.
- **Acceptance [SPEC]:** Application launches on Linux Mint; Window opens reliably; Application closes cleanly.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.1.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — acceptance is functional only; security hardening belongs to S0.3 [SPEC].
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; commit 0d73f1a)
- **Task-boundary note [APPROVED CHANGE — owner, 2026-11-05, Q2]:** S0.2 must create the initial Electron window with secure defaults from its first launch. S0.3 remains responsible for verification, documentation, and security testing. This does **not** change task definitions — S0.2 still delivers launch only; S0.3 still verifies/documents/tests the boundary. (Secure-by-default at creation is an implementation choice within S0.2 to avoid a temporary insecure window.)
- **Implementation notes (2026-11-05):** Implemented per clarified plan. Files: `package.json` (electron devDep only, `main: out/node/main/index.js`, `start: electron .`, `build` appends `node scripts/copy-renderer-html.js`), `package-lock.json`, `tsconfig.node.json`/`tsconfig.web.json` (added `"rootDir": "src"` so renderer compiles to `out/web/renderer/`, not `out/web/`), `src/main/index.ts` (BrowserWindow secure defaults: contextIsolation true, nodeIntegration false, sandbox true, webSecurity true, allowRunningInsecureContent false; loads `../../web/renderer/index.html`; setWindowOpenHandler deny; will-navigate/will-attach-webview guards; lifecycle activate/window-all-closed), `src/preload/index.ts` (inert stub, zero exports), `src/renderer/index.ts` (renders "PanelForge — initial window (S0.2)"), `src/renderer/index.html` (loads `./index.js`), `scripts/copy-renderer-html.js` (built-in fs/path copy; only new build file), `scripts/check.js` (allows electron, requires it, zero-IPC guard), `README.md` (build → start flow). Launch flow: `npm run build` → `npm start` (`electron .` reads main; no rebuild inside start). `npm run dev` unchanged (typecheck + baseline check only). **No IPC anywhere.** Deviations: (1) preload comment no longer names the IPC tokens it forbids (keeps `grep` for IPC surface clean); check.js strips `//` comments before scanning. (2) `rootDir: "src"` added to both tsconfigs — without it renderer JS landed at `out/web/index.js` while HTML at `out/web/renderer/index.html`. (3) `will-navigate` compiles renderer URL without `file:///` prefix matching Electron's normalized `file:///…`; handler is harmless defense-in-depth, S0.3 may refine. Test results: see §10.

#### S0.3 Secure BrowserWindow Configuration [SPEC]
- **Goal [SPEC]:** Establish secure renderer defaults.
- **Deliverables [SPEC]:** Context isolation; Disabled Node integration; Sandboxing where compatible; Restricted preload bridge.
- **Acceptance [SPEC]:** Renderer cannot directly access Node.js; Application security settings are documented and tested.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.2.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — test harness, CSP, `webSecurity`, `allowRunningInsecureContent`, devTools policy, `setWindowOpenHandler`, navigation handling not specified. See D2–D4 (§7).
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; commit 4c8d10b)

#### S0.4 IPC Foundation [SPEC]
- **Goal [SPEC]:** Create a controlled communication channel.
- **Deliverables [SPEC]:** IPC allowlist; Typed request and response structures; Argument validation; Centralized IPC registration.
- **Acceptance [SPEC]:** Only registered methods can be called; Invalid arguments are rejected; Errors are returned safely.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.3.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — contract format, validation library, and error envelope not specified. See D1.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; commit 8026da3)

#### S0.5 Safe Diagnostic Operation [SPEC]
- **Goal [SPEC]:** Verify the renderer-to-main communication path.
- **Deliverables [SPEC]:** One diagnostic IPC operation; Preload API method; Renderer test interface.
- **Acceptance [SPEC]:** Renderer successfully requests diagnostic information; No unrestricted Node.js access is required.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.3, S0.4.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Complete in spec as a spike.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; commit recorded below)

#### S0.6 Configuration and User Paths [SPEC]
- **Goal [SPEC]:** Centralize application configuration.
- **Deliverables [SPEC]:** Configuration service; User data path handling; Application settings location; Default configuration.
- **Acceptance [SPEC]:** No hardcoded machine-specific paths are required; Configuration can be read and updated safely.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.1; informs S0.7/S0.8.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — config format/versioning not specified.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 913d575)

#### S0.7 Logging and Error Handling [SPEC]
- **Goal [SPEC]:** Establish useful diagnostics.
- **Deliverables [SPEC]:** Central logging service; Error handling; Size-limited or rotating logs; Consistent error reporting.
- **Acceptance [SPEC]:** Errors are recorded; Logs remain within configured size limits; Sensitive information is not unnecessarily logged.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.6; S0.4 (IPC errors).
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — format, rotation values, redaction rules not specified.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit recorded below)

#### S0.8 SQLite Foundation [SPEC]
- **Goal [SPEC]:** Establish database infrastructure.
- **Deliverables [SPEC]:** SQLite connection service; Initial schema; Migration mechanism; WAL mode; Foreign key enforcement; Busy timeout; Serialized write service.
- **Acceptance [SPEC]:** Database initializes successfully; Migrations execute; Data persists across restarts; Basic concurrent access tests do not cause uncontrolled write failures.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.6, S0.7; informs S1.2.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — migration format, writer mechanism, transaction helper shape, and exact concurrent-access test not specified. See D8–D9 (§7). **Correction:** Serialized writes are **[SPEC]** required; any async-mutex/writer-queue implementation is **[RECOMMENDATION]** and must be verified against the selected SQLite library (Drizzle ORM or equivalent per §14) before being treated as mandatory.
- **Status:** Not Started

#### S0.9 Application Lifecycle Infrastructure [SPEC]
- **Goal [SPEC]:** Provide reliable startup and shutdown behavior.
- **Deliverables [SPEC]:** Startup sequence; Shutdown sequence; Resource cleanup hooks; Basic application lifecycle events.
- **Acceptance [SPEC]:** Application starts and closes without leaving avoidable resources behind.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.2–S0.8.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — "avoidable resources" not enumerated.
- **Status:** Not Started

#### S0.10 Keyboard Shortcuts and Navigation Foundation [SPEC]
- **Goal [SPEC]:** Establish basic keyboard accessibility.
- **Deliverables [SPEC]:** Shortcut registration; Basic navigation structure; Shortcut documentation.
- **Acceptance [SPEC]:** Core navigation can be used without relying exclusively on mouse interaction.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.2.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** Not Started

#### S0.11 Initial Packaging [SPEC]
- **Goal [SPEC]:** Produce an installable or runnable Linux build.
- **Deliverables [SPEC]:** Linux packaging configuration; Development build; Initial packaged build.
- **Acceptance [SPEC]:** Packaged application launches independently of the development environment.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.2–S0.9.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — packaging format not specified; §14 names Electron Forge [SPEC].
- **Status:** Not Started

#### S0.12 Stage 0 Verification [SPEC]
- **Goal [SPEC]:** Verify the complete foundation.
- **Deliverables [SPEC]:** Smoke tests; Updated README; Known limitations; Stage 0 completion report.
- **Acceptance [SPEC]:** All Stage 0 tests pass; No critical security or startup issues remain; Linux build is repeatable.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.1–S0.11.
- **Stop condition [SPEC]:** Stage 0 stop condition (see Stage header).
- **Completeness:** Complete in spec as a gate.
- **Status:** Not Started

### 4C. Stage 1 — Project Management and Portable Storage [SPEC §15]

**Goal [SPEC]:** Establish the project format, storage conventions, asset registry, and backup system.  
**Stop condition [SPEC]:** Do not begin Character Studio or real ComfyUI integration until project creation, storage, asset tracking, portability, and backups are reliable.

All tasks: Status **Not Started**.

#### S1.1 Project Folder Format [SPEC]
- **Goal:** No explicit goal text; inferred from task name.
- **Deliverables [SPEC]:** Project folder specification; Project version marker; Initial project metadata structure.
- **Acceptance [SPEC]:** A valid project can be identified and version-checked.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.6, S0.8.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — §7.1 tree is exemplary but version-marker format and version-check behavior unspecified; canonical-store contradiction (see D5) blocks implementation.
- **Status:** Not Started

#### S1.2 Project Metadata Schema [SPEC]
- **Deliverables [SPEC]:** Project database tables; Project identifier; Name and description fields; Creation and modification timestamps.
- **Acceptance [SPEC]:** Project metadata persists correctly.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.8, S1.1.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** Not Started

#### S1.3 Basic Project Operations [SPEC]
- **Deliverables [SPEC]:** Create; List; Open; Close; Rename; Archive.
- **Acceptance [SPEC]:** Each operation works independently; Invalid project operations return useful errors.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.1, S1.2, S1.4, S1.5; exercises S0.4 IPC contracts.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — archive/rename/exclusivity semantics unspecified.
- **Status:** Not Started

#### S1.4 Relative Asset Path Service [SPEC]
- **Deliverables [SPEC]:** Relative path resolution; Path normalization; Path traversal protection.
- **Acceptance [SPEC]:** Valid project paths resolve correctly; Unsafe paths are rejected.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.1.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — spec requires relative-to-root, no absolute canonical paths, traversal prevention (§7.2). External-reference schema and error types unspecified. See D7.
- **Status:** Not Started
- **Acceptance clarification [RECOMMENDATION — external review, 2026-11-05, not spec text]:** In addition to `../../etc/passwd`-style traversal, S1.4 acceptance testing should include **symbolic-link escape tests**: a symlink inside the project pointing outside must be rejected, even when the apparent relative path looks valid. Target filesystem boundary must resolve symlinks and verify the canonical target remains inside the project root. (To be finalized at S1.4 design; recorded here so it isn't missed.)
- **Path convention [RECOMMENDATION — owner-directed, prior refinement]:** Stored relative paths use **`/` as canonical separator**; translate to native OS separators only at the filesystem boundary.

#### S1.5 Asset Registry [SPEC]
- **Deliverables [SPEC]:** Asset records; Asset type metadata; File hashes; Import and copy operations.
- **Acceptance [SPEC]:** Imported assets are registered and retrievable.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.2, S1.4.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — §7.4 metadata list exists (UID, type, relative path, dates, hash, version, approval, relationships, provenance). Hash algorithm, orphan-file and rename/move semantics unspecified. See D6.
- **Status:** Not Started

#### S1.6 Asset Integrity Checking [SPEC]
- **Deliverables [SPEC]:** Missing asset detection; Hash verification; Integrity report.
- **Acceptance [SPEC]:** Missing or modified assets are reported accurately.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.5, S1.4.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** Not Started

#### S1.7 Atomic Metadata Operations [SPEC]
- **Deliverables [SPEC]:** Safe metadata writes; Recovery from interrupted writes; Basic autosave mechanism.
- **Acceptance [SPEC]:** Interrupted writes do not leave project metadata partially corrupted.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.8, S1.2, S1.5.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — atomic mechanism not named. See D10.
- **Status:** Not Started

#### S1.8 Backup and Snapshot System [SPEC]
- **Deliverables [SPEC]:** Snapshot creation; Backup creation; Restore operation; Verification.
- **Acceptance [SPEC]:** A snapshot can be restored and verified without damaging the original project.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.5, S1.6, S1.7.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — format, dedup, retention, restore-target semantics unspecified.
- **Status:** Not Started

#### S1.9 Project Portability Test [SPEC]
- **Deliverables [SPEC]:** Project copy/move test; Path verification; Asset integrity verification.
- **Acceptance [SPEC]:** A copied project opens on a different directory path without relying on the original machine's absolute paths.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.4–S1.8.
- **Stop condition [SPEC]:** None stated (this acceptance is the empirical guardrail gate).
- **Completeness:** Complete in spec as a test.
- **Status:** Not Started

#### S1.10 Basic Project Interface [SPEC]
- **Deliverables [SPEC]:** Project list; Create project interface; Open project interface; Basic project information.
- **Acceptance [SPEC]:** Users can manage projects without direct database interaction.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.3, S0.4/S0.5.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** Not Started

#### S1.11 Stage 1 Test Fixture [SPEC]
- **Deliverables [SPEC]:** Sample project; Automated tests; Project format documentation.
- **Acceptance [SPEC]:** A sample project can be created, copied, reopened, backed up, restored, and verified.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.1–S1.10.
- **Stop condition [SPEC]:** Stage 1 stop condition.
- **Completeness:** Complete in spec as a fixture/gate. [RECOMMENDATION] Format doc should begin at S1.1.
- **Status:** Not Started

### 4D. Stage 2 — AI Orchestration and Resource Management [SPEC §15]

**Goal [SPEC]:** Establish the infrastructure for AI providers and background tasks.  
**Spec note [SPEC]:** Must be divided into small tasks before implementation. Per §16.2 every task requires identifier/goal/scope/deliverable/dependencies/acceptance/stop. None exist yet.

All groups below: **Completeness Incomplete; Status Needs Clarification.**

| Group [SPEC] | Goal / Deliverables / Acceptance / Deps / Stop | Notes |
|---|---|---|
| Provider interface definitions | Not stated | Needs expansion |
| LM Studio connection adapter | Not stated | Model/quant/context unspecified |
| ComfyUI connection adapter | Not stated | Install/version strategy unspecified |
| Provider health checks | Not stated | Needs expansion |
| Persistent task records | Not stated | §11 lists 12 states; transition table absent |
| Task queue | Not stated | Needs expansion |
| Task state transitions | Not stated | Needs expansion |
| Pause and cancellation | Not stated | Needs expansion |
| Retry handling | Not stated | Needs expansion |
| Progress reporting | Not stated | §2.6/§11 constrain: no invented percentages |
| Resource profiles | Not stated | §10.2 defines Safe/Balanced/Performance/Custom |
| Hardware detection | Not stated | §10.1 defines Detected/Unavailable/Unknown |
| Telemetry adapter interface | Not stated | §10.4 graceful failure |
| Graceful telemetry failure | Not stated | Show Unknown, never 0, never invent |
| Cooling Down state | Not stated | §10.5 distinct from Paused/Failed/Waiting/Complete |
| Queue persistence and recovery | Not stated | Depends on S0.8 persistence shape |
| Small GPU Mode | Not stated | §10.3 first-class; GTX 1660 Ti target (§3.1) |
| Mock provider testing | Not stated | Needs expansion |

**Stage acceptance [SPEC]:** Tasks can be created, persisted, executed, interrupted, resumed where supported, and recovered after restart. Real generation remains independently testable from UI.

### 4E. Stages 3–11 — Task Groups [SPEC §15]

All groups: **Completeness Incomplete; Status Needs Clarification.** Each must be expanded per §16.2 before implementation.

- **Stage 3 — Manuscript Analysis and Art Style Profiles.** Goal: Import written material, analyze it, establish visual style definitions. Acceptance: originals preserved; extracted info links to source; styles can be created/saved/applied to scenes. Groups: TXT/Markdown, DOCX, EPUB, PDF import; chapter/scene extraction; source relationships; character/location/object/event/chronology extraction; canon vs interpretation (§2.7); Art Style Manager; profile persistence; variants (§9.1); priority resolution (§9.2).
- **Stage 4 — Character Studio.** Goal: Character profiles, visual references, version management. Acceptance: multiple visual versions; every panel identifies exact version; incomplete references produce actionable warnings. Groups: CRUD, version records, reference association, completeness scoring (§8.4 tiers), minimum viable reference set, generation, approval, binding, comparison, history.
- **Stage 5 — Location and Object Studio.** Goal: Reusable visual references. Acceptance: locations/objects independently created/edited/referenced/regenerated. Groups: location profiles/variations, object profiles/variations, asset history, generation integration.
- **Stage 6 — Storyboard Studio.** Goal: Scenes → editable panel sequences. Acceptance: storyboard editable without artwork; every panel identifies source scene + character versions; storyboard changes don't silently modify approved artwork. Groups: scene/panel records, character/version/location assignment, camera/shot, positioning, dialogue/captions, style overrides, panel instructions, snapshots, lightweight branching, composition review.
- **Stage 7 — Art Studio.** Goal: Generate/review/compare/approve individual artworks. Acceptance: independent generation/regeneration; history retained; approved work preserved; provenance stored. Groups: ComfyUI workflow integration/templates, prompt/negative/reference conditioning, individual generation, variations, inpaint/outpaint, side-by-side and approved-reference comparison (§8.8), provenance (§12), version history, approval/restoration, dependency tracking (§11.5).
- **Stage 8 — Comic Layout Studio.** Goal: Assemble approved artwork into finished pages. Acceptance: page assembled without modifying original artwork; dialogue/captions editable; traditional + vertical formats work. Groups: page creation, traditional/webtoon layouts, placement/resizing/borders, balloon creation/positioning/tail, dialogue/caption editing, sound effects, reading order, layout snapshots. Note [SPEC §8.9]: text not baked into artwork.
- **Stage 9 — Continuity and QA.** Goal: Detect meaningful inconsistencies. Acceptance: major inconsistencies reported; minor issues don't overwhelm; warnings identify affected scene/panel. Groups: version/age/clothing/equipment/injury/location/chronology/reference checks, severity classification (§8.10: Critical/Warning/Informational), suppression/overrides, actionable recommendations.
- **Stage 10 — Publishing and Export.** Goal: Produce finished deliverables. Acceptance: layout preserved; text readable; output passes integrity checks. Groups: PDF/CBZ/PNG/JPEG/webtoon export, dimensions/resolution/DPI/margins/bleed/metadata, export validation. Note [SPEC §8.11]: PDF/CBZ/PNG/JPEG/webtoon sequences; settings include dimensions/resolution/DPI/color profile/bleed/margins/reading direction/cover/metadata.
- **Stage 11 — Advanced Features (Deferred).** Headless CLI, batch processing, background daemon, advanced continuity, LoRA training, advanced reference conditioning, animation, video, voice, localization, cloud sync, distributed generation, advanced print features. Core Engine must support future headless operation; separate CLI/daemon not required for initial release. Example future commands in spec are illustrative, not requirements.

### 4F. Cross-cutting spec summaries (for reference only — spec remains authoritative)

- **Non-goals [SPEC §4.2]:** animation, video, multiplayer, cloud sync, social, marketplace, mobile apps, automatic commercial publishing, advanced LoRA training, complex distributed rendering.
- **MVP [SPEC §18]:** Create project → import manuscript → identify characters/scenes → edit character profiles → create reference images → establish art style → create storyboard → generate individual panels → review/approve artwork → assemble simple comic page. (Excludes LoRA training, advanced continuity scoring, animation/video, cloud sync, advanced collaboration, complex print workflows.)
- **Acceptance test [SPEC §19]:** *Nemesis Star: Broken Wings*, Ch.5 *Hunger Wins* — 8-year-old Robby + ARKNAD (space-pirate OmniPad), enormous Guardians (child-POV exaggeration vs continuity error), Ravenholt consistency, exact character-version binding per panel, Small GPU Mode, Unknown telemetry, Cooling Down.
- **Risks [SPEC §20]:** Scope, GPU memory, telemetry unavailable, thermal, character inconsistency, multi-character failures, invented facts, DB locking, portability, generation failures, style drift, warning fatigue, lettering complexity, reproducibility.
- **Definition of Done [SPEC §22]:** Reliable project creation/storage, manuscript import, character/style/storyboard/artwork management, version history, comparison, independent regeneration, queue visibility, Small GPU Mode, telemetry handling, Cooling Down, page composition, editable lettering, export, recovery/backup. Usable when AI services unavailable; user controls approved assets.
- **Methodology [SPEC §16]:** Stage → Milestone → Task; task fields per §16.2; register statuses Not Started/Ready/In Progress/Blocked/Testing/Complete/Deferred; completion per §16.4 (compile, acceptance, automated tests where practical, error handling, no regressions, documented); Git mandatory for source; no premature subsystem development (§16.5); unit/integration/manual/regression testing (§16.6).
- **Tech stack [SPEC §14]:** Electron, TypeScript, Node.js, HTML/CSS/JS/TS, lightweight UI framework if materially helpful, SQLite, Drizzle ORM or equivalent, LM Studio, ComfyUI, Sharp, SVG/Canvas, suitable PDF library (unspecified — choose before Stage 8/10), DOCX/EPUB/PDF parsers, Vitest + Playwright, Electron Forge, Git. Linux Mint first; Windows compatibility considered from start but must not delay Linux foundation.
- **Repo structure [SPEC §21]:** `src/main|preload|renderer|core|engines|modules|database|shared` + `workflows/`, `resources/`, `tests/`, `scripts/`, `package.json`, `README.md`. Don't create empty modules for appearance — introduce subsystems when needed by current stage.

---

## 5. Task Dependencies and Implementation Order

Dependencies below are **[RECOMMENDATION]** inferred from spec ordering where [SPEC] is silent. Validation points cite [SPEC] acceptance.

| Order | Task(s) | Depends on [RECOMMENDATION] | Validation point [SPEC] |
|---|---|---|---|
| 1 | S0.1 | None | Install succeeds; no artifacts/secrets |
| 2 | S0.2 | S0.1 | Launches/closes on Linux Mint |
| 3 | S0.3 (+ D4 test harness) | S0.2 | Renderer cannot access Node.js; settings documented/tested |
| 4 | S0.4 | S0.3 | Only registered methods callable; invalid args rejected; errors safe |
| 5 | S0.5 | S0.3, S0.4 | Diagnostic via IPC without unrestricted Node |
| 6 | S0.6 | S0.1 | No hardcoded paths; config read/write safe |
| 7 | S0.7 | S0.6, S0.4 | Errors recorded; logs size-limited; no unnecessary sensitive data |
| 8 | S0.8 | S0.6, S0.7 | DB initializes; migrations run; persists across restarts; concurrent-access test passes |
| 9 | S0.9 | S0.2–S0.8 | Starts/closes without avoidable leftover resources |
| 10 | S0.10 | S0.2 | Keyboard-only core navigation |
| 11 | S0.11 | S0.2–S0.9 | Packaged app launches without dev tree |
| 12 | S0.12 | S0.1–S0.11 | All Stage 0 tests pass; build repeatable — **STOP GATE** |
| 13 | S1.1 | S0.6, S0.8 | Project identified and version-checked |
| 14 | S1.4 | S1.1 | Valid paths resolve; unsafe paths rejected (incl. symlink escapes, §4C) |
| 15 | S1.2 | S0.8, S1.1 | Metadata persists correctly |
| 16 | S1.5 | S1.2, S1.4 | Imported assets registered/retrievable |
| 17 | S1.6 | S1.5, S1.4 | Missing/modified reported accurately |
| 18 | S1.7 | S0.8, S1.2, S1.5 | Interrupted writes don't corrupt metadata |
| 19 | S1.3 | S1.1, S1.2, S1.4, S1.5 | Each op independent; invalid ops error usefully |
| 20 | S1.8 | S1.5, S1.6, S1.7 | Snapshot restored/verified without damaging original |
| 21 | S1.9 | S1.4–S1.8 | Copied project opens on different path — **guardrail gate** |
| 22 | S1.10 | S1.3, S0.4/S0.5 | Users manage projects without DB interaction |
| 23 | S1.11 | S1.1–S1.10 | Sample created/copied/reopened/backed up/restored/verified — **STOP GATE** |
| 24+ | Stage 2+ | Spec gates above | Expand groups to per-task spec (Goal/Deliverables/Acceptance/Deps/Stop) before any code; then follow spec order |

Stage gates [SPEC]: Do not begin Character Studio or real ComfyUI integration until Stage 0 + Stage 1 are complete. Placeholders/mocks only to validate architecture (§16.5).

---

## 6. Approved Architecture Decisions

These are **already binding** — either stated as requirements in the spec, or approved by the owner as guardrails/session protocol. They require no further approval to implement as written.

| ID (source) | Decision | Source |
|---|---|---|
| A1 | Local-first; cloud optional only; never required to open/edit/export a project | [SPEC §2.1, §6.6] |
| A2 | User ownership; never silently replace approved work | [SPEC §2.2, §2.4] |
| A3 | Independent regeneration of every major asset | [SPEC §2.3] |
| A4 | Transparent generation; never invent progress % or ETAs; indeterminate where provider can't report | [SPEC §2.6, §11.1] |
| A5 | Canon is not speculation; explicit/interpreted/AI-suggested/unknown kept distinct | [SPEC §2.7, §8.3] |
| A6 | Secure Electron defaults: context isolation enabled, nodeIntegration disabled, sandbox where compatible, restricted preload, IPC allowlist, argument validation, safe paths, centralized errors/logging | [SPEC §13, §6.1–6.3, S0.3–S0.5] |
| A7 | Renderer has no unrestricted Node/fs access; preload exposes only explicitly approved operations | [SPEC §6.2–6.3] |
| A8 | Core Engine owns business logic, renderer-independent; future headless/CLI support must be possible without rewrite | [SPEC §6.4, Stage 11] |
| A9 | AI access via independent provider adapters (LM Studio, ComfyUI, optional Ollama; cloud later); absence of AI must not prevent opening/editing projects | [SPEC §6.6] |
| A10 | Project portability: all asset references relative to project root; never store absolute machine paths as canonical; prevent traversal; verify files inside permitted structure unless explicitly authorized external ref | [SPEC §7.1–7.2] |
| A11 | SQLite as initial metadata/relationship DB; WAL mode; FK enforcement; busy timeout; migrations; controlled/serialized write access; retry on transient locking; regular backups; writes through Core-Engine-owned service; no uncontrolled concurrent writes | [SPEC §7.3] |
| A12 | Asset registry metadata: UID, type, relative path, dates, content hash, version, approval status, relationships, provenance where applicable; detect missing/moved/corrupted assets | [SPEC §7.4] |
| A13 | Backups/snapshots: creation, restoration, integrity verification, recovery after interrupted ops; Git for source only (not required for user projects) | [SPEC §7.5, §16.7] |
| A14 | Resource Manager + Small GPU Mode as first-class modes; Safe/Balanced/Performance/Custom profiles; hardware detection distinguishes Detected/Unavailable/Unknown; never show 0 for unknown; never fabricate estimates; thermal monitoring optional; Cooling Down as explicit queue/task state distinct from Paused/Failed/Waiting/Complete | [SPEC §3.1, §10] |
| A15 | Generation organized into small independent tasks with persistent records, priorities, pause/cancel/retry, dependencies, partial completion, failure recovery; failed task must not destroy sibling outputs; dependency tracking marks potentially outdated panels without auto-regenerating | [SPEC §6.5, §11] |
| A16 | Generation provenance + version history: prompt/negative, model/hash, LoRAs, seed, exact ComfyUI workflow JSON, node versions, reference IDs, parameters, output hash, timestamp, backend/env; every generation = new version; compare/inspect/restore/approve/vary; approved artwork never silently replaced | [SPEC §12] |
| A17 | Art Style Manager with canonical project default; style variants and panel/scene overrides; priority panel > character > scene > project; style lock strength exposed; style is guidance, not guarantee | [SPEC §9] |
| A18 | Character versioning: multiple visual versions per character; storyboard panels reference exact version; warn on wrong version; completeness tiers Basic/Recommended/Full displayed as guidance, never hard restrictions | [SPEC §8.4] |
| A19 | Approved-reference comparison is first-class: vs previous generation, vs approved portrait/views/location/object | [SPEC §8.8] |
| A20 | Continuity warnings carry severity (Critical/Warning/Informational) and explain what/where/why/what-to-do; user can override; prioritize signal over noise | [SPEC §8.10] |
| A21 | Layout: traditional pages and vertical webtoon both first-class; dialogue/captions separately editable; text never baked into artwork | [SPEC §8.9] |
| A22 | Tech stack and Linux-first order per §14; Electron Forge packaging; Vitest + Playwright; Git | [SPEC §14] |
| A23 | Methodology: Stage→Milestone→Task; §16.2 task fields; completion definition §16.4; no premature subsystem development; testing discipline | [SPEC §16] |
| A24 | Mandatory order: Stage 0 + Stage 1 before Character Studio or real ComfyUI integration | [SPEC §15, §16.5, §23] |

---

## 7. Proposed Decisions Awaiting Approval

All below are **[RECOMMENDATION]** — not approved. Classification: **Required by spec / Necessary clarification of existing requirement / Recommended engineering choice / Optional improvement that can be deferred.** Do not implement as approved until owner marks **[APPROVED CHANGE]**.

### 7.1 External review recommendations (recorded 2026-11-05; NOT approved)

GPT (external review) rated the register 9/10 and recommended the following. Recorded here verbatim as recommendations for owner decision — **none are approved changes yet**.

| Decision | External-review recommendation (not approved) |
|---|---|
| D1 IPC | Approve one method per exposed operation, runtime validation, safe errors. Zod remains a library choice. |
| D2 Electron security | Approve secure defaults from the first window. |
| D3 Preload/CSP | Approve narrow `contextBridge` API. Defer exact CSP directives. |
| D4 Security tests | Approve integration testing as part of S0.3. |
| D5 Canonical store | Approve SQLite as operational metadata authority; define `project.json` as bootstrap manifest with its own limited authority. |
| D6 Asset identity | Approve UID independent of path; defer UUIDv7 vs ULID; refine character-version modeling. |
| D7 Paths | Approve canonical `/`, native translation at filesystem boundary, traversal and symlink protection. |
| D8 SQLite writes | Approve serialized Core Engine writes; choose implementation after selecting the driver. |
| D9 Migrations | Approve a tracked migration mechanism; defer exact format and rollback policy until S0.8. |
| D10 Recovery | Approve preservation of user data and recovery from interrupted operations; defer detailed recovery mechanics until S1.7. |

Also recommended (not approved): (a) S0.1 begins without D1–D10 approval (applied to §1/§11 as a register correction); (b) secure defaults from the first Electron window (Q2); (c) one-task-at-a-time with review of S0.1 before S0.2 (§3).

### D1 — IPC mechanics (before S0.4)
- **Proposal:** One method per channel (e.g. `panelforge:diagnostics.ping`), shared TS types in `src/shared/types`, Zod validation of arguments, standardized envelope `{ ok: true, data } | { ok: false, code, message }`, central registration map; errors sanitized (no stack traces to renderer).
- **Classification:** Allowlist + typed request/response + argument validation + centralized registration → **Required by spec** (S0.4). "Errors returned safely" → **Necessary clarification** (envelope + sanitization). Zod library choice + one-method-per-channel vs single dispatcher → **Recommended engineering choice**.

### D2 — Secure `webPreferences` baseline (before S0.2/S0.3; boundary note in §4B)
- **Proposal:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where compatible [SPEC wording], `webSecurity: true`, `allowRunningInsecureContent: false`, `devTools: false` in packaged builds, `setWindowOpenHandler` denies external opens by default, strict `will-navigate`/`will-attach-webview` handling.
- **Classification:** Context isolation, disabled Node integration, sandbox where compatible → **Required by spec** (S0.3, §13). `webSecurity`, `allowRunningInsecureContent`, devTools-off-in-prod, window-open/navigation hardening → **Necessary clarification** of "secure Electron defaults" (§13).

### D3 — Preload exposure and CSP (before S0.3/S0.4)
- **Proposal — preload:** `contextBridge` only; frozen API object; one method per operation; minimal surface (start with single diagnostic method at S0.5). Preload path resolved in main.
- **Proposal — CSP baseline (security principle accepted; exact directives DEFERRED per external review):**
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self' data:;
  media-src 'self' data: blob:;
  connect-src 'none';
  object-src 'none';
  frame-src 'none';
  base-uri 'self';
  form-action 'none';
  ```
  Open issues recorded per external review 2026-11-05: (1) `frame-ancestors` is **not** enforced via a CSP meta element — it must be delivered as an HTTP response header (main-process `session.webRequest.onHeadersReceived`). (2) `img-src file:` is broad local-file access; prefer a controlled local asset-loading mechanism (e.g. custom protocol served by main) rather than unrestricted `file:` URLs in the baseline. (3) Final policy depends on how Electron serves the renderer and which UI framework (§14, left open) is selected. Dev-server CSP (e.g. Vite HMR) must differ from production CSP. The owner may approve the *principle* (restrictive, self-only) before the exact directive list.
- **Classification:** Restricted preload, explicitly approved operations only → **Required by spec** (§6.3, §13). `contextBridge`-only, frozen API, one method per operation → **Necessary clarification**. CSP directive values → **Recommended engineering choice** (to finalize with S0.3 + UI framework).

### D4 — Security verification harness and Electron integration tests (before S0.3 acceptance)
- **Proposal — test matrix:** (1) Preload exposure: `window.panelforge` equals allowlist; no `require`/`electron`/`fs`/`process`/`global` in renderer; API frozen. (2) Arbitrary IPC access: unregistered channel fails; no raw `ipcRenderer`. (3) Argument validation: invalid/malformed args rejected, sanitized errors, no stacks. (4) Navigation: location changes, `http(s)` opens, `file://` escapes, `window.open` denied/contained. (5) Window creation: `webPreferences` flags asserted in dev and packaged builds. (6) Packaged app: same assertions against Forge-packaged app (§14), devTools off by default. Harness: Vitest (unit) + Playwright with Electron (integration).
- **Classification:** Documented and tested → **Required by spec** (S0.3 acceptance). Six-case matrix → **Necessary clarification**. Harness choice → **Recommended engineering choice**.

### D5 — Canonical project store (before S1.1/S1.2)
- **Proposal:** SQLite (`database/project.db`) is the authoritative operational store. `project.json` at project root is the version marker + minimal metadata (format version + project ID) — i.e. a bootstrap manifest with its own limited authority (external review phrasing). `characters/.../profile.json` and similar JSON are optional human-readable mirrors, regenerated by Core Engine export, never hand-edited masters. If a mirror and DB disagree, DB wins and the mirror is regenerated.
- **Classification:** SQLite as metadata/relationship DB and version marker → **Required by spec** (§7.3, S1.1). Which store wins on conflict → **Necessary clarification** (resolves the §7.1 contradiction). Mirror/export regeneration → **Recommended engineering choice**.

### D6 — Asset identity and character-version model (before S1.4/S1.5)
- **Proposal — asset identity:** Asset identity is a UID (the registry row), not the path. Stored relative path with `/` separators is a mutable attribute. Renaming/moving a file updates the registry row only; business logic never parses identity out of the path.
- **Proposal — character model (clarified per external review, 2026-11-05; to be refined during S1.5 design, NOT yet specified):** Keep three concepts distinct: (a) **Character** = identity entity (e.g. Robert). (b) **Character version / visual incarnation** = a version of that character (e.g. Robert age 8, Robert age 18, per §8.4). (c) **Image asset** = a file associated with a version (e.g. portrait, front view, expression). Example: Robert at age eight = one character identity, several assets/references for that visual version, numerous generated panels consuming those references. Do **not** make every visual reference a separate character, and do **not** confuse an image asset with a character version. The §7.1 folder example (`characters/robert/age-08/references/front.png`) must be read consistently with this model — folder naming is presentation, not entity identity.
- **Classification:** Unique identifier + relative path + type/hash/version/approval/relationships/provenance metadata → **Required by spec** (§7.4). ID-is-identity/path-is-attribute + rename semantics → **Necessary clarification** (resolves UID-vs-path-encoded ambiguity). UUIDv7 vs ULID choice and the exact Character/Version/Asset schema → **Recommended engineering choice** (defer UUID choice; refine modeling at S1.5).

### D7 — Path conventions (before S1.4) — **corrected**
- **Proposal:** Stored relative paths are canonical with **`/`** as the separator (matching §7.1 examples). The Path Service resolves stored form → project root by prefix-check, rejects traversals (`../`), absolute paths, and malformed forms with typed errors. Translation to native OS paths happens **only at the filesystem-access boundary**, never in stored metadata. Filesystem resolution must also resolve **symbolic links** and verify the canonical target remains inside the project root (see S1.4 symlink note).
- **Classification:** Relative-to-project-root only; never absolute as canonical; prevent traversal and verify files stay inside the permitted structure → **Required by spec** (S1.4, §7.2). `/` canonical + fs-boundary translation + symlink checks → **Necessary clarification** aligned to spec examples. Typed-error shapes → **Recommended engineering choice**. External asset references (§7.2 escape hatch) → **Optional improvement that can be deferred** past Stage 1 unless a concrete need appears.

### D8 — Serialized writes and SQLite library (before S0.8) — **corrected**

- **Proposal:** Serialized write transactions are required; the mechanism depends on the selected SQLite library (§14: Drizzle ORM or equivalent, **selected during S0.8**). Candidate mechanisms: single shared synchronous connection, single async connection, or writer queue/mutex at the Core Engine boundary — to be **verified against the selected library** before mandating one. `journal_mode=WAL`, `foreign_keys=ON`, and a busy timeout set at connection time are required pragmas. All writes go through the Core-Engine-owned service. A `withTransaction` helper is proposed only insofar as the library supports it idiomatically.
- **Classification:** WAL, FK enforcement, busy timeout, migrations, controlled + serialized write access, retry on transient locking, regular backups, Core-Engine-owned writer service, no uncontrolled concurrent writes → **Required by spec** (§7.3, S0.8). Any specific async-mutex/writer-queue design → **Recommended engineering choice**, contingent on library selection. Busy-timeout numeric value → **Recommended engineering choice**. Library selection itself is **deferred to S0.8**; S0.1 must not install a database dependency.

### D9 — Migration format (before S0.8/S1.2)
- **Proposal:** Numbered SQL files (`001_initial.sql`, …), `schema_migrations` tracking table, forward-only, auto-run on DB open. No down migrations in MVP.
- **Classification:** Migration mechanism → **Required by spec** (§7.3, S0.8). File naming, tracking-table shape, forward-only, auto-run timing → **Necessary clarification**.

### D10 — Atomic write protocol and recovery (before S1.7)
- **Proposal:** DB mutations via serialized write transactions (§7.3). Any remaining JSON mirror writes use write-temp → fsync → rename. On corrupted/unopenable DB at startup, preserve the file as `.bak-<timestamp>`, surface a recovery dialog, and do not silently overwrite user data.
- **Classification:** Safe metadata writes; recovery from interrupted writes → **Required by spec** (S1.7, §7.5, §13). Temp+fsync+rename → **Recommended engineering choice**. `.bak-<timestamp>` naming + recovery dialog shape → **Optional improvement that can be deferred** to S1.7 design.

### Suggested (unapproved) task splits — not spec
- `S0.3a` — Security test harness (supports S0.3 acceptance; implements D4 matrix).
- `S0.8a` — DB connection + pragmas; `S0.8b` — Service boundary + migrations (keeps 1–2 session size per §16.2 only if owner approves the split).
- `S1.1a` — Project format documentation (bring forward from S1.11).
- `S1.5a` — Asset ID assignment, rename/move contract, orphan policy (before S1.5).

None of the splits above are spec requirements. They are recorded here for owner decision before authorizing implementation.

---

## 8. Engineering Notes and Discoveries

- **Audit correction log (owner-requested refinement, 2026-11-05):** (1) Paths (D7): `/` canonical; native translation only at fs boundary. (2) CSP (D3): bare `default-src 'none'` replaced with allowances; then further qualified per external review (frame-ancestors header-only; `file:` too broad; UI-framework dependency). (3) SQLite (D8): serialized writes required; mutex/queue contingent on library. (4) Security testing (D4): expanded to six Electron integration areas. (5) Task boundaries (S0.1/S0.2): no deliverables moved; secure-defaults-at-S0.2 is a decision (Q2), not a spec requirement.
- **External-review correction log (2026-11-05):** (1) S0.1 precondition contradiction removed (§1, §11 now agree: S0.1 needs no D1–D10 approval). (2) Statuses reconciled with §16.3 (Complete spelling; Needs Clarification as extension). (3) CSP directives deferred as exact policy; frame-ancestors/file: noted. (4) D6 clarified: Character ≠ Character version ≠ Image asset; refine at S1.5. (5) S1.4 symlink-escape tests added as recommendation. (6) Secure defaults from first window recommended (Q2); one-task-at-a-time with S0.1 review recommended (§3).
- **Canonical-store contradiction** (§7.1 vs §7.3): `project.json` + `database/project.db` + `profile.json` with no stated master. Recorded as D5; blocks S1.1.
- **Identity ambiguity** (§7.4 UID vs path-encoded example): Recorded as D6; blocks S1.4/S1.5.
- **Later-stage thinness:** Stages 2–11 are task-group bullets, violating the spec's own §16.2 task definition. Flagged Needs Clarification; no code until expanded.
- **PDF library unspecified** (§14): "Suitable PDF library" — must be chosen before Stage 8/10, not before Stage 0.
- **ComfyUI / LLM model strategy unspecified:** No baseline image model that actually runs on a 6GB GTX 1660 Ti is named; no LLM size/quantization/context named. Recommend spikes before Stage 3+ (see §9, Q5). Not a Stage 0/1 blocker.

---

## 9. Blockers and Unresolved Questions

No blockers to starting S0.1. The following are decision requests, not implementation blockers — except where noted.

| ID | Question | Blocks | Type |
|---|---|---|---|
| Q1 | Approve/deny/modify D1–D10 in §7 (esp. D3 CSP grant list, D5 canonical store, D7 `/` canonical + external-ref deferral, D8 contingent writer mechanism)? Owner direction: approve progressively, at the relevant task. | S0.2–S0.4 (D1–D4), S1.1+ (D5–D7), S0.8 (D8–D9) — phased | Decision (approved approach) |
| Q2 | **Approved — owner, 2026-11-05:** S0.2 must create the initial Electron window with secure defaults from its first launch. S0.3 remains responsible for verification, documentation, and security testing. | S0.2/S0.3 (no spec change) | Approved |
| Q3 | **Deferred to S0.8 — owner, 2026-11-05:** Which SQLite library (Drizzle-equivalent choice) will §14 pin? This determines the D8 serialized-write mechanism. Not an S0.1 prerequisite or decision. | S0.8 | Deferred |
| Q4 | Approve splits S0.3a / S0.8a+b / S1.1a / S1.5a, or keep spec task blocks untouched? Owner direction: defer until the relevant task is close. | Sequencing only; no scope change | Deferred |
| Q5 | Image/LLM baseline models that run on 1660 Ti 6GB. Owner direction: defer until Stage 3 planning. | Stage 3+ planning | Deferred |

---

## 10. Chronological Session and Progress Log

| Date | Entry | Type | Details |
|---|---|---|---|
| 2026-11-05 | Spec review completed | [SPEC] reading | Reviewed `Docs/PanelForge.pdf` v1.2 in full. Repo contains only `Docs/`; no source code. |
| 2026-11-05 | Implementation-readiness audit (v1) | [RECOMMENDATION] | Audit of Foundations 1–3. D1–D10 drafted. |
| 2026-11-05 | Task register v1 created | [APPROVED CHANGE] | Extraction of all Stage/Milestone/Task identifiers. No implementation. |
| 2026-11-05 | Audit refinement + register v2 | [RECOMMENDATION] + [APPROVED CHANGE] (protocol) | Corrected D3/D7/D8/D4; rechecked S0.1/S0.2 boundaries (no moves); classified D1–D10; restructured register; added session protocol. No implementation. |
| 2026-11-05 | External review received and corrections applied (register v3) | [RECOMMENDATION] → register corrections; decisions **not** approved | GPT review (9/10) with 5 corrections: (1) S0.1 precondition contradiction removed; (2) statuses reconciled with §16.3; (3) CSP directives deferred, frame-ancestors/`file:` noted; (4) D6 Character/Version/Asset model clarified; (5) S1.4 symlink tests added. External decision table recorded in §7.1 as recommendations. No implementation; spec PDF untouched. |
| 2026-11-05 | Register v3.1 corrections + S0.1 authorized | [APPROVED CHANGE — owner] | Owner approved: Q2 secure defaults from first window; Q3 SQLite library deferred to S0.8 (removed from S0.1); Q4 splits deferred; Q5 AI baselines deferred; S1.5a removed from §5 implementation order (kept as proposal); one-task-at-a-time promoted to approved stop-and-review protocol. S0.1 authorized. No source files created yet. |

**Test results log:**

| Date | Task | Command / Check | Result | Notes |
|---|---|---|---|---|
| 2026-11-05 | S0.1 | `npm install` (node v22.23.1, npm 12.0.1) | Pass — 166 packages, 0 errors (5 vulns noted, non-blocking for S0.1) | No DB/Electron packages installed (by design). |
| 2026-11-05 | S0.1 | `npm run typecheck` | Pass | Node + web projects typecheck clean. |
| 2026-11-05 | S0.1 | `npm run build` | Pass | Outputs to `out/node`, `out/web` (gitignored). |
| 2026-11-05 | S0.1 | `npm test` | Pass | `tests/baseline.test.js` — 1 passed. (Fixed: initial CJS `require("vitest")` fails; uses `await import("vitest")`.) |
| 2026-11-05 | S0.1 | `npm run check` (`scripts/check.js`) | Pass | Required files present; private package; no premature deps; scripts present. |
| 2026-11-05 | S0.1 | `npm run dev` | Pass | Typecheck + baseline check green. |
| 2026-11-05 | S0.1 | `git status` | Clean | Root commit `55853fb` on `master`; `node_modules/`/`out/` untracked-ignored. |
| 2026-11-05 | S0.2 | `npm install` | Pass — electron `^45.2.3` added, 178 packages total, 0 errors (same 5 vitest-chain vulns, non-blocking) | Only S0.2 dependency added. |
| 2026-11-05 | S0.2 | `npm run typecheck` | Pass | Node + web clean after `rootDir: src` fix. |
| 2026-11-05 | S0.2 | `npm run build` | Pass | `out/node/main/index.js`, `out/node/preload/index.js`, `out/web/renderer/index.html`+`index.js` (was `out/web/index.js` before fix). |
| 2026-11-05 | S0.2 | `npm test` | Pass | `tests/baseline.test.js` — 1 passed. No regression from S0.1. |
| 2026-11-05 | S0.2 | `npm run check` | Pass | Allows+requires electron; main/start correct; zero-IPC guard passes. |
| 2026-11-05 | S0.2 | grep `ipcMain\|ipcRenderer\|contextBridge\|exposeInMainWorld` under `src/` | Pass — no matches | Preload comment reworded so grep stays clean; check.js strips comments. |
| 2026-11-05 | S0.2 | Grep secure defaults in `src/main/index.ts` | Pass — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false` | All present in first `BrowserWindow` construction. |
| 2026-11-05 | S0.2 | Launch 1× `npm start` (`electron .` on Linux Mint, DISPLAY=:0) | Pass — main proc + renderer (`--type=renderer`, `--enable-sandbox`) observed; window loads local HTML | First attempt briefly ran installer (binary download) then relaunched. |
| 2026-11-05 | S0.2 | pkill/clean-close ×3 (`pkill -f electron[.]`) | Pass — each launch terminated; `pgrep -a -f electron` → "no stray electron (clean)"; `window-all-closed → app.quit` path exercised | SIGTERM exits; no stray PIDs remain; GPU errors after kill are from teardown, not startup. |
| 2026-11-05 | S0.2 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.3 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S0.3 | `npm run build` | Pass | `out/node/main/index.js`, `out/node/preload/index.js`, `out/web/renderer/`. |
| 2026-11-05 | S0.3 | `DISPLAY=:0 npm test` | Pass — 13 passed (1 baseline + 12 security) | `tests/security.test.js` static checks: webPreferences flags in compiled main, preload frozen bridge, renderer no-Node. Live probe also passed (see next row). |
| 2026-11-05 | S0.3 | `npm run check` | Pass | IPC guard updated for S0.3 bridge (contextBridge allowed only in preload, ipcRenderer/ipcMain still forbidden). |
| 2026-11-05 | S0.3 | Live renderer probe (Electron + `executeJavaScript`) | Pass — `hasRequire:false, hasProcess:false, hasFs:false, hasElectron:false, hasPanelforge:true` | Renderer cannot access Node.js primitives. `window.panelforge` present (frozen bridge). |
| 2026-11-05 | S0.3 | Launch ×3 `npm start` + `pkill -f electron[.]` clean-close | Pass — each launch started; `pgrep -a -f electron` → "no stray electron (clean)" after each | SIGTERM exits; no stray PIDs remain. GPU errors after kill are teardown artifacts, not startup. |
| 2026-11-05 | S0.3 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.4 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S0.4 | `npm run build` | Pass | `out/node/core/ipc/registry.js` emitted. |
| 2026-11-05 | S0.4 | `DISPLAY=:0 npm test` | Pass — 19 passed (1 baseline + 6 ipc + 12 security) | `tests/ipc.test.js` (Module._load mock): allowlist exactly `panelforge:diagnostics.ping`; invalid args → `INVALID_ARGUMENTS`; safe envelope `{ok:true,data:{ok:true}}`. |
| 2026-11-05 | S0.4 | `npm run check` | Pass | `ipcMain` only in `src/core/ipc/registry.ts`; `contextBridge` only in preload; `ipcRenderer` forbidden everywhere (lands S0.5). |
| 2026-11-05 | S0.4 | Live renderer probe | Pass — `hasRequire:false, hasProcess:false, hasFs:false, hasElectron:false, hasPanelforge:true, hasIpcRenderer:false` | Renderer has no raw IPC; only the frozen bridge. `IPC_CHANNELS` allowlist probe: `{"diagnosticsPing":"panelforge:diagnostics.ping"}`. |
| 2026-11-05 | S0.4 | Launch ×3 `npm start` + `pkill -f electron[.]` | Pass — each started; `pgrep -a -f electron` → "no stray electron (clean)" after each | SIGTERM exits; no stray PIDs. |
| 2026-11-05 | S0.4 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.5 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S0.5 | `npm run build` | Pass | Registry + preload + renderer emitted. |
| 2026-11-05 | S0.5 | `DISPLAY=:0 npm test` | Pass — 21 passed (1 baseline + 7 ipc + 13 security) | `tests/ipc.test.js` now 7 tests (added diagnostics.get); security probe checks `diagnostics.get` call. |
| 2026-11-05 | S0.5 | `npm run check` | Pass | ipcRenderer allowed only in preload for the single approved channel; ipcMain only in registry. |
| 2026-11-05 | S0.5 | Live diagnostic probe (Electron + executeJavaScript) | Pass — `DIAG_RESULT {"ok":true,"data":{appName,electronVersion,nodeVersion,platform,arch,channel:"panelforge:diagnostics.get",timestamp}}` + `NODE_RESULT {hasRequire:false,hasProcess:false,hasPanelforge:true}` | Renderer requests diagnostics via the preload bridge; no direct Node.js access. Root cause of earlier "No handler registered" was the probe script not calling `registerIpcHandlers()` — main itself always registers it. |
| 2026-11-05 | S0.5 | Launch ×3 `npm start` + `pkill -f electron[.]` | Pass | Each started and closed clean; "no stray electron (clean)" after each. |
| 2026-11-05 | S0.5 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.6 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S0.6 | `npm run build` | Pass | `out/node/core/config/service.js` emitted; renderer HTML copied. |
| 2026-11-05 | S0.6 | `npm test` | Pass — 33 passed (1 baseline + 7 ipc + 12 config + 13 security) | `tests/config.test.js` (12 tests, built service + fresh temp userData per test): defaults, settings location `userData/config/config.json`, round-trip, atomic write (no tmp residue), corrupt-JSON backup + defaults, version migration, traversal guard, no hardcoded paths, main ensures dir on startup. |
| 2026-11-05 | S0.6 | `npm run check` | Pass | Baseline + IPC guard green (ipcMain only in registry; ipcRenderer only in preload). |
| 2026-11-05 | S0.6 | Live launch probe ×3 (`timeout 12 electron .`, `PANELFORGE_USER_DATA_DIR=/tmp/opencode/pf-probe-userdata`, `pgrep -x electron`) | Pass — main proc + zygote observed each launch; `/tmp/opencode/pf-probe-userdata/config` created on every launch; `pgrep -x electron` → "no stray electron (clean)" after each | Main ensures the settings location in `app.whenReady` (try/catch, never blocks window). Env override only selects userData for the probe; production uses `app.getPath("userData")`. GPU/MESA teardown errors are artifacts, not startup failures. |
| 2026-11-05 | S0.6 | Config round-trip probe (built service, isolated probe userData) | Pass — `PATH /tmp/opencode/pf-probe-userdata/config/config.json`; `UPDATE {"version":1,"theme":"dark","logLevel":"debug",...}`; `RELOAD` identical; `RESET` back to defaults | Proves read/update/reset against the real settings location with no hardcoded paths. |
| 2026-11-05 | S0.6 | `grep -rn "/home/wetlander" src/core/config/service.ts src/main/index.ts` | Pass — no matches | Acceptance: no hardcoded machine-specific paths. Service resolves userData via `app.getPath("userData")` (env override and `~/.config/panelforge` fallback only for tests). |
| 2026-11-05 | S0.6 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.7 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S0.7 | `npm run build` | Pass | `out/node/core/logging/service.js` emitted. |
| 2026-11-05 | S0.7 | `npm test` | Pass — 45 passed (1 baseline + 12 config + 12 logging + 7 ipc + 13 security) | `tests/logging.test.js` (12 tests, built service + fresh temp userData per test): JSON-line entries at `userData/logs/panelforge.log`, min-level filtering, `logError` records name+message (no stack), rotation into numbered backups within the size limit (max 2 backups in test), redaction (token/password values, home dir), 1024-char cap, never-throws. |
| 2026-11-05 | S0.7 | `npm run check` | Pass | Baseline + IPC guard green (ipcMain only in registry; ipcRenderer only in preload). |
| 2026-11-05 | S0.7 | Live launch probe ×3 (`timeout 12 electron .`, `PANELFORGE_USER_DATA_DIR=/tmp/opencode/pf-probe-logs`, `pgrep -x electron`) | Pass — main proc + zygote observed each launch; each launch appended `{"level":"info","message":"PanelForge starting"}` (88 → 176 → 264 bytes, mode `0600`); `pgrep -x electron` → "no stray electron (clean)" after each | Startup entry is recorded by the central log service with the level from the S0.6 config. GPU/MESA teardown errors are artifacts, not startup failures. |
| 2026-11-05 | S0.7 | `grep` no hardcoded user paths in `src/core/logging/service.ts` | Pass — no `/home/wetlander` or `/Users/`; userData via `app.getPath("userData")` | Logs under userData, never a hardcoded machine-specific path. |
| 2026-11-05 | S0.7 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |

**S0.7 implemented files:** `src/core/logging/service.ts` (New — `createLogService`/`defaultLogService`, JSON-line entries `{timestamp,level,message}` at `<userData>/logs/panelforge.log`, size-limited rotation `512 KiB` → `panelforge-1..3.log`, redaction + 1024-char cap, `logError` name+message without stacks, never-throws; fs/path + Electron only, no new deps), `src/main/index.ts` (sets the log minimum level from the S0.6 config, ensures the log location, records the `PanelForge starting` entry; config-failure path now routes through `logError` instead of `console.error`), `src/core/ipc/registry.ts` (handler errors recorded via `logError`; renderer envelope unchanged), `tests/logging.test.js` (New, 12 tests). Format/rotation/redaction choices are engineering judgment where the spec is silent (documented in service header).

**S0.6 implemented files:** `src/core/config/service.ts` (New — `createConfigService`/`defaultConfigService`, `CONFIG_VERSION=1`, defaults `{theme:"system", logLevel:"info", launchAtStartup:false, diagnosticsEnabled:true}`, settings at `<userData>/config/config.json`, atomic tmp+rename `0o600` writes, defensive load with corrupt backup + migration, traversal guard in `getUserDataSubPath`; fs/path + Electron only, no new deps), `src/main/index.ts` (calls `defaultConfigService.ensureConfigDir()` + `loadConfig()` in `app.whenReady`, try/catch), `tests/config.test.js` (New, 12 tests). Config format/versioning choices are engineering judgment where the spec is silent (documented in service header).

**S0.5 implemented files:** `src/shared/types/index.ts` (DiagnosticsGetArgs/Data), `src/core/ipc/registry.ts` (diagnosticsGet handler returning app/electron/node/platform/arch/timestamp), `src/preload/index.ts` (frozen `diagnostics.get()` wrapping `ipcRenderer.invoke` for the single channel), `src/renderer/index.ts` (calls bridge on load, renders `#diagnostic-status`), `src/renderer/index.html` (`<script type="module">` so ESM `export {}` loads), `tests/ipc.test.js` (diagnostics.get cases), `tests/security.test.js` (bridge diagnostic check), `scripts/check.js` (ipcRenderer allowed only in preload).

**S0.4 implemented files:** `src/shared/types/index.ts` (SafeErrorCode, IpcResult/IpcRequest, DiagnosticsPingArgs/Data), `src/core/ipc/registry.ts` (New — IPC_CHANNELS allowlist, validate + handle, `registerIpcHandlers`), `src/main/index.ts` (calls `registerIpcHandlers()` at startup; no direct `ipcMain.handle`), `src/preload/index.ts` (still frozen empty api — S0.5 adds Pause), `tests/ipc.test.js` (New), `scripts/check.js` (ipcMain only in registry; ipcRenderer forbidden). Zod deferred (D1); validation handwritten.

**S0.3 implemented files:** `src/preload/index.ts` (frozen empty api), `src/main/index.ts` (devTools `!app.isPackaged`; S0.2 secure flags retained), `tests/security.test.js` (New), `Docs/PanelForge-Security-Baseline.md` (New), `scripts/check.js` (IPC guard updated for bridge), `src/renderer/index.ts` (label S0.3). CSP intentionally not added (deferred).

**Cross-checked (2026-11-05):** Before marking S0.2 Complete, I verified `git status` showed the S0.2 working-tree set (above) and re-ran `npm run typecheck` / `npm run build` after the `rootDir` fix — both green, renderer landed in `out/web/renderer/`. The gap was only evidence + register/co­mmit steps, not missing code.

**MESA/GPU note (dev environment, not an S0.2 defect):** Launch logs show `MESA-LOADER: failed to open dri … Permission denied` and post-PKILL zygote/GPU errors. These are sandbox/GPU-teardown artifacts of running Electron-as-root-style (bubblewrap) in this containerized display environment; the app itself launched, renderer ran with `--enable-sandbox`, and closed cleanly. Packaged builds (S0.11) will revalidate GPU.

**Remaining unverified (not bugs):** No headless window-content assertion (e.g. Playwright check that `index.html` renders "PanelForge — initial window"). Window presence was verified by process tree. Real visual verification is deferred to S0.3/S0.12.
S0.2 modified/added: `package.json`, `package-lock.json`, `tsconfig.node.json`, `tsconfig.web.json`, `README.md`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.ts`, `src/renderer/index.html` (new), `scripts/check.js`, `scripts/copy-renderer-html.js` (new). Spec PDF untouched. **No IPC, no DB/AI/UI code created.**

> Append a row for every session: status changes, files created/modified, test commands + results, decisions, discoveries, next task.

---

## 11. Recommended Next Task

### Recommended: S0.1 — Repository and Package Baseline [SPEC §15] — **Complete (awaiting owner review)**

**Status:** **Complete** (2026-11-05, commit 55853fb). Acceptance verified (see §10). **Do not begin S0.2 without explicit owner authorization.**

**Why this task was correct:** First in the mandatory sequence; no dependencies; unblocks S0.2. The SQLite library decision (D8/Q3) did **not** affect S0.1 — deferred to S0.8, no database dependency installed here.

**Goal [SPEC]:** Create the project repository and initial package configuration.

**Files likely to be created or modified [RECOMMENDATION — illustrative only, not spec]:**
- `package.json` (scripts: `dev`, `build`, `typecheck`, `test`, `lint`)
- `tsconfig.json` (and node/web variants if needed)
- `.gitignore`, `README.md`
- Minimal directory scaffolding under `src/` per §21

**Deliverables [SPEC]:** Git repository; Package configuration; Initial directory structure; Basic development scripts; README.

**Acceptance criteria [SPEC]:** Dependencies install successfully; Development scripts execute; Repository contains no generated build artifacts or secrets.

**Tests [RECOMMENDATION — operationalization of spec acceptance, not spec text]:**
- `npm install` succeeds on Linux Mint.
- `npm run typecheck` passes.
- `npm run build` passes (scaffold only; no Electron launch is required to pass S0.1 — launch belongs to S0.2).
- Manual check: repo `git status` clean of `node_modules/`, `dist/`, secrets.

**Stop conditions:**
- **[SPEC]** None stated beyond acceptance.
- **[RECOMMENDATION + owner direction]** Stop and do not proceed to S0.2 until acceptance passes and `git` is tracking the scaffold. Do not add any dependency not needed for Stage 0 (no Drizzle/SQLite, Sharp, or PDF lib until their respective tasks; S0.1 must not install or select a database stack — D8/Q3 are deferred to S0.8). Do not implement any Electron window, IPC, DB, or project code — those are S0.2+.
- **[APPROVED CHANGE — owner, 2026-11-05]** After S0.1 completes, **stop and wait for owner review and authorization before beginning S0.2.** Review covers repository, dependencies, scripts, and Git setup. One task at a time.

### Next task: S0.8 — SQLite Foundation [SPEC §15] — **Awaiting Owner Authorization**

**Status:** **Not Started** — S0.7 Complete (2026-11-05, acceptance verified; see §10). **Do not begin S0.8 without explicit owner authorization.** One-task-at-a-time (approved) stops here.

**Goal [SPEC]:** Establish database infrastructure. **Deliverables [SPEC]:** SQLite connection service; Initial schema; Migration mechanism; WAL mode; Foreign key enforcement; Busy timeout; Serialized write service. **Acceptance [SPEC]:** Database initializes successfully; Migrations execute; Data persists across restarts; Basic concurrent access tests do not cause uncontrolled write failures. **Note:** SQLite library / writer mechanism is D8/Q3 — deferred to S0.8, not decided here.

---

## 12. Change Log for This Register

| Date | Change | Type | Authorized by |
|---|---|---|---|
| 2026-11-05 | Register v1 created (full Stage 0/1 extraction + Stage 2–11 groups) | Extraction from [SPEC] | Owner request |
| 2026-11-05 | Guardrails + maintenance rules recorded | [APPROVED CHANGE] | Owner |
| 2026-11-05 | D1–D10 drafted | [RECOMMENDATION] | Awaiting owner decision |
| 2026-11-05 | Register v2: refinement corrections (D3/D7/D8/D4), S0.1/S0.2 boundary check (no moves), D1–D10 classification, §§1–11 restructure, session protocol added | [RECOMMENDATION] + [APPROVED CHANGE] (protocol) | Owner request |
| 2026-11-05 | Register v3.1: register corrections v3.1 — Q2 approved (secure defaults from first window), Q3/Q4/Q5 deferred (SQLite lib → S0.8; splits → when relevant; AI baselines → Stage 3), S1.5a removed from §5 implementation sequence, one-task-at-a-time promoted to approved stop-and-review protocol. S0.1 authorized. | [APPROVED CHANGE — owner] | Owner |
| 2026-11-05 | S0.1 complete: repo + package baseline implemented and committed (55853fb). Acceptance verified (install/typecheck/build/test/check green). Stopped for owner review before S0.2. | [SPEC] | Crouton (S0.1 implementation) |
| 2026-11-05 | S0.2 authorized (owner) — secure window from first launch; S0.3 remains verify/document/test. | [APPROVED CHANGE — owner] | Owner |
| 2026-11-05 | S0.2 complete (commits 0d73f1a + register dd38b88). Acceptance verified (typecheck/build/test/check green; zero-IPC grep; 3× launches clean). Stopped for owner review before S0.3. | [SPEC] | Crouton (S0.2 implementation) |
| 2026-11-05 | S0.3 authorized (owner) — finish security boundary per D2–D4. | [APPROVED CHANGE — owner] | Owner |
| 2026-11-05 | S0.3 complete. Acceptance verified (typecheck/build/test/check green; live renderer probe proves no Node access; 3× clean-close). Stopped for owner review before S0.4. | [SPEC] | Crouton (S0.3 implementation) |
| 2026-11-05 | S0.4 authorized (owner) — implement IPC Foundation now. | [APPROVED CHANGE — owner] | Owner |
| 2026-11-05 | S0.4 complete. Acceptance verified (19 tests green; allowlist/INVALID_ARGUMENTS/safe-envelope proven; live probe confirms no raw renderer IPC). Stopped for owner review before S0.5. | [SPEC] | Crouton (S0.4 implementation) |
| 2026-11-05 | S0.5 complete. Acceptance verified (21 tests green; live diagnostic probe via preload bridge; no direct Node.js access). Stopped for owner review before S0.6. | [SPEC] | Crouton (S0.5 implementation) |
| 2026-11-05 | S0.6 complete (impl commit 913d575). Acceptance verified (33 tests green incl. 12 config; 3× live launch + config-dir probe; no hardcoded paths). Stopped for owner review before S0.7. | [SPEC] | Crouton (S0.6 implementation) |
| 2026-11-05 | S0.7 complete. Acceptance verified (45 tests green incl. 12 logging; 3× live launch with startup entries recorded; rotation + redaction proven). Stopped for owner review before S0.8. | [SPEC] | Crouton (S0.7 implementation) |

> Every future edit gets a new row. Never silently edit task requirements from the spec; proposed changes go to §9 and require authorization before application.
