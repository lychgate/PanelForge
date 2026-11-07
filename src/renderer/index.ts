// PanelForge — renderer entry (S0.10).
//
// Renders the app shell with keyboard-accessible core navigation and
// surfaces the S0.5 diagnostic: on load, the renderer calls the preload
// bridge and displays the main-process response. The renderer has no
// direct Node.js or ipcRenderer access — only the preload bridge.
//
// Views (all real, keyboard-reachable):
// - Diagnostics: pending/ok/error status from the bridge (S0.5).
// - About: app/Electron/Node/platform info from the same payload.
//
// Navigation: nav buttons are real <button> elements (Tab + Enter work);
// shortcut registry maps Alt+1/Alt+2 to views (see
// Docs/PanelForge-Shortcuts.md).

import { createNavigation } from "./navigation.js";
import { createShortcutRegistry } from "./shortcuts.js";

export {};

type DiagnosticsData = {
  appName: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  channel: string;
  timestamp: string;
};

type DiagnosticsResult = {
  ok: boolean;
  data?: DiagnosticsData;
  code?: string;
  message?: string;
};

type ProjectSummary = {
  root: string;
  projectId: string;
  name: string;
};

type ProjectResult<T> = {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
};

type PanelForgeApi = {
  diagnostics: {
    get(): Promise<DiagnosticsResult>;
  };
  project: {
    create(args: { name: string; description?: string | null }): Promise<
      ProjectResult<{ root: string; projectId: string }>
    >;
    list(): Promise<ProjectResult<{ projects: ProjectSummary[] }>>;
    open(root: string): Promise<ProjectResult<ProjectSummary>>;
    close(root: string): Promise<ProjectResult<{ closed: true }>>;
    rename(root: string, newName: string): Promise<ProjectResult<{ root: string; projectId: string }>>;
    archive(root: string): Promise<ProjectResult<{ root: string; projectId: string }>>;
  };
  storyboard: {
    list(args: { root: string }): Promise<ProjectResult<any>>;
    panelDetails(args: { root: string; panelId: string }): Promise<ProjectResult<any>>;
    createPanel(args: { root: string; sceneId: string }): Promise<ProjectResult<any>>;
    setText(args: { root: string; panelId: string; dialogue?: string; captions?: string; actions?: string; expressions?: string }): Promise<ProjectResult<any>>;
    setCamera(args: { root: string; panelId: string; shotType: string; angle?: string }): Promise<ProjectResult<any>>;
    setInstructions(args: { root: string; panelId: string; compositionPrompt?: string; backgroundDetail?: string; artDirectionNotes?: string }): Promise<ProjectResult<any>>;
    snapshotsList(args: { root: string }): Promise<ProjectResult<any>>;
    snapshotCreate(args: { root: string; name?: string; parentSnapshotId?: string }): Promise<ProjectResult<any>>;
    snapshotRestore(args: { root: string; snapshotId: string }): Promise<ProjectResult<any>>;
  };
  layout: {
    pages(args: { root: string }): Promise<ProjectResult<any>>;
    page(args: { root: string; pageId: string }): Promise<ProjectResult<any>>;
    place(args: { root: string; pageId: string; panelId: string; x: number; y: number; width: number; height: number }): Promise<ProjectResult<any>>;
    updatePlacement(args: { root: string; placementId: string; x: number; y: number; width: number; height: number }): Promise<ProjectResult<any>>;
    setBorder(args: { root: string; placementId: string; style: string; widthMm?: number; rounded?: boolean }): Promise<ProjectResult<any>>;
    createBalloon(args: { root: string; placementId: string; kind: string; shape: string; x: number; y: number; width: number; height: number; tail?: { x: number; y: number; visible?: boolean } }): Promise<ProjectResult<any>>;
    updateBalloon(args: { root: string; balloonId: string; x: number; y: number; width: number; height: number }): Promise<ProjectResult<any>>;
    retargetTail(args: { root: string; balloonId: string; x: number; y: number; visible: boolean }): Promise<ProjectResult<any>>;
    setLettering(args: { root: string; balloonId: string; text: string }): Promise<ProjectResult<any>>;
    setSfx(args: { root: string; placementId: string; text: string; weight?: string; angle?: number; x: number; y: number; scale?: number; sfxId?: string }): Promise<ProjectResult<any>>;
    setReadingOrder(args: { root: string; pageId: string; placementIds: string[] }): Promise<ProjectResult<any>>;
  };
  import: {
    pickFile(): Promise<ProjectResult<any>>;
    list(args: { root: string }): Promise<ProjectResult<any>>;
    importFile(args: { root: string; sourceAbsolutePath: string; title?: string }): Promise<ProjectResult<any>>;
    verify(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
    ocrGet(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
    ocrUpdate(args: { root: string; manuscriptId: string; ocrText: string }): Promise<ProjectResult<any>>;
  };
  text: {
    get(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
    normalize(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
  };
  chapters: {
    list(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
    derive(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
  };
  scenes: {
    list(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
    derive(args: { root: string; manuscriptId: string }): Promise<ProjectResult<any>>;
  };
  version: Record<string, never>;
};

type PanelForgeWindow = Window & { panelforge: PanelForgeApi };

const win = window as unknown as PanelForgeWindow;

const VIEWS = ["diagnostics", "about", "projects", "storyboard", "layout", "import", "text", "scenes"] as const;
const VIEW_TITLES: Record<(typeof VIEWS)[number], string> = {
  diagnostics: "Diagnostics",
  about: "About",
  projects: "Projects",
  storyboard: "Storyboard",
  layout: "Layout",
  import: "Import",
  text: "Text",
  scenes: "Scenes",
};

const navigation = createNavigation(VIEWS, "diagnostics");
const shortcuts = createShortcutRegistry();
shortcuts.register("nav.diagnostics", "Go to Diagnostics view", "Alt+1");
shortcuts.register("nav.about", "Go to About view", "Alt+2");
shortcuts.register("nav.projects", "Go to Projects view", "Alt+3");
shortcuts.register("nav.storyboard", "Go to Storyboard view", "Alt+4");
shortcuts.register("nav.layout", "Go to Layout view", "Alt+5");
shortcuts.register("nav.import", "Go to Import view", "Alt+6");
shortcuts.register("nav.text", "Go to Text view", "Alt+7");
shortcuts.register("nav.scenes", "Go to Scenes view", "Alt+8");

const root = document.getElementById("root");
const navEl = document.getElementById("app-nav");

const sections: Record<string, HTMLElement> = {};

function renderView(): void {
  for (const view of navigation.list()) {
    sections[view].hidden = view !== navigation.current();
  }
  for (const btn of navEl?.querySelectorAll("button") ?? []) {
    const btnView = btn.getAttribute("data-view");
    if (btnView === navigation.current()) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  }
}

function goToView(view: string): void {
  if (navigation.go(view)) {
    renderView();
  }
}

if (root && navEl) {
  // Navigation buttons (focusable — Tab + Enter, no mouse needed).
  for (const view of navigation.list()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = VIEW_TITLES[view as (typeof VIEWS)[number]];
    btn.dataset.view = view;
    btn.addEventListener("click", () => goToView(view));
    navEl.appendChild(btn);
  }

  // View sections.
  for (const view of navigation.list()) {
    const el = document.createElement("section");
    el.id = `view-${view}`;
    el.hidden = view !== navigation.current();
    el.setAttribute("aria-label", VIEW_TITLES[view as (typeof VIEWS)[number]]);
    const title = document.createElement("h1");
    title.textContent = VIEW_TITLES[view as (typeof VIEWS)[number]];
    el.appendChild(title);
    root.appendChild(el);
    sections[view] = el;
  }

  // Shortcut handling: Alt+1 / Alt+2 switch views.
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    const def = shortcuts.find({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    });
    if (!def) return;
    event.preventDefault();
    if (def.id === "nav.diagnostics") goToView("diagnostics");
    if (def.id === "nav.about") goToView("about");
    if (def.id === "nav.projects") goToView("projects");
    if (def.id === "nav.storyboard") goToView("storyboard");
    if (def.id === "nav.layout") goToView("layout");
    if (def.id === "nav.import") goToView("import");
    if (def.id === "nav.text") goToView("text");
    if (def.id === "nav.scenes") goToView("scenes");
  });

  renderView();

  // Diagnostics (S0.5 bridge): pending → ok/error.
  const diagSection = sections.diagnostics;
  const status = document.createElement("div");
  status.id = "diagnostic-status";
  status.textContent = "diagnostic: pending";
  diagSection.appendChild(status);
  const aboutBody = document.createElement("div");
  aboutBody.id = "about-info";
  aboutBody.textContent = "about: pending";
  sections.about.appendChild(aboutBody);

  win.panelforge.diagnostics
    .get()
    .then((result) => {
      if (result.ok && result.data) {
        status.textContent =
          `diagnostic: ok ${result.data.appName} electron=${result.data.electronVersion} node=${result.data.nodeVersion}`;
        aboutBody.textContent =
          `about: ${result.data.appName} electron=${result.data.electronVersion} node=${result.data.nodeVersion} ` +
          `platform=${result.data.platform} arch=${result.data.arch} via ${result.data.channel}`;
      } else {
        status.textContent = `diagnostic: error ${result.code} ${result.message}`;
        aboutBody.textContent = `about: unavailable (${result.code ?? "error"})`;
      }
    })
    .catch((err: unknown) => {
      status.textContent = `diagnostic: exception ${String(err)}`;
      aboutBody.textContent = `about: exception ${String(err)}`;
    });

  // Projects (S1.10): create, list, open, close, rename, archive — all
  // through the preload bridge; the renderer never touches the database.
  const projSection = sections.projects;
  const listEl = document.createElement("div");
  listEl.id = "project-list";
  listEl.textContent = "projects: loading…";
  projSection.appendChild(listEl);
  const infoEl = document.createElement("div");
  infoEl.id = "project-info";
  infoEl.textContent = "No project selected.";
  projSection.appendChild(infoEl);
  const nameInput = document.createElement("input");
  nameInput.id = "project-name";
  nameInput.placeholder = "Project name";
  nameInput.setAttribute("aria-label", "Project name");
  projSection.appendChild(nameInput);
  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.textContent = "Create project";
  projSection.appendChild(createBtn);

  let openRoot: string | null = null;

  async function refreshProjects(): Promise<void> {
    const result = await win.panelforge.project.list();
    if (!result.ok || !result.data) {
      listEl.textContent = `projects: unavailable (${result.code ?? "error"} ${result.message ?? ""})`;
      return;
    }
    listEl.replaceChildren();
    if (result.data.projects.length === 0) {
      listEl.textContent = "No projects yet.";
      return;
    }
    for (const project of result.data.projects) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = project.name;
      row.appendChild(label);
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        void win.panelforge.project.open(project.root).then((res) => {
          if (res.ok && res.data) {
            openRoot = res.data.root;
            infoEl.textContent = `open: ${res.data.name} (${res.data.projectId})`;
          } else {
            infoEl.textContent = `open failed: ${res.code} ${res.message}`;
          }
        });
      });
      row.appendChild(openBtn);
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", () => {
        void win.panelforge.project.close(project.root).then((res) => {
          infoEl.textContent = res.ok
            ? `closed: ${project.name}`
            : `close failed: ${res.code} ${res.message}`;
          if (openRoot === project.root && res.ok) openRoot = null;
        });
      });
      row.appendChild(closeBtn);
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", () => {
        const newName = window.prompt("New project name", project.name);
        if (!newName) return;
        void win.panelforge.project.rename(project.root, newName).then((res) => {
          if (res.ok) {
            void refreshProjects();
          } else {
            infoEl.textContent = `rename failed: ${res.code} ${res.message}`;
          }
        });
      });
      row.appendChild(renameBtn);
      const archiveBtn = document.createElement("button");
      archiveBtn.type = "button";
      archiveBtn.textContent = "Archive";
      archiveBtn.addEventListener("click", () => {
        void win.panelforge.project.archive(project.root).then((res) => {
          if (res.ok) {
            if (openRoot === project.root) openRoot = null;
            infoEl.textContent = `archived: ${project.name}`;
            void refreshProjects();
          } else {
            infoEl.textContent = `archive failed: ${res.code} ${res.message}`;
          }
        });
      });
      row.appendChild(archiveBtn);
      listEl.appendChild(row);
    }
  }

  createBtn.addEventListener("click", () => {
    void win.panelforge.project
      .create({ name: nameInput.value })
      .then((res) => {
        if (res.ok && res.data) {
          infoEl.textContent = `created: ${nameInput.value} (${res.data.projectId})`;
          nameInput.value = "";
          void refreshProjects();
        } else {
          infoEl.textContent = `create failed: ${res.code} ${res.message}`;
        }
      });
  });

  void refreshProjects();

  // Storyboard (S6.11): read/edit the board through the preload
  // bridge — scene/panel lists, per-panel detail cards (source
  // scene, character versions, camera, dialogue, instructions),
  // text/camera/instruction edits, and snapshots. No generation
  // controls (Stage 7 owns ComfyUI execution). All controls are
  // native focusable elements; no mouse-only interactions.
  const boardSection = sections.storyboard;
  const boardStatus = document.createElement("div");
  boardStatus.id = "storyboard-status";
  boardStatus.textContent = "storyboard: open a project from Projects first (Alt+3), or paste its root below.";
  boardSection.appendChild(boardStatus);
  const boardRootInput = document.createElement("input");
  boardRootInput.id = "storyboard-root";
  boardRootInput.placeholder = "Project root (directory)";
  boardRootInput.setAttribute("aria-label", "Project root");
  boardSection.appendChild(boardRootInput);
  const boardLoadBtn = document.createElement("button");
  boardLoadBtn.type = "button";
  boardLoadBtn.textContent = "Load board";
  boardSection.appendChild(boardLoadBtn);
  const boardListEl = document.createElement("div");
  boardListEl.id = "storyboard-board";
  boardSection.appendChild(boardListEl);
  const panelCardEl = document.createElement("div");
  panelCardEl.id = "storyboard-panel";
  boardSection.appendChild(panelCardEl);
  const snapshotBar = document.createElement("div");
  boardSection.appendChild(snapshotBar);
  const snapStatus = document.createElement("div");
  snapStatus.id = "storyboard-snapshots";
  snapshotBar.appendChild(snapStatus);

  let boardRoot: string | null = openRoot;

  function boardFail(action: string, res: { code?: string; message?: string }): void {
    boardStatus.textContent = `storyboard ${action} failed: ${res.code ?? "error"} ${res.message ?? ""}`;
  }

  function textArea(label: string, value: string): HTMLTextAreaElement {
    const area = document.createElement("textarea");
    area.setAttribute("aria-label", label);
    area.value = value;
    return area;
  }

  function saveButton(label: string, onSave: () => Promise<void>): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      void onSave();
    });
    return btn;
  }

  async function renderPanelCard(panelId: string): Promise<void> {
    if (!boardRoot) return;
    const result = await win.panelforge.storyboard.panelDetails({ root: boardRoot, panelId });
    if (!result.ok || !result.data) {
      boardFail("details", result);
      return;
    }
    const details = result.data;
    panelCardEl.replaceChildren();
    const card = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `Panel ${panelId.slice(0, 8)}`;
    card.appendChild(legend);
    const source = document.createElement("div");
    source.textContent = `source scene: ${details.scene ? details.scene.narrativePurpose || details.scene.sceneId.slice(0, 8) : "?"}`;
    card.appendChild(source);
    const assignments = document.createElement("div");
    assignments.textContent =
      details.assignments.length > 0
        ? `characters: ${details.assignments.map((a: any) => `${a.characterName} (${a.versionLabel})`).join(", ")}`
        : "characters: unassigned";
    card.appendChild(assignments);

    const dialogueBox = textArea("Dialogue", details.text?.dialogue ?? "");
    const captionsBox = textArea("Captions", details.text?.captions ?? "");
    const actionsBox = textArea("Actions", details.text?.actions ?? "");
    const expressionsBox = textArea("Expressions", details.text?.expressions ?? "");
    card.appendChild(dialogueBox);
    card.appendChild(captionsBox);
    card.appendChild(actionsBox);
    card.appendChild(expressionsBox);
    card.appendChild(
      saveButton("Save text", async () => {
        if (!boardRoot) return;
        const res = await win.panelforge.storyboard.setText({
          root: boardRoot,
          panelId,
          dialogue: dialogueBox.value,
          captions: captionsBox.value,
          actions: actionsBox.value,
          expressions: expressionsBox.value,
        });
        boardStatus.textContent = res.ok ? `saved text for ${panelId.slice(0, 8)}` : `storyboard save text failed: ${res.code} ${res.message}`;
      })
    );

    const shotSelect = document.createElement("select");
    shotSelect.setAttribute("aria-label", "Shot type");
    for (const shot of ["close-up", "medium", "wide", "extreme-wide"]) {
      const option = document.createElement("option");
      option.value = shot;
      option.textContent = shot;
      if (details.camera?.shotType === shot) option.selected = true;
      shotSelect.appendChild(option);
    }
    const angleBox = document.createElement("input");
    angleBox.placeholder = "camera angle";
    angleBox.setAttribute("aria-label", "Camera angle");
    angleBox.value = details.camera?.angle ?? "";
    card.appendChild(shotSelect);
    card.appendChild(angleBox);
    card.appendChild(
      saveButton("Save camera", async () => {
        if (!boardRoot) return;
        const res = await win.panelforge.storyboard.setCamera({
          root: boardRoot,
          panelId,
          shotType: shotSelect.value,
          angle: angleBox.value,
        });
        boardStatus.textContent = res.ok ? `saved camera for ${panelId.slice(0, 8)}` : `storyboard save camera failed: ${res.code} ${res.message}`;
      })
    );

    const compBox = textArea("Composition prompt", details.instructions?.compositionPrompt ?? "");
    const bgBox = textArea("Background detail", details.instructions?.backgroundDetail ?? "");
    const artBox = textArea("Art direction notes", details.instructions?.artDirectionNotes ?? "");
    card.appendChild(compBox);
    card.appendChild(bgBox);
    card.appendChild(artBox);
    card.appendChild(
      saveButton("Save instructions", async () => {
        if (!boardRoot) return;
        const res = await win.panelforge.storyboard.setInstructions({
          root: boardRoot,
          panelId,
          compositionPrompt: compBox.value,
          backgroundDetail: bgBox.value,
          artDirectionNotes: artBox.value,
        });
        boardStatus.textContent = res.ok ? `saved instructions for ${panelId.slice(0, 8)}` : `storyboard save instructions failed: ${res.code} ${res.message}`;
      })
    );
    panelCardEl.appendChild(card);
  }

  async function refreshSnapshots(): Promise<void> {
    if (!boardRoot) return;
    const result = await win.panelforge.storyboard.snapshotsList({ root: boardRoot });
    if (!result.ok || !result.data) {
      snapStatus.textContent = `snapshots: unavailable (${result.code ?? "error"} ${result.message ?? ""})`;
      return;
    }
    snapStatus.replaceChildren();
    for (const snap of result.data.snapshots as any[]) {
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = `${snap.name || "(unnamed)"} · ${snap.panelCount} panels${snap.parentSnapshotId ? ` · branch of ${snap.parentSnapshotId.slice(0, 8)}` : ""}`;
      row.appendChild(label);
      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", () => {
        void win.panelforge.storyboard.snapshotRestore({ root: boardRoot!, snapshotId: snap.snapshotId }).then((res) => {
          boardStatus.textContent = res.ok ? `restored ${snap.name || snap.snapshotId.slice(0, 8)}` : `storyboard restore failed: ${res.code} ${res.message}`;
          void refreshBoard();
        });
      });
      row.appendChild(restoreBtn);
      snapStatus.appendChild(row);
    }
    const createSnapBtn = document.createElement("button");
    createSnapBtn.type = "button";
    createSnapBtn.textContent = "Create snapshot";
    createSnapBtn.addEventListener("click", () => {
      void win.panelforge.storyboard.snapshotCreate({ root: boardRoot!, name: "" }).then((res) => {
        boardStatus.textContent = res.ok ? `snapshot created (${res.data.panelCount} panels)` : `storyboard snapshot failed: ${res.code} ${res.message}`;
        void refreshSnapshots();
      });
    });
    snapStatus.appendChild(createSnapBtn);
  }

  async function refreshBoard(): Promise<void> {
    if (!boardRoot) {
      boardListEl.textContent = "No project root selected.";
      return;
    }
    const result = await win.panelforge.storyboard.list({ root: boardRoot });
    if (!result.ok || !result.data) {
      boardFail("board", result);
      return;
    }
    boardStatus.textContent = `storyboard: ${result.data.scenes.length} scene(s)`;
    boardListEl.replaceChildren();
    for (const scene of result.data.scenes as any[]) {
      const sceneEl = document.createElement("details");
      sceneEl.open = true;
      const summary = document.createElement("summary");
      summary.textContent = scene.narrativePurpose ? `Scene — ${scene.narrativePurpose}` : `Scene ${scene.sceneId.slice(0, 8)}`;
      sceneEl.appendChild(summary);
      for (const panel of scene.panels as any[]) {
        const row = document.createElement("button");
        row.type = "button";
        row.textContent = `Panel ${panel.panelId.slice(0, 8)}`;
        row.addEventListener("click", () => {
          void renderPanelCard(panel.panelId);
        });
        const wrapper = document.createElement("div");
        wrapper.appendChild(row);
        sceneEl.appendChild(wrapper);
      }
      const addPanelBtn = document.createElement("button");
      addPanelBtn.type = "button";
      addPanelBtn.textContent = "Add panel";
      addPanelBtn.addEventListener("click", () => {
        void win.panelforge.storyboard.createPanel({ root: boardRoot!, sceneId: scene.sceneId }).then((res) => {
          boardStatus.textContent = res.ok ? `panel added to ${scene.sceneId.slice(0, 8)}` : `storyboard add panel failed: ${res.code} ${res.message}`;
          void refreshBoard();
        });
      });
      sceneEl.appendChild(addPanelBtn);
      boardListEl.appendChild(sceneEl);
    }
    void refreshSnapshots();
  }

  boardLoadBtn.addEventListener("click", () => {
    boardRoot = boardRootInput.value.trim() === "" ? openRoot : boardRootInput.value.trim();
    void refreshBoard();
  });

  // Layout (S8.12): hand-rolled canvas over the S8.11 SVG —
  // page list, draggable placements/balloons/SFX, tail
  // retarget, border picker, text edit, and reading-order
  // list. Every pointer drag has a focusable number-input
  // alternative; no export controls (Stage 10 owns those).
  const layoutSection = sections.layout;
  const layoutStatus = document.createElement("div");
  layoutStatus.id = "layout-status";
  layoutStatus.textContent = "layout: open a project from Projects first (Alt+3), or paste its root below.";
  layoutSection.appendChild(layoutStatus);
  const layoutRootInput = document.createElement("input");
  layoutRootInput.id = "layout-root";
  layoutRootInput.placeholder = "Project root (directory)";
  layoutRootInput.setAttribute("aria-label", "Project root");
  layoutSection.appendChild(layoutRootInput);
  const layoutLoadBtn = document.createElement("button");
  layoutLoadBtn.type = "button";
  layoutLoadBtn.textContent = "Load pages";
  layoutSection.appendChild(layoutLoadBtn);
  const layoutListEl = document.createElement("div");
  layoutListEl.id = "layout-pages";
  layoutSection.appendChild(layoutListEl);
  const layoutCanvasEl = document.createElement("div");
  layoutCanvasEl.id = "layout-canvas";
  layoutSection.appendChild(layoutCanvasEl);
  const layoutCardEl = document.createElement("div");
  layoutCardEl.id = "layout-page";
  layoutSection.appendChild(layoutCardEl);

  let layoutRoot: string | null = openRoot;
  let layoutPageId: string | null = null;

  function layoutFail(action: string, res: { code?: string; message?: string }): void {
    layoutStatus.textContent = `layout ${action} failed: ${res.code ?? "error"} ${res.message ?? ""}`;
  }

  function numInput(label: string, value: number): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.setAttribute("aria-label", label);
    input.value = String(value);
    return input;
  }

  function layoutBtn(label: string, onSave: () => Promise<void>): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      void onSave();
    });
    return btn;
  }

  async function refreshLayoutPage(): Promise<void> {
    if (!layoutRoot || !layoutPageId) return;
    const result = await win.panelforge.layout.page({ root: layoutRoot, pageId: layoutPageId });
    if (!result.ok || !result.data) {
      layoutFail("page", result);
      return;
    }
    const details = result.data;
    layoutCanvasEl.innerHTML = details.svg;
    // Pointer drag: placement groups move with the mouse;
    // keyboard users edit the same numbers in the card below.
    const svgEl = layoutCanvasEl.querySelector("svg");
    svgEl?.querySelectorAll("g[data-placement-id]").forEach((group) => {
      const el = group as SVGGElement;
      el.style.cursor = "move";
      el.setAttribute("tabindex", "0");
      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;
      let placementId = el.getAttribute("data-placement-id") ?? "";
      el.addEventListener("mousedown", (event: MouseEvent) => {
        dragging = true;
        const rect = (svgEl as SVGSVGElement).getBoundingClientRect();
        const point = svgPoint(event, svgEl as SVGSVGElement, rect);
        offsetX = point.x;
        offsetY = point.y;
        event.preventDefault();
      });
      el.addEventListener("mousemove", (event: MouseEvent) => {
        if (!dragging || !layoutRoot) return;
        const rect = (svgEl as SVGSVGElement).getBoundingClientRect();
        const point = svgPoint(event, svgEl as SVGSVGElement, rect);
        layoutStatus.textContent = `layout: dragging ${placementId.slice(0, 8)} to ${Math.round(point.x)}, ${Math.round(point.y)} — release to save`;
        layoutDragPreview = { placementId, x: point.x, y: point.y };
      });
      el.addEventListener("mouseup", () => {
        if (!dragging || !layoutRoot) return;
        dragging = false;
        if (!layoutDragPreview) return;
        const saved = layoutDragPreview;
        layoutDragPreview = null;
        void win.panelforge.layout
          .updatePlacement({
            root: layoutRoot,
            placementId: saved.placementId,
            x: Math.max(0, Math.round(saved.x)),
            y: Math.max(0, Math.round(saved.y)),
            width: Math.max(1, Math.round(Number(el.getAttribute("data-width") ?? 40))),
            height: Math.max(1, Math.round(Number(el.getAttribute("data-height") ?? 40))),
          })
          .then((res) => {
            layoutStatus.textContent = res.ok ? `saved placement ${saved.placementId.slice(0, 8)}` : `layout save placement failed: ${res.code} ${res.message}`;
            if (res.ok) void refreshLayoutPage();
          });
      });
    });
    void renderLayoutCard(details);
  }

  let layoutDragPreview: { placementId: string; x: number; y: number } | null = null;

  function svgPoint(event: MouseEvent, svg: SVGSVGElement, rect: DOMRect): { x: number; y: number } {
    const scaleX = Number(svg.viewBox.baseVal.width) / rect.width;
    const scaleY = Number(svg.viewBox.baseVal.height) / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  async function renderLayoutCard(details: any): Promise<void> {
    if (!layoutRoot || !layoutPageId) return;
    layoutCardEl.replaceChildren();
    const card = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `Page ${details.page.title} (${details.page.width}×${details.page.height}mm, ${details.page.format})`;
    card.appendChild(legend);
    const readingBox = document.createElement("div");
    readingBox.id = "layout-reading-order";
    readingBox.textContent =
      "reading order: " + details.placements.map((p: any) => p.placementId.slice(0, 8)).join(", ") + (details.flags?.length ? ` · flags: ${details.flags.join(", ")}` : "");
    card.appendChild(readingBox);

    for (const placement of details.placements as any[]) {
      const fieldset = document.createElement("fieldset");
      const title = document.createElement("legend");
      title.textContent = `Placement ${placement.placementId.slice(0, 8)} (panel ${placement.panelId.slice(0, 8)})`;
      fieldset.appendChild(title);
      const traceLine = document.createElement("div");
      traceLine.id = "layout-trace";
      const trace = placement.trace;
      const versions =
        trace?.assignments?.length > 0
          ? trace.assignments.map((a: any) => `${a.characterName} (${a.versionLabel})`).join(", ")
          : "unassigned";
      traceLine.textContent = `trace: scene ${trace?.scenePurpose ?? trace?.sceneId ?? "?"} · characters: ${versions}${trace?.flags?.length ? ` · flags: ${trace.flags.join(", ")}` : ""}`;
      fieldset.appendChild(traceLine);
      const xInput = numInput("Placement x", placement.x);
      const yInput = numInput("Placement y", placement.y);
      const wInput = numInput("Placement width", placement.width);
      const hInput = numInput("Placement height", placement.height);
      fieldset.appendChild(xInput);
      fieldset.appendChild(yInput);
      fieldset.appendChild(wInput);
      fieldset.appendChild(hInput);
      fieldset.appendChild(
        layoutBtn("Save placement", async () => {
          if (!layoutRoot) return;
          const res = await win.panelforge.layout.updatePlacement({
            root: layoutRoot,
            placementId: placement.placementId,
            x: Number(xInput.value),
            y: Number(yInput.value),
            width: Number(wInput.value),
            height: Number(hInput.value),
          });
          layoutStatus.textContent = res.ok ? `saved placement ${placement.placementId.slice(0, 8)}` : `layout save placement failed: ${res.code} ${res.message}`;
          if (res.ok) void refreshLayoutPage();
        })
      );

      const borderSelect = document.createElement("select");
      borderSelect.setAttribute("aria-label", "Border style");
      for (const style of ["none", "thin", "bold"]) {
        const option = document.createElement("option");
        option.value = style;
        option.textContent = style;
        if ((placement.border?.style ?? "thin") === style) option.selected = true;
        borderSelect.appendChild(option);
      }
      const widthInput = numInput("Border width", placement.border?.widthMm ?? 0.5);
      const roundedBox = document.createElement("label");
      const roundedCheck = document.createElement("input");
      roundedCheck.type = "checkbox";
      roundedCheck.checked = placement.border?.rounded ?? false;
      roundedBox.textContent = "Rounded border";
      roundedBox.appendChild(roundedCheck);
      fieldset.appendChild(borderSelect);
      fieldset.appendChild(widthInput);
      fieldset.appendChild(roundedBox);
      fieldset.appendChild(
        layoutBtn("Save border", async () => {
          if (!layoutRoot) return;
          const res = await win.panelforge.layout.setBorder({
            root: layoutRoot,
            placementId: placement.placementId,
            style: borderSelect.value,
            widthMm: Number(widthInput.value),
            rounded: roundedCheck.checked,
          });
          layoutStatus.textContent = res.ok ? `saved border for ${placement.placementId.slice(0, 8)}` : `layout save border failed: ${res.code} ${res.message}`;
          if (res.ok) void refreshLayoutPage();
        })
      );

      const balloonKind = document.createElement("select");
      balloonKind.setAttribute("aria-label", "Balloon kind");
      for (const kind of ["speech", "caption", "thought"]) {
        const option = document.createElement("option");
        option.value = kind;
        option.textContent = kind;
        balloonKind.appendChild(option);
      }
      const balloonShape = document.createElement("select");
      balloonShape.setAttribute("aria-label", "Balloon shape");
      for (const shape of ["ellipse", "rounded", "rect"]) {
        const option = document.createElement("option");
        option.value = shape;
        option.textContent = shape;
        balloonShape.appendChild(option);
      }
      const bx = numInput("Balloon x", 30);
      const by = numInput("Balloon y", 30);
      const bw = numInput("Balloon width", 60);
      const bh = numInput("Balloon height", 25);
      fieldset.appendChild(balloonKind);
      fieldset.appendChild(balloonShape);
      fieldset.appendChild(bx);
      fieldset.appendChild(by);
      fieldset.appendChild(bw);
      fieldset.appendChild(bh);
      fieldset.appendChild(
        layoutBtn("Create balloon", async () => {
          if (!layoutRoot) return;
          const res = await win.panelforge.layout.createBalloon({
            root: layoutRoot,
            placementId: placement.placementId,
            kind: balloonKind.value,
            shape: balloonShape.value,
            x: Number(bx.value),
            y: Number(by.value),
            width: Number(bw.value),
            height: Number(bh.value),
          });
          layoutStatus.textContent = res.ok ? `balloon created on ${placement.placementId.slice(0, 8)}` : `layout create balloon failed: ${res.code} ${res.message}`;
          if (res.ok) void refreshLayoutPage();
        })
      );

      for (const balloon of placement.balloons as any[]) {
        const row = document.createElement("div");
        row.textContent = `Balloon ${balloon.balloonId.slice(0, 8)} (${balloon.kind}/${balloon.shape}) at ${balloon.x}, ${balloon.y}`;
        fieldset.appendChild(row);
        const ux = numInput("Balloon update x", balloon.x);
        const uy = numInput("Balloon update y", balloon.y);
        const uw = numInput("Balloon update width", balloon.width);
        const uh = numInput("Balloon update height", balloon.height);
        fieldset.appendChild(ux);
        fieldset.appendChild(uy);
        fieldset.appendChild(uw);
        fieldset.appendChild(uh);
        fieldset.appendChild(
          layoutBtn("Save balloon", async () => {
            if (!layoutRoot) return;
            const res = await win.panelforge.layout.updateBalloon({
              root: layoutRoot,
              balloonId: balloon.balloonId,
              x: Number(ux.value),
              y: Number(uy.value),
              width: Number(uw.value),
              height: Number(uh.value),
            });
            layoutStatus.textContent = res.ok ? `saved balloon ${balloon.balloonId.slice(0, 8)}` : `layout save balloon failed: ${res.code} ${res.message}`;
            if (res.ok) void refreshLayoutPage();
          })
        );
        const tailX = numInput("Tail x", balloon.tailX ?? 0);
        const tailY = numInput("Tail y", balloon.tailY ?? 0);
        const tailVisible = document.createElement("label");
        const tailCheck = document.createElement("input");
        tailCheck.type = "checkbox";
        tailCheck.checked = balloon.tailVisible;
        tailVisible.textContent = "Tail visible";
        tailVisible.appendChild(tailCheck);
        fieldset.appendChild(tailX);
        fieldset.appendChild(tailY);
        fieldset.appendChild(tailVisible);
        fieldset.appendChild(
          layoutBtn("Retarget tail", async () => {
            if (!layoutRoot) return;
            const res = await win.panelforge.layout.retargetTail({
              root: layoutRoot,
              balloonId: balloon.balloonId,
              x: Number(tailX.value),
              y: Number(tailY.value),
              visible: tailCheck.checked,
            });
            layoutStatus.textContent = res.ok ? `tail retargeted ${balloon.balloonId.slice(0, 8)}` : `layout retarget tail failed: ${res.code} ${res.message}`;
            if (res.ok) void refreshLayoutPage();
          })
        );
        const letterBox = textArea("Balloon text", balloon.text ?? "");
        fieldset.appendChild(letterBox);
        fieldset.appendChild(
          layoutBtn("Save text", async () => {
            if (!layoutRoot) return;
            const res = await win.panelforge.layout.setLettering({
              root: layoutRoot,
              balloonId: balloon.balloonId,
              text: letterBox.value,
            });
            layoutStatus.textContent = res.ok ? `saved text for ${balloon.balloonId.slice(0, 8)}` : `layout save text failed: ${res.code} ${res.message}`;
            if (res.ok) void refreshLayoutPage();
          })
        );
      }

      const sfxText = document.createElement("input");
      sfxText.placeholder = "SFX text";
      sfxText.setAttribute("aria-label", "SFX text");
      const sfxX = numInput("SFX x", 80);
      const sfxY = numInput("SFX y", 80);
      const sfxAngle = numInput("SFX angle", 0);
      const sfxScale = document.createElement("input");
      sfxScale.type = "number";
      sfxScale.step = "0.1";
      sfxScale.setAttribute("aria-label", "SFX scale");
      sfxScale.value = "1";
      const sfxWeight = document.createElement("select");
      sfxWeight.setAttribute("aria-label", "SFX weight");
      for (const weight of ["regular", "bold", "heavy"]) {
        const option = document.createElement("option");
        option.value = weight;
        option.textContent = weight;
        if (weight === "bold") option.selected = true;
        sfxWeight.appendChild(option);
      }
      const sfxExisting = document.createElement("select");
      sfxExisting.setAttribute("aria-label", "Existing SFX to edit");
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "(new SFX)";
      sfxExisting.appendChild(emptyOption);
      for (const sfx of placement.sfx as any[]) {
        const option = document.createElement("option");
        option.value = sfx.sfxId;
        option.textContent = sfx.text;
        sfxExisting.appendChild(option);
      }
      fieldset.appendChild(sfxText);
      fieldset.appendChild(sfxX);
      fieldset.appendChild(sfxY);
      fieldset.appendChild(sfxAngle);
      fieldset.appendChild(sfxScale);
      fieldset.appendChild(sfxWeight);
      fieldset.appendChild(sfxExisting);
      fieldset.appendChild(
        layoutBtn("Save SFX", async () => {
          if (!layoutRoot) return;
          const res = await win.panelforge.layout.setSfx({
            root: layoutRoot,
            placementId: placement.placementId,
            text: sfxText.value,
            weight: sfxWeight.value,
            angle: Number(sfxAngle.value),
            x: Number(sfxX.value),
            y: Number(sfxY.value),
            scale: Number(sfxScale.value),
            sfxId: sfxExisting.value === "" ? undefined : sfxExisting.value,
          });
          layoutStatus.textContent = res.ok ? `saved SFX on ${placement.placementId.slice(0, 8)}` : `layout save SFX failed: ${res.code} ${res.message}`;
          if (res.ok) void refreshLayoutPage();
        })
      );

      const moveUp = layoutBtn("Move up", async () => {
        if (!layoutRoot || !layoutPageId) return;
        const ids = details.placements.map((p: any) => p.placementId);
        const index = ids.indexOf(placement.placementId);
        if (index <= 0) return;
        [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
        const res = await win.panelforge.layout.setReadingOrder({ root: layoutRoot, pageId: layoutPageId, placementIds: ids });
        layoutStatus.textContent = res.ok ? `reading order saved` : `layout save reading order failed: ${res.code} ${res.message}`;
        if (res.ok) void refreshLayoutPage();
      });
      const moveDown = layoutBtn("Move down", async () => {
        if (!layoutRoot || !layoutPageId) return;
        const ids = details.placements.map((p: any) => p.placementId);
        const index = ids.indexOf(placement.placementId);
        if (index < 0 || index >= ids.length - 1) return;
        [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
        const res = await win.panelforge.layout.setReadingOrder({ root: layoutRoot, pageId: layoutPageId, placementIds: ids });
        layoutStatus.textContent = res.ok ? `reading order saved` : `layout save reading order failed: ${res.code} ${res.message}`;
        if (res.ok) void refreshLayoutPage();
      });
      fieldset.appendChild(moveUp);
      fieldset.appendChild(moveDown);
      card.appendChild(fieldset);
    }
    layoutCardEl.appendChild(card);
  }

  async function refreshLayoutBoard(): Promise<void> {
    if (!layoutRoot) {
      layoutListEl.textContent = "No project root selected.";
      return;
    }
    const result = await win.panelforge.layout.pages({ root: layoutRoot });
    if (!result.ok || !result.data) {
      layoutFail("pages", result);
      return;
    }
    layoutStatus.textContent = `layout: ${result.data.pages.length} page(s)`;
    layoutListEl.replaceChildren();
    for (const page of result.data.pages as any[]) {
      const row = document.createElement("button");
      row.type = "button";
      row.textContent = `Page ${page.title} (${page.width}×${page.height}mm)`;
      row.addEventListener("click", () => {
        layoutPageId = page.pageId;
        void refreshLayoutPage();
      });
      const wrapper = document.createElement("div");
      wrapper.appendChild(row);
      layoutListEl.appendChild(wrapper);
    }
  }

  layoutLoadBtn.addEventListener("click", () => {
    layoutRoot = layoutRootInput.value.trim() === "" ? openRoot : layoutRootInput.value.trim();
    void refreshLayoutBoard();
  });

  // Import (S8U.1): hand-rolled manuscript import surface over the
  // existing S3.1/S3.8/S3.9/S3.10/S6.13 core services. File picking
  // happens in the main process (Electron dialog); the renderer only
  // receives the chosen path. Every action shows a visible result or
  // a typed error; lists show an empty state; every control is a
  // native focusable element (Tab + Enter, Alt+6 to reach this view).
  const importSection = sections.import;
  const importStatus = document.createElement("div");
  importStatus.id = "import-status";
  importStatus.textContent = "import: open a project from Projects first (Alt+3), or paste its root below.";
  importSection.appendChild(importStatus);
  const importRootInput = document.createElement("input");
  importRootInput.id = "import-root";
  importRootInput.placeholder = "Project root (directory)";
  importRootInput.setAttribute("aria-label", "Project root");
  importSection.appendChild(importRootInput);
  const importLoadBtn = document.createElement("button");
  importLoadBtn.type = "button";
  importLoadBtn.textContent = "Load manuscripts";
  importSection.appendChild(importLoadBtn);
  const importTitleInput = document.createElement("input");
  importTitleInput.id = "import-title";
  importTitleInput.placeholder = "Manuscript title (optional)";
  importTitleInput.setAttribute("aria-label", "Manuscript title");
  importSection.appendChild(importTitleInput);
  const importPickBtn = document.createElement("button");
  importPickBtn.type = "button";
  importPickBtn.textContent = "Choose file...";
  importPickBtn.setAttribute("aria-label", "Choose and import a manuscript file");
  importSection.appendChild(importPickBtn);
  const importListEl = document.createElement("div");
  importListEl.id = "import-list";
  importSection.appendChild(importListEl);
  const importDetailEl = document.createElement("div");
  importDetailEl.id = "import-detail";
  importSection.appendChild(importDetailEl);

  let importRoot: string | null = openRoot;

  function importFail(action: string, res: { code?: string; message?: string }): void {
    importStatus.textContent = `import ${action} failed: ${res.code ?? "error"} ${res.message ?? ""}`;
  }

  function importBtn(label: string, onClick: () => Promise<void>): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      void onClick();
    });
    return btn;
  }

  function shortHash(hash: string): string {
    return hash.slice(0, 8);
  }

  async function refreshImportList(): Promise<void> {
    if (!importRoot) {
      importListEl.textContent = "No project root selected.";
      return;
    }
    const result = await win.panelforge.import.list({ root: importRoot });
    if (!result.ok || !result.data) {
      importFail("list", result);
      return;
    }
    const manuscripts = result.data.manuscripts as any[];
    importStatus.textContent = `import: ${manuscripts.length} manuscript(s)`;
    importListEl.replaceChildren();
    importDetailEl.replaceChildren();
    if (manuscripts.length === 0) {
      importListEl.textContent = "No manuscripts yet.";
      return;
    }
    for (const record of manuscripts as any[]) {
      const fieldset = document.createElement("fieldset");
      fieldset.id = "import-manuscript";
      const legend = document.createElement("legend");
      legend.textContent = `Manuscript ${record.title} (${record.format})`;
      fieldset.appendChild(legend);
      const meta = document.createElement("div");
      meta.textContent = `${record.byteSize} bytes · ${record.relativePath} · hash ${shortHash(record.contentHash)}`;
      fieldset.appendChild(meta);
      const verifyBtn = importBtn("Verify", async () => {
        if (!importRoot) return;
        const res = await win.panelforge.import.verify({ root: importRoot, manuscriptId: record.manuscriptId });
        if (!res.ok || !res.data) {
          importFail("verify", res);
          return;
        }
        const entry = res.data as any;
        importStatus.textContent = `verify: ${record.title} — ${entry.status} (expected ${shortHash(entry.expectedHash)}${entry.actualHash ? `, actual ${shortHash(entry.actualHash)}` : ""})`;
      });
      fieldset.appendChild(verifyBtn);
      const ocrBtn = importBtn("View OCR", async () => {
        if (!importRoot) return;
        const res = await win.panelforge.import.ocrGet({ root: importRoot, manuscriptId: record.manuscriptId });
        if (!res.ok) {
          importFail("ocr", res);
          return;
        }
        importDetailEl.replaceChildren();
        const ocr = (res.data as any)?.ocr;
        const header = document.createElement("div");
        header.textContent = `OCR for ${record.title}`;
        importDetailEl.appendChild(header);
        if (!ocr) {
          const empty = document.createElement("div");
          empty.textContent = "No OCR text for this manuscript.";
          importDetailEl.appendChild(empty);
          return;
        }
        const info = document.createElement("div");
        info.textContent = `${ocr.pageCount} pages · ${ocr.engine} · updated ${ocr.updatedAt}`;
        importDetailEl.appendChild(info);
        const area = document.createElement("textarea");
        area.id = "import-ocr-text";
        area.setAttribute("aria-label", "OCR text");
        area.value = ocr.ocrText as string;
        importDetailEl.appendChild(area);
        importDetailEl.appendChild(
          importBtn("Save OCR", async () => {
            const update = await win.panelforge.import.ocrUpdate({
              root: importRoot!,
              manuscriptId: record.manuscriptId,
              ocrText: area.value,
            });
            importStatus.textContent = update.ok
              ? `saved OCR for ${record.title}`
              : `import save OCR failed: ${update.code} ${update.message}`;
          })
        );
      });
      fieldset.appendChild(ocrBtn);
      importListEl.appendChild(fieldset);
    }
  }

  importLoadBtn.addEventListener("click", () => {
    importRoot = importRootInput.value.trim() === "" ? openRoot : importRootInput.value.trim();
    void refreshImportList();
  });

  importPickBtn.addEventListener("click", () => {
    void (async () => {
      if (!importRoot) {
        importStatus.textContent = "import: choose a project root first (open from Projects or paste its root below)";
        return;
      }
      const picked = await win.panelforge.import.pickFile();
      if (!picked.ok || !picked.data) {
        importFail("pick file", picked);
        return;
      }
      const filePath = (picked.data as any)?.filePath as string | null;
      const canceled = (picked.data as any)?.canceled as boolean;
      if (canceled || !filePath) {
        importStatus.textContent = "import: file pick cancelled";
        return;
      }
      const title = importTitleInput.value.trim();
      const res = await win.panelforge.import.importFile({
        root: importRoot,
        sourceAbsolutePath: filePath,
        title: title === "" ? undefined : title,
      });
      if (!res.ok || !res.data) {
        importFail("file", res);
        return;
      }
      const manuscript = (res.data as any).manuscript;
      const ocr = (res.data as any).ocr;
      importStatus.textContent = ocr
        ? `imported: ${manuscript.title} (${manuscript.format}) · ocr: ${ocr.pageCount} pages via ${ocr.engine}`
        : `imported: ${manuscript.title} (${manuscript.format})`;
      importTitleInput.value = "";
      void refreshImportList();
    })();
  });

  // Text (S8U.2): hand-rolled normalized-text + chapters surface over
  // the stored S3.2/S3.3 rows. Pick a manuscript (reusing the import
  // list), read its normalized text, normalize txt/md when absent,
  // and derive/list chapters; clicking a chapter shows its slice.
  // Every action is a native focusable element (Tab + Enter, Alt+7).
  const textSection = sections.text;
  const textStatus = document.createElement("div");
  textStatus.id = "text-status";
  textStatus.textContent = "text: open a project from Projects first (Alt+3), or paste its root below.";
  textSection.appendChild(textStatus);
  const textRootInput = document.createElement("input");
  textRootInput.id = "text-root";
  textRootInput.placeholder = "Project root (directory)";
  textRootInput.setAttribute("aria-label", "Project root");
  textSection.appendChild(textRootInput);
  const textLoadBtn = document.createElement("button");
  textLoadBtn.type = "button";
  textLoadBtn.textContent = "Load manuscripts";
  textSection.appendChild(textLoadBtn);
  const textSelect = document.createElement("select");
  textSelect.id = "text-manuscript";
  textSelect.setAttribute("aria-label", "Manuscript");
  textSection.appendChild(textSelect);
  const textNormalizeBtn = document.createElement("button");
  textNormalizeBtn.type = "button";
  textNormalizeBtn.textContent = "Normalize";
  textSection.appendChild(textNormalizeBtn);
  const textDeriveBtn = document.createElement("button");
  textDeriveBtn.type = "button";
  textDeriveBtn.textContent = "Derive chapters";
  textSection.appendChild(textDeriveBtn);
  const normArea = document.createElement("textarea");
  normArea.id = "text-norm";
  normArea.setAttribute("aria-label", "Normalized text");
  normArea.readOnly = true;
  textSection.appendChild(normArea);
  const textDetailArea = document.createElement("textarea");
  textDetailArea.id = "text-chapter";
  textDetailArea.setAttribute("aria-label", "Chapter text");
  textDetailArea.readOnly = true;
  textSection.appendChild(textDetailArea);
  const textChaptersEl = document.createElement("div");
  textChaptersEl.id = "text-chapters";
  textSection.appendChild(textChaptersEl);

  let textRoot: string | null = openRoot;
  let textText: string | null = null;

  function textFail(action: string, res: { code?: string; message?: string }): void {
    textStatus.textContent = `text ${action} failed: ${res.code ?? "error"} ${res.message ?? ""}`;
  }

  function renderChapters(chapters: any[]): void {
    textChaptersEl.replaceChildren();
    if (chapters.length === 0) {
      textChaptersEl.textContent = "No chapters yet.";
      return;
    }
    for (const chapter of chapters as any[]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${chapter.title} (chars ${chapter.normStart}–${chapter.normEnd})`;
      btn.setAttribute("aria-label", `Show chapter: ${chapter.title}`);
      btn.addEventListener("click", () => {
        if (textText === null) {
          textDetailArea.value = "";
          return;
        }
        textDetailArea.value = textText.slice(chapter.normStart, chapter.normEnd);
        textStatus.textContent = `text: ${chapter.title} (chars ${chapter.normStart}–${chapter.normEnd})`;
      });
      const wrapper = document.createElement("div");
      wrapper.appendChild(btn);
      textChaptersEl.appendChild(wrapper);
    }
  }

  async function refreshText(): Promise<void> {
    const manuscriptId = textSelect.value;
    if (!textRoot || manuscriptId === "") {
      return;
    }
    const res = await win.panelforge.text.get({ root: textRoot, manuscriptId });
    if (!res.ok || !res.data) {
      textFail("get", res);
      return;
    }
    const normalization = (res.data as any).normalization as any | null;
    if (!normalization) {
      textText = null;
      normArea.value = "";
      textStatus.textContent = "No normalized text for this manuscript.";
    } else {
      textText = normalization.normalizedText as string;
      normArea.value = textText;
      textStatus.textContent = `text: ${normalization.byteLength} bytes`;
    }
    const chaptersRes = await win.panelforge.chapters.list({ root: textRoot, manuscriptId });
    if (!chaptersRes.ok || !chaptersRes.data) {
      textFail("chapters", chaptersRes);
      return;
    }
    renderChapters((chaptersRes.data as any).chapters as any[]);
  }

  textLoadBtn.addEventListener("click", () => {
    void (async () => {
      textRoot = textRootInput.value.trim() === "" ? openRoot : textRootInput.value.trim();
      if (!textRoot) {
        textStatus.textContent = "text: choose a project root first (open from Projects or paste its root below)";
        return;
      }
      const res = await win.panelforge.import.list({ root: textRoot });
      if (!res.ok || !res.data) {
        textFail("load manuscripts", res);
        return;
      }
      const manuscripts = (res.data as any).manuscripts as any[];
      textSelect.replaceChildren();
      if (manuscripts.length === 0) {
        textSelect.textContent = "";
        textStatus.textContent = "No manuscripts yet.";
        textText = null;
        normArea.value = "";
        textDetailArea.value = "";
        renderChapters([]);
        return;
      }
      for (const record of manuscripts as any[]) {
        const option = document.createElement("option");
        option.value = record.manuscriptId;
        option.textContent = `${record.title} (${record.format})`;
        textSelect.appendChild(option);
      }
      textStatus.textContent = `text: ${manuscripts.length} manuscript(s)`;
      void refreshText();
    })();
  });

  textSelect.setAttribute("aria-label", "Manuscript");
  textSelect.addEventListener("change", () => {
    textDetailArea.value = "";
    void refreshText();
  });

  textNormalizeBtn.addEventListener("click", () => {
    void (async () => {
      const manuscriptId = textSelect.value;
      if (!textRoot || manuscriptId === "") {
        textStatus.textContent = "text: load manuscripts first";
        return;
      }
      const res = await win.panelforge.text.normalize({ root: textRoot, manuscriptId });
      if (!res.ok || !res.data) {
        textFail("normalize", res);
        return;
      }
      const normalization = (res.data as any).normalization as any;
      textStatus.textContent = `text: normalized ${normalization.byteLength} bytes`;
      void refreshText();
    })();
  });

  textDeriveBtn.addEventListener("click", () => {
    void (async () => {
      const manuscriptId = textSelect.value;
      if (!textRoot || manuscriptId === "") {
        textStatus.textContent = "text: load manuscripts first";
        return;
      }
      const res = await win.panelforge.chapters.derive({ root: textRoot, manuscriptId });
      if (!res.ok || !res.data) {
        textFail("derive chapters", res);
        return;
      }
      const chapters = (res.data as any).chapters as any[];
      textStatus.textContent = `text: ${chapters.length} chapter(s)`;
      void refreshText();
    })();
  });

  // Scenes (S8U.3): hand-rolled scene list/detail over the stored
  // S3.4 rows. Pick a manuscript, read its normalized text (for
  // slicing), list / derive scenes; each scene is a focusable button
  // showing its slice. Manual re-cutting stays a later task, so the
  // surface is read + derive only.
  const scenesSection = sections.scenes;
  const scenesStatus = document.createElement("div");
  scenesStatus.id = "scenes-status";
  scenesStatus.textContent = "scenes: open a project from Projects first (Alt+3), or paste its root below.";
  scenesSection.appendChild(scenesStatus);
  const scenesRootInput = document.createElement("input");
  scenesRootInput.id = "scenes-root";
  scenesRootInput.placeholder = "Project root (directory)";
  scenesRootInput.setAttribute("aria-label", "Project root");
  scenesSection.appendChild(scenesRootInput);
  const scenesLoadBtn = document.createElement("button");
  scenesLoadBtn.type = "button";
  scenesLoadBtn.textContent = "Load manuscripts";
  scenesSection.appendChild(scenesLoadBtn);
  const scenesSelect = document.createElement("select");
  scenesSelect.id = "scenes-manuscript";
  scenesSelect.setAttribute("aria-label", "Manuscript");
  scenesSection.appendChild(scenesSelect);
  const scenesDeriveBtn = document.createElement("button");
  scenesDeriveBtn.type = "button";
  scenesDeriveBtn.textContent = "Derive scenes";
  scenesSection.appendChild(scenesDeriveBtn);
  const scenesDetail = document.createElement("textarea");
  scenesDetail.id = "scenes-detail";
  scenesDetail.setAttribute("aria-label", "Scene text");
  scenesDetail.readOnly = true;
  scenesSection.appendChild(scenesDetail);
  const scenesListEl = document.createElement("div");
  scenesListEl.id = "scenes-list";
  scenesSection.appendChild(scenesListEl);

  let scenesRoot: string | null = openRoot;
  let scenesText: string | null = null;

  function scenesFail(action: string, res: { code?: string; message?: string }): void {
    scenesStatus.textContent = `scenes ${action} failed: ${res.code ?? "error"} ${res.message ?? ""}`;
  }

  async function refreshScenes(): Promise<void> {
    const manuscriptId = scenesSelect.value;
    if (!scenesRoot || manuscriptId === "") {
      return;
    }
    const textRes = await win.panelforge.text.get({ root: scenesRoot, manuscriptId });
    scenesText = null;
    if (textRes.ok && textRes.data) {
      const normalization = (textRes.data as any).normalization as any | null;
      if (normalization) {
        scenesText = normalization.normalizedText as string;
      }
    }
    const chaptersRes = await win.panelforge.chapters.list({ root: scenesRoot, manuscriptId });
    const chapterTitles = new Map<string, string>();
    if (chaptersRes.ok && chaptersRes.data) {
      for (const chapter of (chaptersRes.data as any).chapters as any[]) {
        chapterTitles.set(chapter.chapterId as string, chapter.title as string);
      }
    }
    const result = await win.panelforge.scenes.list({ root: scenesRoot, manuscriptId });
    if (!result.ok || !result.data) {
      scenesFail("list", result);
      return;
    }
    const scenes = (result.data as any).scenes as any[];
    scenesStatus.textContent = `scenes: ${scenes.length} scene(s)`;
    scenesListEl.replaceChildren();
    if (scenes.length === 0) {
      scenesListEl.textContent = "No scenes yet.";
      return;
    }
    for (const scene of scenes as any[]) {
      const chapterTitle = chapterTitles.get(scene.chapterId) ?? `chapter ${String(scene.chapterId).slice(0, 8)}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${chapterTitle}: ${scene.title} (chars ${scene.normStart}–${scene.normEnd})`;
      btn.setAttribute("aria-label", `Show scene: ${scene.title}`);
      btn.addEventListener("click", () => {
        if (scenesText === null) {
          scenesDetail.value = "";
          scenesStatus.textContent = "No normalized text for this manuscript.";
          return;
        }
        scenesDetail.value = scenesText.slice(scene.normStart, scene.normEnd);
        scenesStatus.textContent = `scenes: ${chapterTitle}: ${scene.title} (chars ${scene.normStart}–${scene.normEnd})`;
      });
      const wrapper = document.createElement("div");
      wrapper.appendChild(btn);
      scenesListEl.appendChild(wrapper);
    }
  }

  scenesLoadBtn.addEventListener("click", () => {
    void (async () => {
      scenesRoot = scenesRootInput.value.trim() === "" ? openRoot : scenesRootInput.value.trim();
      if (!scenesRoot) {
        scenesStatus.textContent = "scenes: choose a project root first (open from Projects or paste its root below)";
        return;
      }
      const res = await win.panelforge.import.list({ root: scenesRoot });
      if (!res.ok || !res.data) {
        scenesFail("load manuscripts", res);
        return;
      }
      const manuscripts = (res.data as any).manuscripts as any[];
      scenesSelect.replaceChildren();
      if (manuscripts.length === 0) {
        scenesSelect.textContent = "";
        scenesStatus.textContent = "No manuscripts yet.";
        scenesText = null;
        scenesDetail.value = "";
        scenesListEl.textContent = "No scenes yet.";
        return;
      }
      for (const record of manuscripts as any[]) {
        const option = document.createElement("option");
        option.value = record.manuscriptId;
        option.textContent = `${record.title} (${record.format})`;
        scenesSelect.appendChild(option);
      }
      scenesStatus.textContent = `scenes: ${manuscripts.length} manuscript(s)`;
      void refreshScenes();
    })();
  });

  scenesSelect.addEventListener("change", () => {
    scenesDetail.value = "";
    void refreshScenes();
  });

  scenesDeriveBtn.addEventListener("click", () => {
    void (async () => {
      const manuscriptId = scenesSelect.value;
      if (!scenesRoot || manuscriptId === "") {
        scenesStatus.textContent = "scenes: load manuscripts first";
        return;
      }
      const res = await win.panelforge.scenes.derive({ root: scenesRoot, manuscriptId });
      if (!res.ok || !res.data) {
        scenesFail("derive scenes", res);
        return;
      }
      const scenes = (res.data as any).scenes as any[];
      scenesStatus.textContent = `scenes: ${scenes.length} scene(s)`;
      void refreshScenes();
    })();
  });
}
