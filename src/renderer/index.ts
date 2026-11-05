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
  version: Record<string, never>;
};

type PanelForgeWindow = Window & { panelforge: PanelForgeApi };

const win = window as unknown as PanelForgeWindow;

const VIEWS = ["diagnostics", "about", "projects"] as const;
const VIEW_TITLES: Record<(typeof VIEWS)[number], string> = {
  diagnostics: "Diagnostics",
  about: "About",
  projects: "Projects",
};

const navigation = createNavigation(VIEWS, "diagnostics");
const shortcuts = createShortcutRegistry();
shortcuts.register("nav.diagnostics", "Go to Diagnostics view", "Alt+1");
shortcuts.register("nav.about", "Go to About view", "Alt+2");
shortcuts.register("nav.projects", "Go to Projects view", "Alt+3");

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
}
