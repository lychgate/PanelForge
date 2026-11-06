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
- **Spec gaps blocking later work:** Stages 3–11 still lack per-task Goal/Deliverables/Acceptance/Dependencies/Stop per §16.2 (flagged Needs Clarification, must be expanded before implementation). **Stage 2 is expanded — S2.1–S2.18** (owner, 2026-11-05; 18 micro-tasks, spine-first, LM Studio before ComfyUI, infra only).

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
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit recorded below). **Library decision (D8/Q3, decided during S0.8):** Node's built-in `node:sqlite` (DatabaseSync) — no new dependency, no native build. Drizzle may layer over it later.

#### S0.9 Application Lifecycle Infrastructure [SPEC]
- **Goal [SPEC]:** Provide reliable startup and shutdown behavior.
- **Deliverables [SPEC]:** Startup sequence; Shutdown sequence; Resource cleanup hooks; Basic application lifecycle events.
- **Acceptance [SPEC]:** Application starts and closes without leaving avoidable resources behind.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.2–S0.8.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — "avoidable resources" not enumerated.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit aa2d0b1)

#### S0.10 Keyboard Shortcuts and Navigation Foundation [SPEC]
- **Goal [SPEC]:** Establish basic keyboard accessibility.
- **Deliverables [SPEC]:** Shortcut registration; Basic navigation structure; Shortcut documentation.
- **Acceptance [SPEC]:** Core navigation can be used without relying exclusively on mouse interaction.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.2.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 70c53e3)

#### S0.11 Initial Packaging [SPEC]
- **Goal [SPEC]:** Produce an installable or runnable Linux build.
- **Deliverables [SPEC]:** Linux packaging configuration; Development build; Initial packaged build.
- **Acceptance [SPEC]:** Packaged application launches independently of the development environment.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.2–S0.9.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — packaging format not specified; §14 names Electron Forge [SPEC].
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 23b7897)

#### S0.12 Stage 0 Verification [SPEC]
- **Goal [SPEC]:** Verify the complete foundation.
- **Deliverables [SPEC]:** Smoke tests; Updated README; Known limitations; Stage 0 completion report.
- **Acceptance [SPEC]:** All Stage 0 tests pass; No critical security or startup issues remain; Linux build is repeatable.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.1–S0.11.
- **Stop condition [SPEC]:** Stage 0 stop condition (see Stage header).
- **Completeness:** Complete in spec as a gate.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit a548284). **Stage 0 is complete.**

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
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 3a6d599). **D5 decided (owner-approved 2026-11-05):** SQLite authoritative; `project.json` = version/ID marker; JSON mirrors regenerate from DB.

#### S1.2 Project Metadata Schema [SPEC]
- **Deliverables [SPEC]:** Project database tables; Project identifier; Name and description fields; Creation and modification timestamps.
- **Acceptance [SPEC]:** Project metadata persists correctly.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.8, S1.1.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit a6d8566)

#### S1.3 Basic Project Operations [SPEC]
- **Deliverables [SPEC]:** Create; List; Open; Close; Rename; Archive.
- **Acceptance [SPEC]:** Each operation works independently; Invalid project operations return useful errors.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.1, S1.2, S1.4, S1.5; exercises S0.4 IPC contracts.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — archive/rename/exclusivity semantics unspecified.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit dea5e4c)

#### S1.4 Relative Asset Path Service [SPEC]
- **Deliverables [SPEC]:** Relative path resolution; Path normalization; Path traversal protection.
- **Acceptance [SPEC]:** Valid project paths resolve correctly; Unsafe paths are rejected.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.1.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — spec requires relative-to-root, no absolute canonical paths, traversal prevention (§7.2). External-reference schema and error types unspecified. See D7.
- **Status:** Not Started
- **Acceptance clarification [RECOMMENDATION — external review, 2026-11-05, not spec text]:** In addition to `../../etc/passwd`-style traversal, S1.4 acceptance testing should include **symbolic-link escape tests**: a symlink inside the project pointing outside must be rejected, even when the apparent relative path looks valid. Target filesystem boundary must resolve symlinks and verify the canonical target remains inside the project root. (To be finalized at S1.4 design; recorded here so it isn't missed.)
- **Path convention [RECOMMENDATION — owner-directed, prior refinement]:** Stored relative paths use **`/` as canonical separator**; translate to native OS separators only at the filesystem boundary.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 89214ff)

#### S1.5 Asset Registry [SPEC]
- **Deliverables [SPEC]:** Asset records; Asset type metadata; File hashes; Import and copy operations.
- **Acceptance [SPEC]:** Imported assets are registered and retrievable.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.2, S1.4.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — §7.4 metadata list exists (UID, type, relative path, dates, hash, version, approval, relationships, provenance). Hash algorithm, orphan-file and rename/move semantics unspecified. See D6.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 96b28fd)

#### S1.6 Asset Integrity Checking [SPEC]
- **Deliverables [SPEC]:** Missing asset detection; Hash verification; Integrity report.
- **Acceptance [SPEC]:** Missing or modified assets are reported accurately.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.5, S1.4.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 9ec25bb)

#### S1.7 Atomic Metadata Operations [SPEC]
- **Deliverables [SPEC]:** Safe metadata writes; Recovery from interrupted writes; Basic autosave mechanism.
- **Acceptance [SPEC]:** Interrupted writes do not leave project metadata partially corrupted.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S0.8, S1.2, S1.5.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — atomic mechanism not named. See D10.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit a3d9141)

#### S1.8 Backup and Snapshot System [SPEC]
- **Deliverables [SPEC]:** Snapshot creation; Backup creation; Restore operation; Verification.
- **Acceptance [SPEC]:** A snapshot can be restored and verified without damaging the original project.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.5, S1.6, S1.7.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial — format, dedup, retention, restore-target semantics unspecified.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 24246a5)

#### S1.9 Project Portability Test [SPEC]
- **Deliverables [SPEC]:** Project copy/move test; Path verification; Asset integrity verification.
- **Acceptance [SPEC]:** A copied project opens on a different directory path without relying on the original machine's absolute paths.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.4–S1.8.
- **Stop condition [SPEC]:** None stated (this acceptance is the empirical guardrail gate).
- **Completeness:** Complete in spec as a test.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 78e1949)

#### S1.10 Basic Project Interface [SPEC]
- **Deliverables [SPEC]:** Project list; Create project interface; Open project interface; Basic project information.
- **Acceptance [SPEC]:** Users can manage projects without direct database interaction.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.3, S0.4/S0.5.
- **Stop condition [SPEC]:** None stated.
- **Completeness:** Partial.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 31aa931)

#### S1.11 Stage 1 Test Fixture [SPEC]
- **Deliverables [SPEC]:** Sample project; Automated tests; Project format documentation.
- **Acceptance [SPEC]:** A sample project can be created, copied, reopened, backed up, restored, and verified.
- **Dependencies [SPEC]:** None stated. [RECOMMENDATION] S1.1–S1.10.
- **Stop condition [SPEC]:** Stage 1 stop condition.
- **Completeness:** Complete in spec as a fixture/gate. [RECOMMENDATION] Format doc should begin at S1.1.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 682d753). **Stage 1 is complete.**

### 4D. Stage 2 — AI Orchestration and Resource Management [SPEC §15]

**Goal [SPEC]:** Establish the infrastructure for AI providers and background tasks.  
**Spec note [SPEC]:** Must be divided into small tasks before implementation. Per §16.2 every task requires identifier/goal/scope/deliverable/dependencies/acceptance/stop.

**Breakdown (owner, 2026-11-05):** 18 micro-tasks (one per spec group), sequenced
**spine-first** (records + queue + transitions + pause/retry/progress + recovery),
**then providers** (LM Studio before ComfyUI, health checks, mock testing),
**then resources** (profiles, detection, telemetry, cooling, Small GPU Mode).
Stage 2 is **infra only**: no generation/queue UI (lands with later stages, per
S1.10 and Stage 3+); dependency tracking (§11.5) belongs to Stage 3+.

