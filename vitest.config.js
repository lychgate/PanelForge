// PanelForge — Vitest configuration.
//
// Excludes the Electron Forge output dir (forge-out/) and the compiled
// output (out/) so their packaged copies of the app (which include test
// files) are never collected as tests. Defaults for node_modules/dist
// are kept (this `exclude` overrides vitest's built-in list).
const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "forge-out/**",
      "out/**",
    ],
  },
});
