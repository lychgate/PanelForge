// PanelForge baseline check — verifies the package baseline is coherent
// (S0.1 scaffold + S0.2 Electron launch). Dependency-free; imports no app code.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const requiredFiles = [
  "package.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "tsconfig.web.json",
  ".gitignore",
  "README.md",
  "scripts/check.js",
];

// S0.2 allows electron; DB/AI/UI deps remain forbidden until their own tasks.
const forbiddenDependencies = [
  "better-sqlite3",
  "drizzle-orm",
  "sharp",
  "pdf-lib",
  "zod",
  "react",
  "vue",
  "comfyui",
];

const requiredDevDependencies = ["electron", "typescript"];

const errors = [];
const warnings = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`Missing required file: ${file}`);
  }
}

let pkg = null;
const pkgPath = path.join(root, "package.json");
if (fs.existsSync(pkgPath)) {
  pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (!pkg.name || pkg.name !== "panelforge") {
    errors.push("package.json: name must be 'panelforge'");
  }
  if (pkg.private !== true) {
    errors.push("package.json: private must be true (no accidental publishing)");
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const forbidden of forbiddenDependencies) {
    if (forbidden in deps) {
      errors.push(
        `package.json: '${forbidden}' must not be installed yet ` +
          "(not needed until its own task)"
      );
    }
  }
  for (const required of requiredDevDependencies) {
    if (!(required in deps)) {
      errors.push(`package.json: expected devDependency missing: ${required} (S0.2)`);
    }
  }
  for (const script of ["typecheck", "build", "test", "dev", "start"]) {
    if (!pkg.scripts || typeof pkg.scripts[script] !== "string" || pkg.scripts[script].trim() === "") {
      errors.push(`package.json: scripts.${script} must exist`);
    }
  }
  if (pkg.scripts && typeof pkg.scripts.start === "string" && pkg.scripts.start.trim() !== "electron .") {
    errors.push("package.json: scripts.start must be 'electron .' (canonical launch via main entry)");
  }
  if (!pkg.main || !String(pkg.main).includes("out/node/main")) {
    errors.push("package.json: main must point to out/node/main/index.js (S0.2)");
  }
  if (!pkg.scripts || !pkg.scripts.build || !pkg.scripts.build.includes("copy-renderer-html")) {
    errors.push("package.json: build must include scripts/copy-renderer-html.js (S0.2)");
  }
}

const gitignorePath = path.join(root, ".gitignore");
if (fs.existsSync(gitignorePath)) {
  const ignore = fs.readFileSync(gitignorePath, "utf8");
  for (const pattern of ["node_modules/", "out/", "dist/"]) {
    if (!ignore.includes(pattern)) {
      warnings.push(`.gitignore: expected pattern not found: ${pattern}`);
    }
  }
}

// S0.3 zero-IPC guard: no IPC surface may exist under src/, with one
// exception — the restricted preload bridge. The bridge may use
// contextBridge/exposeInMainWorld to expose its frozen empty api ONLY
// (no ipcRenderer/ipcMain, no fs/path/require). S0.3 allows exactly
// this; S0.4 owns the IPC allowlist.
const srcDir = path.join(root, "src");
const forbiddenIpc = ["ipcMain", "ipcRenderer"];
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith(".ts")) out.push(full);
  }
  return out;
}
const bridgeExceptions = [path.join(srcDir, "preload/index.ts")];
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, "utf8");
  // Strip // comments so explanatory comments mentioning these words don't trip the guard.
  const code = text.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const isBridge = bridgeExceptions.includes(file);
  // Bridge may use contextBridge/exposeInMainWorld for its frozen api.
  if (!isBridge) {
    for (const token of ["contextBridge", "exposeInMainWorld"]) {
      if (code.includes(token)) {
        errors.push(`src/: forbidden IPC surface '${token}' found in ${path.relative(root, file)} (S0.3 bridge exception does not apply)`);
      }
    }
  }
  for (const token of forbiddenIpc) {
    if (code.includes(token)) {
      errors.push(`src/: forbidden IPC surface '${token}' found in ${path.relative(root, file)} (S0.2 must have zero IPC)`);
    }
  }
  // Bridge must not require node builtins.
  if (isBridge) {
    if (/require\(['"](fs|path|os|electron)['"]\)/.test(code) && !/from ['"]electron['"]/.test(code)) {
      // from 'electron' is allowed in preload; require('fs') etc. is not.
    }
    if (code.includes("require(\"fs\")") || code.includes("require('fs')") || code.includes("require(\"path\")") || code.includes("require('path')")) {
      errors.push(`src/preload/index.ts: preload must not require node builtins`);
    }
  }
}

for (const warning of warnings) {
  console.warn(`[check] warn: ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[check] error: ${error}`);
  }
  console.error(`[check] FAILED with ${errors.length} error(s)`);
  process.exit(1);
}

console.log("[check] OK — package baseline verified (S0.1 + S0.2 electron + S0.3 bridge):");
console.log("  - Required files present");
console.log("  - package.json is private, named 'panelforge'");
console.log("  - Required devDeps present: electron; no DB/AI deps");
console.log("  - main entry + start script (electron .) correct");
console.log("  - Scripts: dev, build, start, typecheck, test");
console.log("  - No IPC surface except frozen S0.3 preload bridge (no ipcRenderer/ipcMain)");
