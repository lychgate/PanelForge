// S0.10 Keyboard Shortcuts and Navigation tests.
//
// Proves the spec acceptance:
// - Shortcut registration (registry: normalize, match, conflict detection)
// - Basic navigation structure (view manager: current/go/unknown rejected)
// - Documentation exists and matches the registered shortcuts
//
// The renderer modules are ESM, so they are loaded with dynamic import()
// (the vitest/vite transform handles them; no DOM is needed — both modules
// are DOM-free).
const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const shortcutsPath = path.join(root, "out/web/renderer/shortcuts.js");
const navigationPath = path.join(root, "out/web/renderer/navigation.js");
if (!fs.existsSync(shortcutsPath) || !fs.existsSync(navigationPath)) {
  throw new Error("Missing built renderer modules — run 'npm run build' first");
}

const { createShortcutRegistry, normalizeCombo } = await import(shortcutsPath);
const { createNavigation } = await import(navigationPath);

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S0.10 shortcut registry", () => {
  it("registers and finds shortcuts by normalized combo", () => {
    const r = createShortcutRegistry();
    r.register("nav.diagnostics", "Go to Diagnostics view", "Alt+1");
    const found = r.find({ key: "1", altKey: true });
    expect(found?.id).toBe("nav.diagnostics");
    expect(r.find("alt+1")?.id).toBe("nav.diagnostics");
    expect(r.find({ key: "1" })).toBeNull();
    expect(r.size()).toBe(1);
    expect(r.list()).toHaveLength(1);
  });

  it("normalizes modifier order and case", () => {
    expect(normalizeCombo("Ctrl+Alt+Q")).toBe("alt+ctrl+q");
    expect(normalizeCombo({ key: "Q", ctrlKey: true, altKey: true })).toBe("alt+ctrl+q");
    expect(normalizeCombo("alt+1")).toBe("alt+1");
  });

  it("rejects duplicates and empty registrations", () => {
    const r = createShortcutRegistry();
    r.register("a", "A", "Alt+1");
    expect(() => r.register("a", "dup id", "Alt+2")).toThrow(/Duplicate shortcut id/);
    expect(() => r.register("b", "dup combo", "alt+1")).toThrow(/Duplicate shortcut combo/);
    expect(() => r.register("", "empty id", "Alt+3")).toThrow(/must not be empty/);
  });

  it("matches KeyInput objects with ctrl/meta/shift", () => {
    const r = createShortcutRegistry();
    r.register("reload", "Reload", "Ctrl+R");
    expect(r.find({ key: "r", ctrlKey: true })?.id).toBe("reload");
    expect(r.find({ key: "r", metaKey: true })).toBeNull();
  });
});

describe("S0.10 navigation model", () => {
  it("defaults to the first view and navigates between views", () => {
    const nav = createNavigation(["diagnostics", "about"]);
    expect(nav.current()).toBe("diagnostics");
    expect(nav.list()).toEqual(["diagnostics", "about"]);
    expect(nav.go("about")).toBe(true);
    expect(nav.current()).toBe("about");
  });

  it("rejects unknown views without moving", () => {
    const nav = createNavigation(["diagnostics", "about"]);
    expect(nav.go("nope")).toBe(false);
    expect(nav.current()).toBe("diagnostics");
  });

  it("honors the initial view", () => {
    const nav = createNavigation(["diagnostics", "about"], "about");
    expect(nav.current()).toBe("about");
  });
});

describe("S0.10 documentation and wiring", () => {
  it("shortcuts document lists the registered view shortcuts", () => {
    const doc = fs.readFileSync(path.join(root, "Docs/PanelForge-Shortcuts.md"), "utf8");
    expect(doc).toContain("Alt+1");
    expect(doc).toContain("Alt+2");
    expect(doc).toContain("Ctrl+Q");
    expect(doc).toContain("Ctrl+R");
  });

  it("renderer html has a labelled nav landmark and visible focus styles", () => {
    const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain(":focus-visible");
  });

  it("renderer registers the view shortcuts and handles keydown", () => {
    const code = stripLineComments(fs.readFileSync(path.join(root, "src/renderer/index.ts"), "utf8"));
    expect(code).toContain("createShortcutRegistry");
    expect(code).toContain("keydown");
    expect(code).toContain("nav.diagnostics");
    expect(code).toContain("nav.about");
  });

  it("main sets an application menu with Quit/Reload accelerators", () => {
    const mainCode = stripLineComments(
      fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8")
    );
    expect(mainCode).toContain("setApplicationMenu");
    expect(mainCode).toContain("CmdOrCtrl+Q");
    expect(mainCode).toContain("CmdOrCtrl+R");
  });
});

// Live probe: launch Electron and drive the real renderer with keyboard
// events. Skipped when DISPLAY is unset (headless CI).
const { spawn } = require("child_process");
const probeMainPath = path.join(root, "out/node/main/index.js");
const preloadJs = path.join(root, "out/node/preload/index.js");
const hasBuild = fs.existsSync(probeMainPath) && fs.existsSync(preloadJs);
const hasDisplay = typeof process.env.DISPLAY === "string" && process.env.DISPLAY !== "";
const probeTest = hasBuild && hasDisplay ? it : it.skip;

describe("S0.10 shortcuts — live keyboard navigation probe", () => {
  probeTest("Alt+2 / Alt+1 switch views without mouse interaction", async function () {
    // Live Electron launch needs more than the 5s default (see timeout arg).
    const electronBin = path.join(root, "node_modules/.bin/electron");
    const code = `
const { app, BrowserWindow } = require("electron");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    preload: ${JSON.stringify(preloadJs)}
  }});
  await win.loadFile(${JSON.stringify(path.join(root, "out/web/renderer/index.html"))});
  await new Promise(r => setTimeout(r, 800));
  const before = await win.webContents.executeJavaScript(
    "document.getElementById('view-about').hidden"
  );
  await win.webContents.executeJavaScript(
    "document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', altKey: true, bubbles: true }))"
  );
  await new Promise(r => setTimeout(r, 200));
  const after = await win.webContents.executeJavaScript(
    "JSON.stringify({ aboutHidden: document.getElementById('view-about').hidden, diagHidden: document.getElementById('view-diagnostics').hidden, current: document.querySelector('#app-nav button[aria-current]').dataset.view })"
  );
  await win.webContents.executeJavaScript(
    "document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true }))"
  );
  await new Promise(r => setTimeout(r, 200));
  const back = await win.webContents.executeJavaScript(
    "JSON.stringify({ aboutHidden: document.getElementById('view-about').hidden, current: document.querySelector('#app-nav button[aria-current]').dataset.view })"
  );
  console.log("KEY_PROBE", JSON.stringify({ before, after: JSON.parse(after), back: JSON.parse(back) }));
  app.quit();
});
`;
    const probeFile = path.join(root, "out/node/main/probe-shortcuts.js");
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
    const match = output.match(/KEY_PROBE\s+(\{.*\})/);
    expect(match, `probe output was: ${output}`).not.toBeNull();
    const state = JSON.parse(match[1]);
    expect(state.before).toBe(true); // About hidden at start (Diagnostics current)
    expect(state.after.aboutHidden).toBe(false);
    expect(state.after.diagHidden).toBe(true);
    expect(state.after.current).toBe("about");
    expect(state.back.aboutHidden).toBe(true);
    expect(state.back.current).toBe("diagnostics");
  }, 30000);
});