#### S2.1 Provider Interface Definitions [SPEC]
- **Goal:** Define the contract every AI provider adapter implements.
- **Scope:** Interface (execute, interrupt, progress, health), task-type enumeration, error taxonomy; no real provider code.
- **Deliverables [SPEC]:** Provider interface definitions.
- **Acceptance:** An adapter can implement the contract without renderer/UI dependencies.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S1.7, S1.8.
- **Stop:** Do not begin S2.2 until the interface is reviewed (it shapes all later adapters).
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit c44c989)

#### S2.2 Persistent Task Records [SPEC]
- **Goal:** Persist generation tasks with their §11.1 states.
- **Scope:** Task table in the app DB (12 states: Queued, Preparing, Loading Model, Generating, Post-processing, Saving, Complete, Failed, Paused, Cancelled, Waiting for Resources, Cooling Down).
- **Deliverables [SPEC]:** Persistent task records.
- **Acceptance:** A task (incl. its state, params, timestamps) persists across restarts.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S0.8, S2.1.
- **Stop:** State transitions land in S2.4.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit ca9b34c)

#### S2.3 Task Queue [SPEC]
- **Goal:** Create and execute tasks in order.
- **Scope:** Queue data structure + executor dispatch; no real provider yet (mock executor from S2.1 contract).
- **Deliverables [SPEC]:** Task queue.
- **Acceptance:** Tasks can be created, persisted, and executed (mock executor); interrupted tasks can be resumed where supported.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.1, S2.2.
- **Stop:** Do not add real providers here (S2.9–S2.10).
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit c745a09)

#### S2.4 Task State Transitions [SPEC]
- **Goal:** Enforce ownership of state changes.
- **Scope:** Allowed transition graph + guards over the 12 states; invalid transitions rejected.
- **Deliverables [SPEC]:** Task state transitions.
- **Acceptance:** Only legal transitions succeed; illegal ones fail with typed errors.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.2, S2.3.
- **Stop:** Pause/cancel/retry semantics land in S2.5–S2.6.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit ba43acf)

#### S2.5 Pause and Cancellation [SPEC]
- **Goal:** Let users stop work safely mid-flight.
- **Scope:** Pause (abort/pause between safe checkpoints where the backend permits) and cancel; resumption where supported.
- **Deliverables [SPEC]:** Pause and cancellation.
- **Acceptance:** A running task can be paused and cancelled; cancelled tasks stay cancelled (no resurrection).
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.1, S2.3, S2.4.
- **Stop:** Retry behavior lands in S2.6.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 4f51ecb)

#### S2.6 Retry Handling [SPEC]
- **Goal:** Bounded, explicit retries.
- **Scope:** Retry policy (attempts/backoff), failed-task retry (siblings exact — §11.4 failure isolation preserved).
- **Deliverables [SPEC]:** Retry handling.
- **Acceptance:** A failed task can be retried without disturbing completed siblings.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.4, S2.5.
- **Stop:** No auto-retry storms; no invented progress.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 1b8cbbe)

#### S2.7 Progress Reporting [SPEC]
- **Goal:** Honest, complete status per task.
- **Scope:** Task name, type, queue position, current stage, elapsed, estimated remaining (when meaningful), model/backend, resource profile, status, logs/errors; indeterminate indicator where the provider can't report (no invented percentages, §2.6/§11).
- **Deliverables [SPEC]:** Progress reporting.
- **Acceptance:** Each task's §11.2 fields are readable from records/events; no fabricated percentages.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.2, S2.3.
- **Stop:** Telemetry-specific progress lands with providers (S2.9+).
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit f84e340)

#### S2.8 Queue Persistence and Recovery [SPEC]
- **Goal:** Survive restarts mid-queue.
- **Scope:** Reload persisted tasks on startup; recover interrupted work to a resumable state; batch resumability where the backend supports checkpoints.
- **Deliverables [SPEC]:** Queue persistence and recovery.
- **Acceptance:** After a restart, the queue is intact and interrupted tasks resume (or fail cleanly) — no lost or double-run work.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S0.8, S2.2–S2.7.
- **Stop:** No generation blobs in the queue yet (work arrives with providers' task types).
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 102e31f)

#### S2.9 LM Studio Connection Adapter [SPEC]
- **Goal:** First real provider (smaller local API, faster baseline).
- **Scope:** LM Studio adapter (local connection, health, model listing, completion) implementing S2.1; graceful "provider unavailable" (absence never blocks opening projects, §6.6).
- **Deliverables [SPEC]:** LM Studio connection adapter.
- **Acceptance:** Adapter executes tasks against a real or mock LM Studio endpoint; absence is handled gracefully.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.1, S2.11.
- **Stop:** Model/quant choices are spikes here, not prerequisites (Q5 defers baselines to Stage 3).
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit acdf4c0)

#### S2.10 ComfyUI Connection Adapter [SPEC]
- **Goal:** Second real provider (image generation).
- **Scope:** ComfyUI adapter (local connection, workflow submission/staging, prompt/negative/reference conditioning) implementing S2.1.
- **Deliverables [SPEC]:** ComfyUI connection adapter.
- **Acceptance:** Adapter executes image tasks against a real or mock ComfyUI endpoint; gracefully unavailable when absent.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.9, S2.11.
- **Stop:** Install/version strategy stays a spike within this task.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit b59591f)

#### S2.11 Provider Health Checks [SPEC]
- **Goal:** Know whether a provider is usable before dispatching to it.
- **Scope:** Health probe per adapter (reachable, model present, queue workable); health cached with timestamps.
- **Deliverables [SPEC]:** Provider health checks.
- **Acceptance:** Unreachable/missing-model providers report unhealthy; healthy ones report ready; no dispatch to unhealthy providers.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.9, S2.10.
- **Stop:** Scheduling policy that consumes health lands with resources (S2.13+).
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 362f6dc)

#### S2.12 Mock Provider Testing [SPEC]
- **Goal:** Test generation independently of real providers and UI.
- **Scope:** Scripted mock adapters (success/failure/slow/varied progress) implementing S2.1, usable by tests and the queue.
- **Deliverables [SPEC]:** Mock provider testing.
- **Acceptance:** The whole Stage-2 stage acceptance (create→persist→execute→interrupt→resume→recover) passes against mocks.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.1–S2.11.
- **Stop:** Mocks never ship as production behavior.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 4812845)

#### S2.13 Resource Profiles [SPEC]
- **Goal:** Conservative, user-visible resource policy.
- **Scope:** Safe / Balanced / Performance / Custom profiles (§10.2: memory, queue concurrency, generation size, cooling intervals); never overclock, no unsafe fan assumptions.
- **Deliverables [SPEC]:** Resource profiles.
- **Acceptance:** Selecting a profile constrains queue concurrency + memory behavior; Custom exposes configurable limits.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.3, S2.14.
- **Stop:** Profile enforcement consumes detection/telemetry (S2.14–S2.16) — policy lands here, inputs there.
- **Status:** **Complete** (2026-11-05 — acceptance verified; see §10 test results; impl commit 0438158)

#### S2.14 Hardware Detection [SPEC]
- **Goal:** Know the machine's capability.
- **Scope:** At startup attempt GPU model, VRAM, RAM, CPU, image backends, model services, monitoring capabilities; every signal typed Detected / Unavailable / Unknown (never 0, never fabricated).
- **Deliverables [SPEC]:** Hardware detection.
- **Acceptance:** Each signal reports exactly one of Detected/Unavailable/Unknown; absence is never shown as zero.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.13.
- **Stop:** Stays detection only — scheduling decisions land in S2.13/S2.17.
- **Status:** **In Progress** (2026-11-05 — authorized by owner; implementing)

