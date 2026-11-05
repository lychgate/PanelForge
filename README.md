# PanelForge

Local-first desktop application for creating illustrated stories, comics, graphic novels, and webtoons using a combination of traditional creative tools and AI-assisted production.

> **Authoritative spec:** [`Docs/PanelForge.pdf`](Docs/PanelForge.pdf) — Product & Technical Design Specification, v1.2 Consolidated Development Baseline, Approved for Development.
>
> **Operational record:** [`Docs/PanelForge-Task-Register.md`](Docs/PanelForge-Task-Register.md) — task register, decision log, and progress tracker. The spec remains the authoritative source of requirements; the register records how work proceeds against it.

**Positioning:** A local-first comic studio built for creators, not just people with flagship GPUs. Generation may take longer on modest systems, but the process stays manageable through sequential processing, visible progress, resource-aware scheduling, and independently saved results. Primary hardware target: NVIDIA GTX 1660 Ti class systems (~6 GB VRAM). Initial platform: Linux Mint.

## Prerequisites

- Node.js >= 22, npm >= 10
- Linux Mint (initial development platform)
- Git

## Quick start

```bash
npm install
npm run build      # compile TS to out/node (main/preload) + out/web (renderer) + copy index.html
npm start          # launch Electron (reads package.json "main": out/node/main/index.js)
npm run dev        # runs typecheck + baseline check (does NOT build or launch)
npm run typecheck  # TypeScript check for node + web projects
npm test           # runs Vitest placeholder tests
npm run check      # verifies baseline incl. zero IPC surface under src/ (S0.2)
npm run lint       # ESLint over TypeScript sources
```

Launch flow (S0.2): `npm run build` → `npm start`. `npm start` is launch-only (`electron .`); it does not rebuild. `npm run dev` remains typecheck + baseline check only.

## Project layout (per §21 of the spec)

```
src/
  main/        Electron main process (lifecycle, windows, IPC, fs)
  preload/     Restricted preload bridge (allowlisted API only)
  renderer/    UI (no Node.js access)
  core/        Business logic, renderer-independent (projects, tasks, events, config, logging, resources)
  engines/     LLM, image, analysis, export
  modules/     manuscripts, characters, locations, objects, styles, storyboards, artwork, continuity, publishing
  database/    SQLite schema + migrations
  shared/      Shared types + interfaces
workflows/     ComfyUI workflow templates (Stage 7+)
resources/
tests/
scripts/
```

> Do not create empty modules for appearance. Introduce a subsystem when needed by the current development stage.

## Technology stack (per §14)

Electron, TypeScript, Node.js, SQLite, Drizzle ORM or equivalent, LM Studio (local LLM), ComfyUI (image generation), Sharp (image processing), SVG/Canvas (page composition), suitable PDF library, DOCX/EPUB/PDF parsers, Vitest + Playwright (testing), Electron Forge (packaging), Git.

## Development status

- **Stage 0 (S0.1):** Repository and package baseline — complete scaffold, no Electron window yet.
- **Stage 0 (S0.2):** Electron application launch — completes launch/close verification; secure defaults from first window (Q2). S0.3 (security verification/docs) + S0.4+ (IPC/logging/DB) remain gated by owner review per the task register. Launch: `npm run build` → `npm start`.

## Design principles (per §2, summary)

Local-first; user ownership; independent regeneration; preserve approved work (generations are new versions, never silent replacements); hardware accessibility (Small GPU Mode is first-class); transparent generation (no invented progress percentages); canon is not speculation (explicit / interpreted / AI-suggested / unknown kept distinct); small, independently testable development tasks.

## License

Private project. All rights reserved.
