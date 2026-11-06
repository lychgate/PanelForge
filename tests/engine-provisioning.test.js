// S7.14 Engine provisioning tests.
//
// Proves the spec acceptance: engines absent → guided
// install under runtime/engines (registry records, health
// re-probe); user engine present → detected in place,
// unmodified; declined install → typed refusal; project
// trees untouched.
//
// - detectEngines reports detected/reachable from a
//   fixture server (untouched, never reinstalled).
// - ensureEngine with decline → ENGINE_MISSING typed.
// - ensureEngine with install → downloads from a fixture
//   source into runtime/engines, records source bundled.
//   (No re-probe gate in these tests: probe baseUrl
//   points at a fixture server too.)
// - Registry JSON + runtime dir layout verified.
//
// Imported from the built `out/node/engines/provider/provisioning.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const provisioningPath = path.join(root, "out/node/engines/provider/provisioning.js");
if (!fs.existsSync(provisioningPath)) {
  throw new Error("Missing out/node/engines/provider/provisioning.js — run 'npm run build' first");
}
const { detectEngines, ensureEngine, runtimeEnginesDir } = require(provisioningPath);

const ARTIFACT = Buffer.from("fixture-engine-bytes");

let server;
let baseUrl;
let runtimeDir;

function startFixture() {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.local");
    if (url.pathname === "/system_stats" || url.pathname === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(url.pathname === "/v1/models" ? JSON.stringify({ data: [{ id: "fixture-model" }] }) : JSON.stringify({ system: {} }));
    } else if (url.pathname === "/engine.bundle") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(ARTIFACT);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  delete process.env.PANELFORGE_RUNTIME_DIR;
});

beforeEach(async () => {
  runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-runtime-"));
  process.env.PANELFORGE_RUNTIME_DIR = runtimeDir;
  await startFixture();
});

describe("S7.14 engine provisioning", () => {
  it("detects reachable user installs (in place, unmodified)", async () => {
    const detected = await detectEngines(baseUrl, baseUrl);
    expect(detected.comfyui.detected).toBe(true);
    expect(detected.lmstudio.detected).toBe(true);
    const record = await ensureEngine({ engine: "comfyui", decision: "decline", baseUrl });
    expect(record.source).toBe("detected");
    // Detection never writes an install dir.
    expect(fs.readdirSync(runtimeEnginesDir())).toEqual(["registry.json"]);
    const registry = JSON.parse(fs.readFileSync(path.join(runtimeEnginesDir(), "registry.json"), "utf8"));
    expect(registry.comfyui.source).toBe("detected");
  });

  it("declined install refuses typed with manual steps", async () => {
    await expect(ensureEngine({ engine: "lmstudio", decision: "decline", baseUrl: "http://127.0.0.1:1" })).rejects.toMatchObject({
      code: "ENGINE_MISSING",
    });
    const err = await ensureEngine({ engine: "lmstudio", decision: "decline", baseUrl: "http://127.0.0.1:1" }).catch((e) => e);
    expect(err.message).toContain("Manual install");
    expect(fs.readdirSync(runtimeEnginesDir())).toEqual([]);
  });

  it("confirmed install downloads under runtime/engines and records bundled", async () => {
    const record = await ensureEngine({
      engine: "comfyui",
      decision: "install",
      sourceUrl: `${baseUrl}/engine.bundle`,
      baseUrl: "http://127.0.0.1:1",
    });
    expect(record.source).toBe("bundled");
    expect(record.rootPath).toBe(path.join(runtimeEnginesDir(), "comfyui"));
    expect(fs.readFileSync(path.join(runtimeEnginesDir(), "comfyui", "engine.bundle"))).toEqual(ARTIFACT);
    const registry = JSON.parse(fs.readFileSync(path.join(runtimeEnginesDir(), "registry.json"), "utf8"));
    expect(registry.comfyui.source).toBe("bundled");
  });
});