#### S2.15 Telemetry Adapter Interface [SPEC]
- **Goal:** A stable boundary for optional hardware metrics.
- **Scope:** Adapter interface (temperature, VRAM, etc.) with optional, platform-dependent implementations; metrics typed Detected/Unavailable/Unknown per S2.14.
- **Deliverables [SPEC]:** Telemetry adapter interface.
- **Acceptance:** Adapters can be added per-platform without touching the Resource Manager.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.14.
- **Stop:** Failure semantics land in S2.16; thresholds land with S2.17.
- **Status:** Not Started

#### S2.16 Graceful Telemetry Failure [SPEC]
- **Goal:** Telemetry can fail without failing the app.
- **Scope:** Missing/unobtainable metrics display as Unknown (never 0, no estimate); conservative scheduling defaults; user-configurable cooldown intervals; clear unavailability indication; app stays fully usable without telemetry (§10.4).
- **Deliverables [SPEC]:** Graceful telemetry failure.
- **Acceptance:** Killing telemetry yields Unknown everywhere, conservative scheduling, and an explicit unavailable indicator.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.14, S2.15.
- **Stop:** Pausing on thresholds lands in S2.17.
- **Status:** Not Started

#### S2.17 Cooling Down State [SPEC]
- **Goal:** An explicit, distinguishable thermal pause (§10.5).
- **Scope:** Cooling Down as queue + task state; soft/hard thresholds (user-configurable), pausing new generation tasks, safe handling of active jobs, user notifications, resume per policy once cooled.
- **Deliverables [SPEC]:** Cooling Down state.
- **Acceptance:** Cooling is distinguishable from Paused/Failed/Waiting/Complete, explains why, and resumes correctly.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.4, S2.16.
- **Stop:** PanelForge never claims to control temperature/fans/power (§10.4).
- **Status:** Not Started

