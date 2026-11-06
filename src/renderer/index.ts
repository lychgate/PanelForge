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
  version: Record<string, never>;
};

type PanelForgeWindow = Window & { panelforge: PanelForgeApi };

const win = window as unknown as PanelForgeWindow;

const VIEWS = ["diagnostics", "about", "projects", "storyboard"] as const;
const VIEW_TITLES: Record<(typeof VIEWS)[number], string> = {
  diagnostics: "Diagnostics",
  about: "About",
  projects: "Projects",
  storyboard: "Storyboard",
};

const navigation = createNavigation(VIEWS, "diagnostics");
const shortcuts = createShortcutRegistry();
shortcuts.register("nav.diagnostics", "Go to Diagnostics view", "Alt+1");
shortcuts.register("nav.about", "Go to About view", "Alt+2");
shortcuts.register("nav.projects", "Go to Projects view", "Alt+3");
shortcuts.register("nav.storyboard", "Go to Storyboard view", "Alt+4");

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
}
