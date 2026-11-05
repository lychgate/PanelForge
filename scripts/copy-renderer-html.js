// S0.2: Copy the static renderer HTML into the web output.
// `tsc` only emits TypeScript; it does not copy `.html` files, so the build
// needs one explicit copy step. Uses only Node.js built-ins (fs/path) so
// S0.2 adds no new dependency for this.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src", "renderer", "index.html");
const destDir = path.join(root, "out", "web", "renderer");
const dest = path.join(destDir, "index.html");

if (!fs.existsSync(src)) {
  console.error(`[panelforge] build: missing renderer HTML: ${src}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[panelforge] build: copied renderer HTML → ${path.relative(root, dest)}`);