#### S2.18 Small GPU Mode [SPEC]
- **Goal:** First-class low-VRAM operation (GTX 1660 Ti-class target).
- **Scope:** One panel/task at a time, sequential model loading, lower-resolution drafts, optional upscaling/tiling, releasing resources, CPU fallback, lower-resource retries after OOM — never auto-overwriting or auto-downgrading approved images.
- **Deliverables [SPEC]:** Small GPU Mode.
- **Acceptance:** A small-GPU profile runs the queue within its memory budget; approved art is never silently replaced.
- **Deps [SPEC]:** None stated. [RECOMMENDATION] S2.13, S2.14, S2.17.
- **Stop:** Target is practical compatibility, not a guarantee for every model/workflow (§10.3).
- **Status:** Not Started

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
| Q3 | **Decided during S0.8 (2026-11-05):** `node:sqlite` (Node built-in) — verified in plain Node and Electron's bundled Node; no new dependency. Drizzle optional later. | S0.8 | Decided |
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
| 2026-11-05 | S0.8 | `npm run typecheck` | Pass | Node + web clean (`src/database/**/*.ts` added to `tsconfig.node.json` include). |
| 2026-11-05 | S0.8 | `npm run build` | Pass | `out/node/database/service.js` emitted. |
| 2026-11-05 | S0.8 | `npm test` | Pass — 55 passed (1 baseline + 12 config + 12 logging + 10 database + 7 ipc + 13 security) | `tests/database.test.js` (10 tests, built service + fresh temp userData per test): pragmas WAL/FK/busy 5000, migrations recorded, persistence across reopen, 20 concurrent serialized writes → count 20, FK enforcement, transaction rollback, backup copy readable, query-before-init fails cleanly. |
| 2026-11-05 | S0.8 | `npm run check` | Pass | Baseline + IPC guard green (ipcMain only in registry; ipcRenderer only in preload). |
| 2026-11-05 | S0.8 | Live launch probe ×3 (`timeout 12 electron .`, `PANELFORGE_USER_DATA_DIR=/tmp/opencode/pf-probe-db`) | Pass — `database ready (journal=wal, migrations=001_initial)` logged each launch; `database/panelforge.db` + `-wal`/`-shm` present; `pgrep -x electron` → "no stray electron (clean)" after each | WAL mode active on disk. GPU/MESA teardown errors are artifacts. |
| 2026-11-05 | S0.8 | Persistence/reopen probe | Pass — reopen returns `{"journalMode":"wal","foreignKeys":true,"busyTimeout":5000,"appliedMigrations":["001_initial"]}`; migrations not re-applied | Data + migration state persist across restarts. |
| 2026-11-05 | S0.8 | Library verification | `node:sqlite` present in plain Node 22.23.1 and Electron's bundled Node 24.22.2 (`ELECTRON_RUN_AS_NODE=1` probe: `DatabaseSync` OK, WAL + FK pragmas OK) | Decision: Node built-in `node:sqlite` — no new dependency, no native build (resolves D8/Q3). |
| 2026-11-05 | S0.8 | `grep` no hardcoded user paths in `src/database/service.ts` | Pass — no `/home/wetlander` or `/Users/`; userData via `app.getPath("userData")` | DB under userData, never a hardcoded machine-specific path. |
| 2026-11-05 | S0.8 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.9 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S0.9 | `npm run build` | Pass | `out/node/core/lifecycle/service.js` emitted. |
| 2026-11-05 | S0.9 | `npm test` | Pass — 65 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 7 ipc + 13 security) | `tests/lifecycle.test.js` (10 tests): ordered steps, async steps, failing-step isolation, state machine idle→starting→ready→closed, events broadcast, reverse-order cleanup, failing-hook isolation, shutdown idempotent, main wiring. |
| 2026-11-05 | S0.9 | `npm run check` | Pass | Baseline + IPC guard green (ipcMain only in registry; ipcRenderer only in preload). |
| 2026-11-05 | S0.9 | Live launch probe ×3 (`PANELFORGE_USER_DATA_DIR=/tmp/opencode/pf-probe-life`) | Pass — `PanelForge starting` → `database ready (journal=wal, …)` → `startup complete` each launch; `pgrep -x electron` → "no stray electron (clean)" after each | Startup sequence runs through the lifecycle service with failure isolation. |
| 2026-11-05 | S0.9 | Shutdown probe (re-probe after adding sync shutdown trace) | Pass — `PanelForge shutting down` → `shutdown complete` recorded; DB close hook ran (no strays) | Before-quit log entry written synchronously so the trace survives exit timing. |
| 2026-11-05 | S0.9 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.10 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S0.10 | `npm run build` | Pass | `out/web/renderer/shortcuts.js` + `navigation.js` emitted. |
| 2026-11-05 | S0.10 | `npm test` | Pass — 77 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 7 ipc + 13 security) | `tests/shortcuts.test.js` (12 tests): registry normalize/match/duplicate rejection, view navigation, shortcut docs, nav landmark + focus styles, renderer wiring, main menu accelerators, **live probe** (Alt+2/Alt+1 keyboard events switch Diagnostics↔About views). |
| 2026-11-05 | S0.10 | `npm run check` | Pass | Baseline + IPC guard green (ipcMain only in registry; ipcRenderer only in preload). |
| 2026-11-05 | S0.10 | Live launch probe ×3 | Pass — `startup complete` each launch; `pgrep -x electron` → "no stray electron (clean)" after each | App menu + new renderer do not break launch/close. |
| 2026-11-05 | S0.10 | `git status` | Clean (commit recorded below) | `out/` and `node_modules/` gitignored. |
| 2026-11-05 | S0.11 | `npm run check` | Pass | Baseline + IPC guard green (Forge devDeps allowed; no DB/AI deps added). |
| 2026-11-05 | S0.11 | `npm test` | Pass — 82 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 7 ipc + 13 security) | New `vitest.config.js` excludes `forge-out/**` (packaged copies were being collected as tests); 5 new packaging tests (deb maker, outDir collision guard, scripts, no native add-ons, forge-out gitignored). |
| 2026-11-05 | S0.11 | `npx electron-forge package` | Pass — `forge-out/panelforge-linux-x64/` (packager `ignore` regexes + deterministic `packageAfterCopy` cleanup: src/tests/docs removed) | Packaged app checked with 0 `*.test.js`/`probe*.js` files. |
| 2026-11-05 | S0.11 | `npx electron-forge make` | Pass — `forge-out/make/deb/x64/panelforge_0.1.0_amd64.deb` + zip fallback | `dpkg-deb --contents` confirms an installable package (no src/tests/docs entries). |
| 2026-11-05 | S0.11 | Packaged binary launch (`forge-out/.../panelforge`, `DISPLAY=:0`, `PANELFORGE_USER_DATA_DIR=…`) | Pass — full lifecycle logged (`starting → database ready → startup complete → shutting down → shutdown complete`); clean-close, no strays | Proves launch **independent of the development environment** (own Electron runtime + resources). |
| 2026-11-05 | S0.11 | .deb extract + launch (`dpkg-deb -x` to temp, run `usr/lib/panelforge/panelforge`) | Pass — same lifecycle log; no strays | Installable artifact verified without installing. |
| 2026-11-05 | S0.11 | `git status` | Clean (commit recorded below) | `out/` + `forge-out/` gitignored. |
| 2026-11-05 | S0.12 | `npm run typecheck` + `npm run build` | Pass | Node + web clean; renderer HTML copied. |
| 2026-11-05 | S0.12 | `DISPLAY=:0 npm test` | Pass — 82 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 7 ipc + 13 security) | Full suite incl. two live Electron probes (security isolation, keyboard nav). |
| 2026-11-05 | S0.12 | `npm run check` | Pass | Baseline + IPC guard green. |
| 2026-11-05 | S0.12 | `DISPLAY=:0 npm run smoke` | Pass — `[smoke] PASS — startup, artifacts, shutdown, no strays` | New `scripts/smoke-test.js`: isolated userData, clean startup/shutdown lifecycle in the app log, artifacts present, no strays. |
| 2026-11-05 | S0.12 | Clean rebuild + packaged launch (`rm -rf forge-out && electron-forge make`, run packaged binary) | Pass — deb + zip rebuilt; packaged `panelforge` full lifecycle; no strays | Linux build is repeatable; packaged app independent of dev env. |
| 2026-11-05 | S0.12 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.1 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S1.1 | `npm run build` | Pass | `out/node/core/project/service.js` emitted. |
| 2026-11-05 | S1.1 | `DISPLAY=:0 npm test` | Pass — 93 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 7 ipc + 13 security) | `tests/project.test.js` (11 tests): marker content, full §7.1 tree, D5 store paths, identify/positive/not-a-project/corrupt/newer-version, traversal + absolute-path rejection, atomic marker write, no hardcoded paths. |
| 2026-11-05 | S1.1 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.1 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.2 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.2 | `DISPLAY=:0 npm test` | Pass — 101 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 7 ipc + 13 security) | `tests/project-metadata.test.js` (8 tests): marker-identity rows, roundtrip, reopen persistence, `updated_at` bump on patch, name validation, ALREADY_EXISTS/NOT_FOUND/null-on-empty, NOT_A_PROJECT propagation, no hardcoded paths. |
| 2026-11-05 | S1.2 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.3 | `npm run typecheck` | Pass | Node + web clean (identify error codes widened into the operation code union). |
| 2026-11-05 | S1.3 | `npm run build` | Pass | `out/node/core/project/operations.js` emitted. |
| 2026-11-05 | S1.3 | `DISPLAY=:0 npm test` | Pass — 110 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 7 ipc + 13 security) | `tests/project-operations.test.js` (9 tests): create+list roundtrip, duplicate/invalid-name/empty-parent rejection, missing-dir NOT_FOUND, junk skip, OPEN/CLOSED exclusivity, NOT_A_PROJECT, rename (folder + metadata, ID stable), INVALID_STATE guards, archive move + list removal. |
| 2026-11-05 | S1.3 | `npm run check` | Pass | Baseline + IPC guard green (no new deps; IPC surface unchanged this task). |
| 2026-11-05 | S1.3 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.4 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S1.4 | `npm run build` | Pass | `out/node/core/project/paths.js` emitted. |
| 2026-11-05 | S1.4 | `DISPLAY=:0 npm test` | Pass — 120 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 7 ipc + 13 security) | `tests/project-paths.test.js` (10 tests): canonical resolution, normalization (`//`, `.`, internal `..`), traversal/absolute/backslash rejection, **symlink escape rejected + internal symlink accepted**, parent-based resolution for non-existent files, storage inverse, no hardcoded paths. |
| 2026-11-05 | S1.4 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.4 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.5 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S1.5 | `npm run build` | Pass | `out/node/core/project/registry.js` emitted. |
| 2026-11-05 | S1.5 | `DISPLAY=:0 npm test` | Pass — 129 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 ipc + 13 security) | `tests/asset-registry.test.js` (9 tests): import copy+hash+row, get by ID, list, copy mints new identity (hash equal), duplicate-path rejection (import + copy), SOURCE_NOT_FOUND/NOT_FOUND/INVALID_ARGUMENTS, traversal rejection, persistence, no hardcoded paths. |
| 2026-11-05 | S1.5 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.5 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.6 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S1.6 | `npm run build` | Pass | `out/node/core/project/integrity.js` emitted. |
| 2026-11-05 | S1.6 | `DISPLAY=:0 npm test` | Pass — 136 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 7 ipc + 13 security) | `tests/asset-integrity.test.js` (7 tests): clean project all-ok, deleted → missing (expected hash kept), tampered → modified (actual hash recorded), mixed damage counts, empty registry, NOT_A_PROJECT, read-only verification. |
| 2026-11-05 | S1.6 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.6 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.7 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S1.7 | `npm run build` | Pass | `out/node/core/project/metadata.js` emitted. |
| 2026-11-05 | S1.7 | `DISPLAY=:0 npm test` | Pass — 144 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 7 ipc + 13 security) | `tests/atomic-metadata.test.js` (8 tests): transaction commit, interrupted-transaction rollback (name/description untouched), serialized concurrent updates, corrupted-DB recovery (`.bak-<timestamp>` preserved, fresh DB works), healthy-DB no-recovery, WAL checkpoint, fsync-backed marker write. |
| 2026-11-05 | S1.7 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.7 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.8 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S1.8 | `npm run build` | Pass | `out/node/core/project/backup.js` emitted. |
| 2026-11-05 | S1.8 | `DISPLAY=:0 npm test` | Pass — 153 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 7 ipc + 13 security) | `tests/backup-snapshot.test.js` (9 tests): snapshot manifest/files/db, verify clean, tamper detection (missing+modified), restore-then-integrity + original undamaged, tampered/occupied/self restore refusal, external backup copy, prune retention (newest kept), NOT_FOUND, no hardcoded paths. |
| 2026-11-05 | S1.8 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.8 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.9 | `DISPLAY=:0 npm test` | Pass — 158 passed (153 + 5 portability) | `tests/portability.test.js` (5 tests): copy to a different directory path opens (identify+metadata+list+integrity ok), move + original gone still opens, no absolute paths in marker/db rows, list works at the new location, identity/metadata unchanged. |
| 2026-11-05 | S1.9 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.9 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.10 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S1.10 | `npm run build` | Pass | Registry + preload + renderer emitted. |
| 2026-11-05 | S1.10 | `DISPLAY=:0 npm test` | Pass — 165 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 7 ipc + 13 security) | `tests/ipc.test.js` now 9 tests (8 channels allowlisted, full project CRUD round-trip through the envelope, typed codes preserved); `tests/project-interface.test.js` (5 tests: preload/registry/renderer wiring, shortcuts doc, **live probe** — Alt+3 shows the Projects view). |
| 2026-11-05 | S1.10 | `npm run check` | Pass | Baseline + IPC guard green (ipcMain only in registry; ipcRenderer only in preload — now two allowlisted project + diagnostics surfaces). |
| 2026-11-05 | S1.10 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S1.11 | `DISPLAY=:0 npm test` | Pass — 167 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 9 ipc + 13 security) | `tests/stage1-fixture.test.js` (2 tests): the full lifecycle — create → identify → list/metadata → import asset → integrity → byte-level COPY → reopen at new path → snapshot → restore (integrity ok) → rename → archive. |
| 2026-11-05 | S1.11 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S1.11 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.1 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.1 | `npm run build` | Pass | `out/node/engines/provider/types.js` emitted. |
| 2026-11-05 | S2.1 | `DISPLAY=:0 npm test` | Pass — 174 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 9 ipc + 13 security) | `tests/provider-contract.test.js` (7 tests): fake adapter conformance, progress validation (indeterminate honest; NaN/out-of-range rejected), health/result taxonomy, error codes, no renderer/UI/network imports. |
| 2026-11-05 | S2.1 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.1 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.2 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.2 | `npm run build` | Pass | `out/node/engines/tasks/store.js` emitted; app DB migration 002 (`002_tasks`). |
| 2026-11-05 | S2.2 | `DISPLAY=:0 npm test` | Pass — 181 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 ipc + 13 security) | `tests/task-records.test.js` (7 tests): create/get roundtrip, restart persistence (new store, same DB), state updates, all 12 states, typed errors, list order, no hardcoded paths. Database migration test updated for 002_tasks. |
| 2026-11-05 | S2.2 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.2 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.3 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.3 | `npm run build` | Pass | `out/node/engines/tasks/queue.js` emitted. |
| 2026-11-05 | S2.3 | `DISPLAY=:0 npm test` | Pass — 190 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 9 ipc + 13 security) | `tests/task-queue.test.js` (9 tests): FIFO one-at-a-time execution, empty queue, failure isolation, ok:false → failed, unregistered-executor fail-closed, progress, `resumeInterrupted` + drain, persisted-restart execution. |
| 2026-11-05 | S2.3 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.3 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.4 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.4 | `npm run build` | Pass | `out/node/engines/tasks/transitions.js` emitted. |
| 2026-11-05 | S2.4 | `DISPLAY=:0 npm test` | Pass — 197 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 9 ipc + 13 security) | `tests/task-transitions.test.js` (7 tests): happy path through states, illegal-transition rejection (terminal states locked), retry edge, crash-resume edges, unknown state/task codes, graph queries. Queue now drives through `transitionTask()` (S2.3 green against the guards). |
| 2026-11-05 | S2.4 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.4 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.5 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.5 | `npm run build` | Pass | `out/node/engines/tasks/queue.js` emitted. |
| 2026-11-05 | S2.5 | `DISPLAY=:0 npm test` | Pass — 204 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 9 ipc + 13 security) | `tests/task-pause.test.js` (7 tests): in-flight pause (no resurrection) + resume, in-flight cancel + no resurrection + cancel-then-resume rejected, interruptors fire best-effort, queued-task pause before start, NOT_FOUND + terminal rejection, cancel-while-queued never executes. |
| 2026-11-05 | S2.5 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.5 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.6 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.6 | `npm run build` | Pass | `out/node/engines/tasks/retry.js` emitted; queue gains `runTask(id)`. |
| 2026-11-05 | S2.6 | `DISPLAY=:0 npm test` | Pass — 210 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 ipc + 13 security) | `tests/task-retry.test.js` (6 tests): flaky-then-ok succeeds within budget, permanent failure stops after N attempts, completed siblings untouched, non-failed retry rejected (INVALID_STATE), NOT_FOUND/INVALID_POLICY, no hardcoded paths. |
| 2026-11-05 | S2.6 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.6 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.7 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.7 | `npm run build` | Pass | `out/node/engines/tasks/progress.js` emitted; app DB migration 003 (`003_task_progress`). |
| 2026-11-05 | S2.7 | `DISPLAY=:0 npm test` | Pass — 219 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 task-progress + 9 ipc + 13 security) | `tests/task-progress.test.js` (9 tests): §11.2 fields, name/model/backend/profile passthrough, estimate null-unless-supplied (never fabricated), indeterminate while generating without estimate, queue positions, started/finished timestamps, describeAllTasks, NOT_FOUND, no hardcoded paths. Database migration test updated for 003. |
| 2026-11-05 | S2.7 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.7 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.8 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.8 | `npm run build` | Pass | `out/node/engines/tasks/recovery.js` emitted. |
| 2026-11-05 | S2.8 | `DISPLAY=:0 npm test` | Pass — 226 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 task-progress + 7 queue-recovery + 9 ipc + 13 security) | `tests/queue-recovery.test.js` (7 tests): restart resume executes exactly once, paused/terminal untouched, idempotent recovery, every running state recovered, summary counts, main wiring. |
| 2026-11-05 | S2.8 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.8 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.9 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.9 | `npm run build` | Pass | `out/node/engines/provider/lmstudio.js` emitted. |
| 2026-11-05 | S2.9 | `DISPLAY=:0 npm test` | Pass — 230 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 task-progress + 7 queue-recovery + 4 lmstudio + 9 ipc + 13 security) | `tests/lmstudio.test.js` (4 tests against a real local HTTP mock: health/execute with SSE streaming, graceful UNAVAILABLE on closed port (never throws), interrupt abort mid-stream, typed HTTP error mapping). |
| 2026-11-05 | S2.9 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.9 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.10 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.10 | `npm run build` | Pass | `out/node/engines/provider/comfyui.js` emitted. |
| 2026-11-05 | S2.10 | `DISPLAY=:0 npm test` | Pass — 235 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 task-progress + 7 queue-recovery + 4 lmstudio + 5 comfyui + 9 ipc + 13 security) | `tests/comfyui.test.js` (5 tests against a real local-HTTP mock: health-ready execute returns base64 images, missing workflow fails closed, closed-port UNAVAILABLE, node_errors typed FAILED, mid-poll interrupt → INTERRUPTED). |
| 2026-11-05 | S2.10 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.10 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.11 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.11 | `npm run build` | Pass | `out/node/engines/provider/health.js` emitted. |
| 2026-11-05 | S2.11 | `DISPLAY=:0 npm test` | Pass — 243 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 task-progress + 7 queue-recovery + 4 lmstudio + 5 comfyui + 8 provider-health + 9 ipc + 13 security) | `tests/provider-health.test.js` (8 tests): ready/unavailable/unknown reports, missing-model unhealthy, monitor cache + timestamps, `requireReady` typed UNHEALTHY, gated executor (0 executions when unhealthy). |
| 2026-11-05 | S2.11 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.11 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.12 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.12 | `npm run build` | Pass | `out/node/engines/provider/mock.js` emitted. |
| 2026-11-05 | S2.12 | `DISPLAY=:0 npm test` | Pass — 253 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 task-progress + 7 queue-recovery + 4 lmstudio + 5 comfyui + 8 provider-health + 10 mock-provider + 9 ipc + 13 security) | `tests/mock-provider.test.js` (10 tests): queue success/failure isolation, S2.1 validator conformance, scripted mixed progress, slow interrupt → INTERRUPTED, queue pause/resume, failNext + bounded retry, health gating (0 dispatches), restart recovery, no production import of mocks. |
| 2026-11-05 | S2.12 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.12 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |
| 2026-11-05 | S2.13 | `npm run typecheck` | Pass | Node + web clean. |
| 2026-11-05 | S2.13 | `npm run build` | Pass | `out/node/engines/tasks/resources.js` emitted. |
| 2026-11-05 | S2.13 | `DISPLAY=:0 npm test` | Pass — 262 passed (1 baseline + 12 config + 12 logging + 10 lifecycle + 10 database + 12 shortcuts + 5 packaging + 11 project + 8 project-metadata + 9 project-operations + 10 project-paths + 9 asset-registry + 7 asset-integrity + 8 atomic-metadata + 9 backup-snapshot + 5 portability + 5 project-interface + 2 stage1-fixture + 7 provider-contract + 7 task-records + 9 task-queue + 7 task-transitions + 7 task-pause + 6 task-retry + 9 task-progress + 7 queue-recovery + 4 lmstudio + 5 comfyui + 8 provider-health + 10 mock-provider + 9 resource-profiles + 9 ipc + 13 security) | `tests/resource-profiles.test.js` (9 tests): preset shapes, unknown/limit rejections, custom limits, oversize detection, parallel-vs-sequential overlap, memory parking, cooling separation, profile stamping, no-overclock guard. |
| 2026-11-05 | S2.13 | `npm run check` | Pass | Baseline + IPC guard green (no new deps). |
| 2026-11-05 | S2.13 | `git status` | Clean (commit recorded below) | `out/` and `forge-out/` gitignored. |

