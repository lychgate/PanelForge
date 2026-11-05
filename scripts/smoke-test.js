// PanelForge smoke test (S0.12) — repeatable end-to-end launch check.
//
// Launches the dev app (electron .) with an isolated userData dir,
// requires a clean startup + shutdown lifecycle in the app log, and
// verifies the expected user-data artifacts. Dependency-free: only
// Node built-ins. Skips (exit 0) when DISPLAY is unset (headless CI).
//
// Usage: DISPLAY=:0 npm run smoke   (run `npm run build` first)

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const electronBin = path.join(root, "node_modules/.bin/electron");

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(1);
}

if (!process.env.DISPLAY) {
  console.log("[smoke] SKIP: DISPLAY unset (headless) — run with DISPLAY=:0 locally.");
  process.exit(0);
}
if (!fs.existsSync(path.join(root, "out/node/main/index.js"))) {
  fail("missing out/node/main/index.js — run 'npm run build' first");
}
if (!fs.existsSync(path.join(root, "out/web/renderer/index.html"))) {
  fail("missing out/web/renderer/index.html — run 'npm run build' first");
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-smoke-"));
const logPath = path.join(userData, "logs", "panelforge.log");
const dbPath = path.join(userData, "database", "panelforge.db");

const child = spawn(electronBin, ["."], {
  cwd: root,
  env: { ...process.env, PANELFORGE_USER_DATA_DIR: userData },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
let err = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (err += d));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readLog() {
  try {
    return fs.readFileSync(logPath, "utf8");
  } catch {
    return "";
  }
}

async function waitFor(pred, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return;
    if (child.exitCode !== null) break;
    await sleep(250);
  }
  fail(`timed out waiting for ${label}; child exit=${child.exitCode} out=${out} err=${err}`);
}

async function main() {
  // 1. Startup: the full lifecycle must be recorded.
  await waitFor(() => readLog().includes("startup complete"), 20000, "startup complete");
  if (!readLog().includes("PanelForge starting")) fail("missing 'PanelForge starting' entry");
  if (!readLog().includes("database ready (journal=wal")) fail("missing WAL database entry");

  // 2. Artifacts under the isolated userData dir.
  if (!fs.existsSync(path.join(userData, "config"))) fail("config dir not created");
  if (!fs.existsSync(dbPath)) fail("database file not created");
  if (!fs.existsSync(logPath)) fail("log file not created");

  // 3. Clean shutdown: SIGTERM → before-quit lifecycle → exit.
  child.kill("SIGTERM");
  await waitFor(() => child.exitCode !== null, 15000, "clean exit");
  const log = readLog();
  if (!log.includes("PanelForge shutting down")) fail("missing 'PanelForge shutting down' entry");
  if (!log.includes("shutdown complete")) fail("missing 'shutdown complete' entry");

  // 4. No strays: no electron processes left behind.
  const pgrep = spawn("pgrep", ["-x", "electron"]);
  const strays = await new Promise((resolve) => {
    pgrep.on("close", (code) => resolve(code === 0));
  });
  if (strays) fail("stray electron process left behind");

  console.log("[smoke] PASS — startup, artifacts, shutdown, no strays");
  console.log(`[smoke] userData probe dir: ${userData}`);
}

main().catch((e) => fail(String(e && e.message ? e.message : e)));
