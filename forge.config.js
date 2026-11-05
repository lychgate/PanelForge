// PanelForge — Electron Forge packaging configuration (S0.11).
//
// Spec §14 names Electron Forge for packaging. This config produces:
// - `electron-forge package`: a runnable Linux build in out/<name>-linux-x64
//   (verified to launch independently of the development environment).
// - `electron-forge make`: an installable .deb (+ a .zip fallback) in
//   out/make/.
//
// Run `npm run build` first — Forge packages the project as-is, so the
// compiled `out/node` / `out/web` trees (package.json "main") must exist.
// No native modules are used (node:sqlite is built into Node), so no
// rebuild step is required.

const { MakerDeb } = require("@electron-forge/maker-deb");
const { MakerZIP } = require("@electron-forge/maker-zip");

module.exports = {
  // NB: not the default `out/` — the compiled app lives in `out/` (package.json
  // "main": out/node/main/index.js), and Forge/packager would exclude that dir.
  outDir: "forge-out",
  packagerConfig: {
    appBundleId: "com.panelforge.app",
    appCategoryType: "public.app-category.productivity",
    // Keep the packaged app lean: omit VCS, docs, sources, tests and the
    // Electron probe scripts (only the compiled out/ trees are needed).
    ignore: [/\.git/, /Docs\//, /ChangeLog\.md/, /Plan\.md/, /README\.md/, /^src\//, /^tests\//, /probe(-shortcuts)?\.js$/],
  },
  makers: [
    new MakerDeb({
      options: {
        categories: ["Utility"],
        description:
          "PanelForge — local-first desktop comic studio (Electron). Installs the PanelForge application.",
        genericName: "PanelForge",
        icon: "", // No app icon yet (icon task belongs to later UI work).
      },
    }),
    new MakerZIP({}, ["linux"]),
  ],
  hooks: {
    // Deterministic cleanup applied after packager copies the app: remove
    // sources, tests, docs and probe scripts so the package ships only what
    // the compiled out/ trees need at runtime. (The packager `ignore` list
    // above is best-effort; this guarantees the result.)
    packageAfterCopy: async (_config, buildPath) => {
      const fs = require("fs");
      const path = require("path");
      const removeAll = (entry) => {
        const target = path.join(buildPath, entry);
        if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
      };
      ["src", "tests", "Docs", "forge.config.js", "vitest.config.js", "tsconfig.json", "tsconfig.node.json", "tsconfig.web.json", "ChangeLog.md", "Plan.md", "README.md"].forEach(removeAll);
      const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (/probe(-shortcuts)?\.js$/.test(e.name)) fs.rmSync(full);
        }
      };
      walk(buildPath);
    },
  },
};