**S2.13 implemented files:** `src/engines/tasks/resources.ts` (New — `resolveResourceProfile` + `RESOURCE_PROFILES` (Safe 1×1024/cooling 3000, Balanced 1×2048, Performance 2×4096, Custom validated 1..4 concurrency/8192 dims/60000 ms cooling), `isOversizedForProfile`, `createProfileQueue` (batch concurrency, waiting-for-resources parking, cooling pauses, `params.resourceProfile` stamping)), `tests/resource-profiles.test.js` (New, 9 tests). Hardware inputs arrive S2.14–S2.16.

**S2.12 implemented files:** `src/engines/provider/mock.ts` (New — `createMockAdapter`: scripted `success`/`failure`/`slow` (cancellable wait → INTERRUPTED) /`mixed` (caller-supplied varied progress; no invented percents), `failNext` for retry testing, `healthStatus` for gating, `getCalls` counting), `tests/mock-provider.test.js` (New, 10 tests proving create→persist→execute→interrupt→resume→recover against mocks).

**S2.11 implemented files:** `src/engines/provider/health.ts` (New — `checkProviderHealth` (probe + shape validation + expected-model verification, malformed → unknown), `createHealthMonitor` (parallel `checkAll`, cached reports, readiness gate), `createGatedExecutor` (typed UNAVAILABLE fast-fail; zero executions against unhealthy providers)), `tests/provider-health.test.js` (New, 8 tests). Scheduling/policy consumption stays S2.13+.

