// PanelForge baseline check — verifies the S0.1 package baseline is coherent.
// This script is intentionally dependency-free so it can run before `npm install`
// completes, and it never imports application code (none exists yet at S0.1).

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

const forbiddenDependencies = [
  "electron",
  "better-sqlite3",
  "drizzle-orm",
  "sharp",
  "pdf-lib",
  "zod",
  "react",
  "vue",
  "comfyui",
];

const errors = [];
const warnings = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`Missing required file: ${file}`);
  }
}

const pkgPath = path.join(root, "package.json");
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
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
        `package.json: '${forbidden}' must not be installed at S0.1 ` +
          "(not needed until its own task; keeps S0.1 deliberately boring)"
      );
    }
  }
  for (const script of ["typecheck", "build", "test", "dev"]) {
    if (!pkg.scripts || typeof pkg.scripts[script] !== "string" || pkg.scripts[script].trim() === "") {
      errors.push(`package.json: scripts.${script} must exist`);
    }
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

console.log("[check] OK — S0.1 package baseline verified:");
console.log("  - Required files present");
console.log("  - package.json is private, named 'panelforge'");
console.log("  - No database/AI/Electron dependencies installed at S0.1");
console.log("  - Scripts: dev, build, typecheck, test");
