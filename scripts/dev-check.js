// Placeholder for S0.1 development script.
// Stage 0 task S0.1 requires "basic development scripts". At S0.1, no Electron
// window exists yet (that is S0.2), so the dev script only verifies that the
// TypeScript projects typecheck and the baseline is coherent.
const { execSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");

console.log("[panelforge] dev: verifying S0.1 baseline (typecheck + check)…");

execSync("npm run typecheck", { cwd: root, stdio: "inherit" });
execSync("node scripts/check.js", { cwd: root, stdio: "inherit" });

console.log("[panelforge] dev: baseline OK. (Electron launch is S0.2, not part of S0.1.)");