**S2.10 implemented files:** `src/engines/provider/comfyui.ts` (New — `ComfyUiAdapter`/`createComfyUiAdapter`: `system_stats` health, `prompt` submission with node-error detection, `history` polling, per-output image fetch (base64), per-task AbortControllers + best-effort `/interrupt`, typed UNAVAILABLE/TIMEOUT/FAILED/INTERRUPTED codes; Node `fetch` only), `tests/comfyui.test.js` (New, 5 tests). Presence optional (§6.6); install/version strategy stays a spike (Q5).

**S2.9 implemented files:** `src/engines/provider/lmstudio.ts` (New — `LmStudioAdapter`/`createLmStudioAdapter` (OpenAI-compatible `GET /v1/models`, streaming `POST /v1/chat/completions` with SSE progress, per-task AbortController interrupts, typed UNAVAILABLE/TIMEOUT/FAILED/INTERRUPTED codes), `tests/lmstudio.test.js` (New, 4 tests). No new dependencies (Node `fetch`); presence optional (§6.6). Model/quant baselines remain Stage 3 spikes (Q5).

**S2.8 implemented files:** `src/engines/tasks/recovery.ts` (New — `recoverQueue` with `{total, resumed, queued, paused, terminal}` summary), `src/main/index.ts` (`queue-recovery` startup step after database init, logged as `queue recovered (total=…, resumed=…, queued=…)`), `tests/queue-recovery.test.js` (New, 7 tests). Backend checkpoints/resumability arrive with real providers (S2.9–S2.10).

**S2.7 implemented files:** `src/engines/tasks/progress.ts` (New — `describeTask`/`describeAllTasks`: name/type/queue position/stage/status/elapsed/estimate(only when supplied)/model/backend/profile/indeterminate/errorMessage), `src/engines/tasks/store.ts` (started_at/finished_at/error_message columns + setState maintenance), `src/database/service.ts` (migration 003), `tests/task-progress.test.js` (New, 9 tests), `tests/database.test.js` (migration list updated). No invented percentages; telemetry progress lands with providers (S2.9+).

**S2.6 implemented files:** `src/engines/tasks/retry.ts` (New — `retryTaskWithPolicy` with `{maxAttempts, backoffMs}`: only `failed` tasks retry; exponential backoff; guards via `TransitionError`), `src/engines/tasks/queue.ts` (`runTask(id)` single-task execution; `runNextInternal` refactored onto shared `executeOne`), `tests/task-retry.test.js` (New, 6 tests). Bounded in-memory attempt tracking (no schema change); auto-retry storms prevented structurally.

**S2.5 implemented files:** `src/engines/tasks/queue.ts` (pauseTask/cancelTask/resumeTask + per-type interruptor map + late-result-ignored settle), `src/engines/tasks/transitions.ts` (queued→paused edge for pausing before start; generating/loading-model→complete for fast executors reporting no intermediate stages), `tests/task-pause.test.js` (New, 7 tests). Retry behavior remains S2.6.

**S2.4 implemented files:** `src/engines/tasks/transitions.ts` (New — allowed transition graph over the 12 states, `canTransition`/`allowedNextStates`, guarded `transitionTask` with `TransitionError`/`NOT_FOUND`), `src/engines/tasks/queue.ts` (runs through `transitionTask`; progress transition awaited before final transition — race fixed), `tests/task-transitions.test.js` (New, 7 tests). Records keep an administrative `setState`; the queue path is guarded. Pause/cancel/retry handlers land in S2.5/S2.6.

**S2.3 implemented files:** `src/engines/tasks/queue.ts` (New — `createTaskQueue(store, executors)`: `enqueue`, `runNext`, `runUntilIdle`, `resumeInterrupted`; FIFO rowid order; `queued → preparing → generating → complete/failed` driving; failure isolation), `src/engines/tasks/store.ts` (list ordered by rowid for deterministic FIFO), `tests/task-queue.test.js` (New, 9 tests). No real providers; pause/cancel (S2.5) and transition ownership (S2.4) remain later.

**S2.2 implemented files:** `src/engines/tasks/store.ts` (New — `TaskStore` over the app DB: `createTask`/`getTask`/`listTasks`/`setState`, 12 §11.1 machine states, JSON params, optional project link, UUID identity; `defaultTaskStore` singleton), `src/database/service.ts` (migration 002 `tasks`), `tests/task-records.test.js` (New, 7 tests), `tests/database.test.js` (migration list updated). Records layer only — no queueing (S2.3), no transition ownership (S2.4).

**S2.1 implemented files:** `src/engines/provider/types.ts` (New — `ProviderAdapter` contract execute/interrupt/health, `TaskType` (`text`/`image`), `ProviderStage`, `ProviderProgress` (percent only when measured), `ProviderErrorCode` (7), health statuses, validators, `listTaskTypes`), `tests/provider-contract.test.js` (New, 7 tests). Types + validators only; no real provider code; zero renderer/UI/Electron/network imports.

**S1.11 implemented files:** `tests/stage1-fixture.test.js` (New, 2 tests — the fixture itself; no production code changed), `Docs/PanelForge-Project-Format.md` (fixture section). **Stage 1 is complete.**

**S1.10 implemented files:** `src/shared/types/index.ts` (ProjectSummary + 6 args/data contracts; project SafeErrorCodes preserved), `src/core/ipc/registry.ts` (`panelforge:project.{create,list,open,close,rename,archive}` + validation + typed-code mapping, library dir `<userData>/projects`), `src/preload/index.ts` (frozen `project.*` bridge), `src/renderer/index.ts` (Projects view: create form + list with Open/Close/Rename/Archive, Alt+3), `Docs/PanelForge-Shortcuts.md` (Alt+3 documented), `tests/ipc.test.js` (9 tests), `tests/project-interface.test.js` (New, 5 tests). Users never touch SQL — the renderer talks only to the bridge.

**S1.9 implemented files:** `tests/portability.test.js` (New, 5 tests — the portability proof itself; no production code changed). The copied project is opened through the normal APIs (identify, metadata, operations list, registry, integrity) at the new location.

**S1.8 implemented files:** `src/core/project/backup.ts` (New — `createSnapshot` (in-project `backups/snapshots/<id>/` with `manifest.json` SHA-256 map), `listSnapshots`, `verifySnapshot` (manifest byte-hash check), `createBackup` (external copy), `restoreSnapshot` (fresh-target restore + identify/integrity verification, original never written), `pruneSnapshots` (explicit retention)), `tests/backup-snapshot.test.js` (New, 9 tests). Semantics for unspecified format/retention/restore: snapshot contains marker+db+files (symlinks dereferenced, `backups/` excluded), backups copy a snapshot out of the project, restores only into fresh targets. Dedup remains future work.

**S1.7 implemented files:** `src/core/project/metadata.ts` (integrity-check on open + corruption recovery preserving `<db>.bak-<timestamp>` with `recovered`/`backupPath` reporting; `withMetadataTransaction` serialized batches; `checkpointProjectDatabase` WAL checkpoint = basic autosave; versioned migrations shared by all project DB users), `src/core/project/service.ts` (marker write: fsync + atomic rename), `tests/atomic-metadata.test.js` (New, 8 tests). Recovery dialog deferred (D10 UI scope); write-through commit semantics = no dirty state to lose.

**S1.6 implemented files:** `src/core/project/integrity.ts` (New — `verifyProjectIntegrity`: per-asset `ok|missing|modified|unreadable` with expected/actual SHA-256, summary counts, symlink-safe resolution via S1.4, no mutations, project ID + timestamp), `tests/asset-integrity.test.js` (New, 7 tests).

**S1.5 implemented files:** `src/core/project/registry.ts` (New — `importAsset` (external copy-in + SHA-256 + row), `copyAsset` (new identity), `getAsset`, `listAssets`, `AssetError` typed codes; UID identity per D6; path uniqueness enforced), `src/core/project/metadata.ts` (migration 002 `assets` table + shared open/queue helpers exported), `tests/asset-registry.test.js` (New, 9 tests). S1.5 subset of §7.4: version/approval/relationships/provenance remain later tasks.

**S1.4 implemented files:** `src/core/project/paths.ts` (New — `normalizeRelative` (lexical canonicalization), `resolveInProject` (canonicalize + join + symlink-resolved boundary check), `toStoragePath` (inverse), `PathError` typed codes), `tests/project-paths.test.js` (New, 10 tests). Translation to native separators happens only in the resolution step; tests cover the external-review symlink clarification.

**S1.3 implemented files:** `src/core/project/operations.ts` (New — `ProjectOpError` with typed codes; `createProjectAt`, `listProjects`, `openProject`, `closeProject`, `renameProject`, `archiveProject`, `createProjectManager` (open-set exclusivity), `defaultProjectManager`), `tests/project-operations.test.js` (New, 9 tests). Semantics for unspecified archive/rename/exclusivity: rename = folder + metadata name (ID unchanged), archive = move to sibling `.archived/`, open/close = in-process exclusivity set (documented judgment). No IPC channels added this task (reserved to S1.10 UI work).

**S1.2 implemented files:** `src/core/project/metadata.ts` (New — project DB service on `database/project.db`: `projects(project_id, name, description, created_at, updated_at)`, WAL/FK/busy 5000, tracked migrations, serialized writes with busy retry, `create/get/update` API, typed `ProjectMetadataError` codes), `Docs/PanelForge-Project-Format.md` (metadata section), `tests/project-metadata.test.js` (New, 8 tests). Marker remains the identity (D5); the row holds the description (name/description/timestamps).

**S1.1 implemented files:** `src/core/project/service.ts` (New — `PROJECT_FORMAT_VERSION=1`, full §7.1 `PROJECT_DIRECTORIES`, `ProjectMetadata` `{formatVersion, projectId, createdAt}`, `createProject` (tree + atomic marker), `identifyProject` (identification + version check with typed codes), `resolveProjectPath` (D7 relative-path enforcement)), `Docs/PanelForge-Project-Format.md` (New — folder specification), `tests/project.test.js` (New, 11 tests). Owner adopted D5 (SQLite authoritative; `project.json` = version/ID marker; JSON = regenerable mirrors) — recorded as decision + [APPROVED CHANGE — owner].

**S0.12 implemented files:** `scripts/smoke-test.js` (New — repeatable end-to-end launch check: isolated userData, lifecycle log assertions, artifact checks, no-strays; skips when headless), `package.json` (`smoke` script), `Docs/PanelForge-Stage0-Completion.md` (New — Stage 0 completion report: acceptance checklist, delivered table, known limitations, Stage 1 entry notes), `README.md` (S0.12/Stage-0-complete status, smoke command, Known limitations section).

**S0.11 implemented files:** `forge.config.js` (New — `outDir: "forge-out"` separating Forge output from the compiled `out/` app, `.deb` maker + zip fallback, ignore list + `packageAfterCopy` cleanup hook), `package.json` (`package`/`make` scripts; `@electron-forge/cli`, `maker-deb`, `maker-zip` devDeps), `.gitignore` (`forge-out/`), `vitest.config.js` (New — excludes `forge-out/**` and `out/**` from test collection), `tests/packaging.test.js` (New, 5 tests). No native modules are used (`node:sqlite` is built-in), so the package is self-contained with no rebuild step.

**S0.10 implemented files:** `src/renderer/shortcuts.ts` (New — DOM-free shortcut registry: normalized combos, exact match, duplicate rejection), `src/renderer/navigation.ts` (New — DOM-free view manager: list/current/go with unknown-view rejection), `src/renderer/index.ts` (real focusable nav buttons, `keydown` handling for Alt+1/Alt+2, Diagnostics + About views rendered from the S0.5 payload; `.js`-suffixed ESM imports), `src/renderer/index.html` (labelled `<nav>`, `<main>`, `:focus-visible` outline), `src/main/index.ts` (application menu: File Quit `CmdOrCtrl+Q`, View Reload `CmdOrCtrl+R`), `Docs/PanelForge-Shortcuts.md` (New — shortcut documentation), `tests/shortcuts.test.js` (New, 12 tests). Views are minimal but real (both render the diagnostics payload); Settings/Character UI remain later tasks.

**S0.9 implemented files:** `src/core/lifecycle/service.ts` (New — `createLifecycleService`/`defaultLifecycleService`: ordered failure-isolated startup steps with summaries, reverse-order failure-isolated cleanup hooks, idempotent `shutdown()`, state machine idle→starting→ready→shutting-down→closed, `startup:step|complete` + `shutdown:step|complete` events; dependency-free callbacks), `src/main/index.ts` (startup rewired through lifecycle steps `ipc → config+logging → database`; `registerCleanup("database")`; `before-quit` triggers `shutdown()`; `window-all-closed`/`activate` retained), `tests/lifecycle.test.js` (New, 10 tests). Shutdown summary is best-effort (the synchronous `PanelForge shutting down` entry is the guaranteed trace).

**S0.8 implemented files:** `src/database/service.ts` (New — `createDatabaseService`/`defaultDatabaseService`; `node:sqlite` DatabaseSync; `<userData>/database/panelforge.db`; pragmas WAL/FK/busy 5000 at open; in-code numbered migrations + `schema_migrations` tracking, auto-run on open; serialized write queue + `transaction()` with busy retry (max 3); `backupDatabase()` into `database/backups/`; `close()` on quit), `src/main/index.ts` (initializes DB on startup + logs `database ready …`, `logError` on failure without blocking launch, `before-quit` close), `tsconfig.node.json` (include `src/database/**/*.ts`), `tests/database.test.js` (New, 10 tests). Initial schema is intentionally minimal (`schema_migrations` + `kv_store` smoke table); project schema belongs to Stage 1. Automatic backup scheduling and corrupted-DB recovery dialog remain deferred (D10).

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

### Next task: S2.14 — Hardware Detection [SPEC §15] — **Awaiting Owner Authorization**

**Status:** **Not Started** — S2.13 Complete (2026-11-05, acceptance verified; see §10). **Do not begin S2.14 without explicit owner authorization.** One-task-at-a-time (approved) stops here.

**Goal [SPEC]:** Startup hardware detection (GPU/VRAM/RAM/CPU/backends/services/monitoring) with every signal typed Detected/Unavailable/Unknown — never 0, never fabricated.

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
| 2026-11-05 | S0.8 complete. Acceptance verified (55 tests green incl. 10 database; 3× live launch with `database ready (journal=wal, …)`; WAL + persistence + serialized writes proven). D8/Q3 decided: `node:sqlite`. Stopped for owner review before S0.9. | [SPEC] | Crouton (S0.8 implementation) |
| 2026-11-05 | S0.9 complete. Acceptance verified (65 tests green incl. 10 lifecycle; 3× live launch `startup complete`; shutdown `PanelForge shutting down` → `shutdown complete`; no strays). Stopped for owner review before S0.10. | [SPEC] | Crouton (S0.9 implementation) |
| 2026-11-05 | S0.10 complete. Acceptance verified (77 tests green incl. 12 shortcuts + live Alt+2/Alt+1 probe; 3× clean launch). Stopped for owner review before S0.11. | [SPEC] | Crouton (S0.10 implementation) |
| 2026-11-05 | S0.11 complete. Acceptance verified (82 tests green incl. 5 packaging; `package` + `make` produce runnable dir + .deb; packaged binary and extracted .deb both launched with full lifecycle independently of the dev environment). Stopped for owner review before S0.12. | [SPEC] | Crouton (S0.11 implementation) |
| 2026-11-05 | S0.12 complete. Acceptance verified (82 tests green; smoke test PASS; clean rebuild + packaged launch with full lifecycle). **Stage 0 is complete.** Stopped for owner review before S1.1. | [SPEC] | Crouton (S0.12 implementation) |
| 2026-11-05 | S1.1 complete (D5 owner-approved). Acceptance verified (93 tests green incl. 11 project; full §7.1 tree + marker + identify/version-check). Stopped for owner review before S1.2. | [SPEC] | Crouton (S1.1 implementation) |
| 2026-11-05 | S1.2 complete. Acceptance verified (101 tests green incl. 8 project-metadata; projects table persists across reopen). Stopped for owner review before S1.3. | [SPEC] | Crouton (S1.2 implementation) |
| 2026-11-05 | S1.3 complete. Acceptance verified (110 tests green incl. 9 project-operations; all six operations independent; typed errors). Stopped for owner review before S1.4. | [SPEC] | Crouton (S1.3 implementation) |
| 2026-11-05 | S1.4 complete. Acceptance verified (120 tests green incl. 10 project-paths; canonical resolution + traversal/symlink rejection). Stopped for owner review before S1.5. | [SPEC] | Crouton (S1.4 implementation) |
| 2026-11-05 | S1.5 complete. Acceptance verified (129 tests green incl. 9 asset-registry; import/copy + SHA-256 hashes + UID identity). Stopped for owner review before S1.6. | [SPEC] | Crouton (S1.5 implementation) |
| 2026-11-05 | S1.6 complete. Acceptance verified (136 tests green incl. 7 asset-integrity; missing/modified reported accurately). Stopped for owner review before S1.7. | [SPEC] | Crouton (S1.6 implementation) |
| 2026-11-05 | S1.7 complete. Acceptance verified (144 tests green incl. 8 atomic-metadata; interrupted transactions roll back; corruption preserved + fresh start). Stopped for owner review before S1.8. | [SPEC] | Crouton (S1.7 implementation) |
| 2026-11-05 | S1.8 complete. Acceptance verified (153 tests green incl. 9 backup-snapshot; snapshot/backup/restore/verify; tampered + unsafe restores refused; original undamaged). Stopped for owner review before S1.9. | [SPEC] | Crouton (S1.8 implementation) |
| 2026-11-05 | S1.9 complete. Acceptance verified (158 tests green incl. 5 portability; copy/move proof; no absolute paths stored). Stopped for owner review before S1.10. | [SPEC] | Crouton (S1.9 implementation) |
| 2026-11-05 | S1.10 complete. Acceptance verified (165 tests green incl. 5 project-interface + live Alt+3 probe; full project CRUD through IPC/preload). Stopped for owner review before S1.11. | [SPEC] | Crouton (S1.10 implementation) |
| 2026-11-05 | S1.11 complete. Acceptance verified (167 tests incl. 2 stage1-fixture; full lifecycle create/copy/reopen/backup/restore/verify). **Stage 1 is complete.** Stopped for owner review before S2.1. | [SPEC] | Crouton (S1.11 implementation) |
| 2026-11-05 | S2.1 complete. Acceptance verified (174 tests incl. 7 provider-contract; adapter contract without renderer/UI deps). Stopped for owner review before S2.2. | [SPEC] | Crouton (S2.1 implementation) |
| 2026-11-05 | S2.2 complete. Acceptance verified (181 tests incl. 7 task-records; rows persist across restarts; all 12 states). Stopped for owner review before S2.3. | [SPEC] | Crouton (S2.2 implementation) |
| 2026-11-05 | S2.3 complete. Acceptance verified (190 tests incl. 9 task-queue; FIFO execution; failure isolation; resume to queued). Stopped for owner review before S2.4. | [SPEC] | Crouton (S2.3 implementation) |
| 2026-11-05 | S2.4 complete. Acceptance verified (197 tests incl. 7 task-transitions; only legal transitions succeed; S2.3 green against the guards). Stopped for owner review before S2.5. | [SPEC] | Crouton (S2.4 implementation) |
| 2026-11-05 | S2.5 complete. Acceptance verified (204 tests incl. 7 task-pause; in-flight pause/cancel with no resurrection; resume works; cancel stays cancelled). Stopped for owner review before S2.6. | [SPEC] | Crouton (S2.5 implementation) |
| 2026-11-05 | S2.6 complete. Acceptance verified (210 tests incl. 6 task-retry; bounded retries; sibling isolation). Stopped for owner review before S2.7. | [SPEC] | Crouton (S2.6 implementation) |
| 2026-11-05 | S2.7 complete. Acceptance verified (219 tests incl. 9 task-progress; §11.2 fields readable; no fabricated estimates). Stopped for owner review before S2.8. | [SPEC] | Crouton (S2.7 implementation) |
| 2026-11-05 | S2.8 complete. Acceptance verified (226 tests incl. 7 queue-recovery; restart resumes without loss or double-runs; recovery wired into startup). Stopped for owner review before S2.9. | [SPEC] | Crouton (S2.8 implementation) |
| 2026-11-05 | S2.9 complete. Acceptance verified (230 tests incl. 4 lmstudio; streaming execution, interrupt, graceful absence against a local mock). Stopped for owner review before S2.10. | [SPEC] | Crouton (S2.9 implementation) |
| 2026-11-05 | S2.10 complete. Acceptance verified (235 tests incl. 5 comfyui; prompt→history→image flow, node-error mapping, interrupt, graceful absence against a local mock). Stopped for owner review before S2.11. | [SPEC] | Crouton (S2.10 implementation) |
| 2026-11-05 | S2.11 complete. Acceptance verified (243 tests incl. 8 provider-health; unhealthy reports + gated no-dispatch). Stopped for owner review before S2.12. | [SPEC] | Crouton (S2.11 implementation) |
| 2026-11-05 | S2.12 complete. Acceptance verified (253 tests incl. 10 mock-provider; full create→recover acceptance against mocks, zero production wiring). Stopped for owner review before S2.13. | [SPEC] | Crouton (S2.12 implementation) |
| 2026-11-05 | S2.13 complete. Acceptance verified (262 tests incl. 9 resource-profiles; batch concurrency + memory parking + cooling + custom limits). Stopped for owner review before S2.14. | [SPEC] | Crouton (S2.13 implementation) |

> Every future edit gets a new row. Never silently edit task requirements from the spec; proposed changes go to §9 and require authorization before application.
