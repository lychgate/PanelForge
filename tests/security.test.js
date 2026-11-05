// S0.3 security harness — verifies the renderer security boundary.
//
// Proves the spec acceptance "Renderer cannot directly access Node.js":
// (1) static checks on the compiled main process (webPreferences),
// (2) static checks on the restricted preload bridge,
// (3) a live Electron probe of the renderer world.
//
// Requires an Electron build: run `npm run build` before `npm test`.
// Static checks fail with a clear message if `out/` is missing.
// The integration probe is skipped when no display is available (DISPLAY
// unset); set DISPLAY (e.g. DISPLAY=:0) to run it.
const { describe, it, expect, beforeAll } = await import("vitest");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const mainJs = path.join(root, "out/node/main/index.js");
const preloadJs = path.join(root, "out/node/preload/index.js");
const rendererTs = path.join(root, "src/renderer/index.ts");

function readFileOrFail(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${path.relative(root, p)} — run 'npm run build' first`);
  }
  return fs.readFileSync(p, "utf8");
}

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S0.3 security — webPreferences baseline (compiled main)", () => {
  const code = stripLineComments(readFileOrFail(mainJs));

  it("enables context isolation", () => {
    expect(code).toMatch(/contextIsolation:\s*true/);
  });

  it("disables Node integration", () => {
    expect(code).toMatch(/nodeIntegration:\s*false/);
  });

  it("enables sandboxing", () => {
    expect(code).toMatch(/sandbox:\s*true/);
  });

  it("enables webSecurity", () => {
    expect(code).toMatch(/webSecurity:\s*true/);
  });

  it("disables insecure content", () => {
    expect(code).toMatch(/allowRunningInsecureContent:\s*false/);
  });

  it("points at the preload bridge", () => {
    expect(code).toContain("../preload/index.js");
  });

  it("disables DevTools in packaged builds", () => {
    expect(code).toMatch(/devTools:\s*!(electron_1\.)?app\.isPackaged/);
  });
});

describe("S0.3 security — preload bridge", () => {
  const code = stripLineComments(readFileOrFail(preloadJs));

  it("exposes a frozen empty api", () => {
    expect(code).toContain("Object.freeze({})");
    expect(code).toContain("panelforge");
  });

  it("exposes no IPC surface", () => {
    expect(code).not.toContain("ipcRenderer");
    expect(code).not.toContain("ipcMain");
  });

  it("does not require node builtins", () => {
    expect(code).not.toMatch(/require\(['"](fs|path|os)["']\)/);
  });
});

describe("S0.3 security — renderer has no Node.js access", () => {
  const code = stripLineComments(readFileOrFail(rendererTs));

  it("contains no require/process/fs/electron tokens", () => {
    expect(code).not.toMatch(/require\(/);
    expect(code).not.toContain("process");
    expect(code).not.toMatch(/\bfs\b/);
    expect(code).not.toContain("ipcRenderer");
    expect(code).not.toContain("from \"electron\"");
    expect(code).not.toContain("from 'electron'");
  });
});

// Live probe: launch Electron and inspect the renderer world. Skipped when
// DISPLAY is unset (headless CI) — static checks above still run.
const probeMainPath = path.join(root, "out/node/main/index.js");
const hasBuild = fs.existsSync(probeMainPath);
const hasDisplay = typeof process.env.DISPLAY === "string" && process.env.DISPLAY !== "";

const probeTest = hasBuild && hasDisplay ? it : it.skip;

describe("S0.3 security — live renderer probe", () => {
  const env = { ...process.env };
  probeTest("renderer cannot access Node.js primitives", async () => {
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
  const result = await win.webContents.executeJavaScript(\`
    JSON.stringify({
      hasRequire: typeof require !== "undefined",
      hasProcess: typeof process !== "undefined",
      hasFs: typeof fs !== "undefined",
      hasElectron: typeof electron !== "undefined",
      hasPanelforge: typeof window.panelforge !== "undefined"
    })
  \`);
  console.log("PROBE_RESULT", result);
  app.quit();
});
`;
    const probeFile = path.join(root, "out/node/main/probe.js");
    fs.writeFileSync(probeFile, code);

    const output = await new Promise((resolve, reject) => {
      const child = spawn(electronBin, [probeFile], {
        cwd: root,
        env: { ...env, DISPLAY: process.env.DISPLAY },
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

    const match = output.match(/PROBE_RESULT\s+(\{.*\})/);
    expect(match, `probe output was: ${output}`).not.toBeNull();
    const state = JSON.parse(match[1]);
    expect(state.hasRequire).toBe(false);
    expect(state.hasProcess).toBe(false);
    expect(state.hasFs).toBe(false);
    expect(state.hasElectron).toBe(false);
    expect(state.hasPanelforge).toBe(true);
  }, 30000);
});
