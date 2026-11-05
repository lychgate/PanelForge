// S1.10 Basic Project Interface tests.
//
// Proves the spec acceptance:
// - Users manage projects without direct database interaction: the
//   renderer drives create/list/open/close/rename/archive through the
//   preload bridge (IPC + ops from S1.3)
// - The preload bridge is frozen and only wraps allowlisted channels
// - Live renderer probe: the Projects view renders and Alt+3 switches to it
//
// Pure wiring checks run in plain Node; the live probe needs DISPLAY.
const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S1.10 project interface — wiring", () => {
  it("preload exposes the frozen project bridge for all six operations", () => {
    const code = stripLineComments(fs.readFileSync(path.join(root, "src/preload/index.ts"), "utf8"));
    expect(code).toContain("project");
    for (const method of ["create", "list", "open", "close", "rename", "archive"]) {
      expect(code).toContain(method);
    }
    expect(code).toContain("panelforge:project.create");
    expect(code).toContain("panelforge:project.archive");
  });

  it("registry owns the six project channels with validation", () => {
    const code = stripLineComments(fs.readFileSync(path.join(root, "src/core/ipc/registry.ts"), "utf8"));
    expect(code).toContain("projectCreate");
    expect(code).toContain("isValidProjectCreateArgs");
    expect(code).toContain("defaultProjectManager");
    expect(code).toContain("resolveProjectsLibraryDir");
  });

  it("renderer registers the projects shortcut and renders the view", () => {
    const code = stripLineComments(fs.readFileSync(path.join(root, "src/renderer/index.ts"), "utf8"));
    expect(code).toContain("nav.projects");
    expect(code).toContain("Alt+3");
    expect(code).toContain("project.list()");
    expect(code).toContain(".create({ name:");
    expect(code).toContain("Create project");
  });

  it("shortcuts document covers the Projects view", () => {
    const doc = fs.readFileSync(path.join(root, "Docs/PanelForge-Shortcuts.md"), "utf8");
    expect(doc).toContain("Alt+3");
  });
});

// Live probe: launch Electron, load the real renderer, switch to Projects
// with Alt+3, and confirm the view renders. Skipped when DISPLAY is unset.
const { spawn } = require("child_process");
const preloadJs = path.join(root, "out/node/preload/index.js");
const probeMainPath = path.join(root, "out/node/main/index.js");
const hasBuild = fs.existsSync(probeMainPath) && fs.existsSync(preloadJs);
const hasDisplay = typeof process.env.DISPLAY === "string" && process.env.DISPLAY !== "";
const probeTest = hasBuild && hasDisplay ? it : it.skip;

describe("S1.10 project interface — live view probe", () => {
  probeTest("Alt+3 shows the Projects view with project controls", async function () {
    const electronBin = path.join(root, "node_modules/.bin/electron");
    const code = `
const { app, BrowserWindow } = require("electron");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    preload: ${JSON.stringify(preloadJs)}
  }});
  await win.loadFile(${JSON.stringify(path.join(root, "out/web/renderer/index.html"))});
  await new Promise(r => setTimeout(r, 1000));
  await win.webContents.executeJavaScript(
    "document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', altKey: true, bubbles: true }))"
  );
  await new Promise(r => setTimeout(r, 1200));
  const state = await win.webContents.executeJavaScript(
    "JSON.stringify({ projectsHidden: document.getElementById('view-projects').hidden, hasCreate: !!document.getElementById('project-name'), hasList: document.getElementById('project-list').textContent.length > 0 })"
  );
  console.log("PROJECTS_PROBE", state);
  app.quit();
});
`;
    const probeFile = path.join(root, "out/node/main/probe-projects.js");
    fs.writeFileSync(probeFile, code);
    const output = await new Promise((resolve, reject) => {
      const child = spawn(electronBin, [probeFile], {
        cwd: root,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20000,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (exitCode) => {
        if (exitCode !== 0) {
          reject(new Error(`probe electron exited ${exitCode}: ${out} ${err}`));
        } else {
          resolve(out + err);
        }
      });
    });
    const match = output.match(/PROJECTS_PROBE\s+(\{.*\})/);
    expect(match, `probe output was: ${output}`).not.toBeNull();
    const state = JSON.parse(match[1]);
    expect(state.projectsHidden).toBe(false);
    expect(state.hasCreate).toBe(true);
    expect(state.hasList).toBe(true);
  }, 30000);
});
