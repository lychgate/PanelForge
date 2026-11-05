// S2.11 Provider Health Checks tests.
//
// Proves the spec acceptance:
// - Unreachable/missing-model providers report unhealthy
// - Healthy providers report ready
// - No dispatch to unhealthy providers (gated executor never executes)
//
// Imported from the built `out/node/engines/provider/*.js`. Adapters are
// fakes, so tests run in plain Node without a display.
const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/provider", rel);
if (!fs.existsSync(built("health.js"))) {
  throw new Error("Missing out/node/engines/provider/health.js — run 'npm run build' first");
}

const { checkProviderHealth, createHealthMonitor, createGatedExecutor } = require(built("health.js"));

function readyAdapter(overrides = {}) {
  return {
    id: "mock",
    displayName: "Mock",
    execute: async () => ({ ok: true, output: null }),
    interrupt: () => {},
    health: async () => ({ status: "ready", checkedAt: new Date().toISOString() }),
    ...overrides,
  };
}

describe("S2.11 provider health checks", () => {
  it("a healthy provider reports ready", async () => {
    const report = await checkProviderHealth(readyAdapter());
    expect(report.providerId).toBe("mock");
    expect(report.status).toBe("ready");
    expect(typeof report.checkedAt).toBe("string");
  });

  it("a throwing health probe reports unavailable (never throws across)", async () => {
    const adapter = readyAdapter({
      health: async () => {
        throw new Error("connection refused");
      },
    });
    const report = await checkProviderHealth(adapter);
    expect(report.status).toBe("unavailable");
    expect(report.detail).toContain("refused");
  });

  it("a malformed health report degrades to unknown (never fabricated ready)", async () => {
    const adapter = readyAdapter({ health: async () => ({ status: "degraded" }) });
    const report = await checkProviderHealth(adapter);
    expect(report.status).toBe("unknown");
  });

  it("missing expected models report unhealthy", async () => {
    const adapter = readyAdapter({
      models: async () => ["only-this"],
    });
    const report = await checkProviderHealth(adapter, { expectedModels: ["needed"] });
    expect(report.status).toBe("unavailable");
    expect(report.detail).toContain("missing models");
  });

  it("the monitor caches reports with timestamps and gates by readiness", async () => {
    const monitor = createHealthMonitor();
    monitor.register(readyAdapter());
    monitor.register(
      readyAdapter({
        id: "comfyui",
        health: async () => ({ status: "unavailable", detail: "down", checkedAt: new Date().toISOString() }),
      })
    );
    const reports = await monitor.checkAll();
    expect(reports).toHaveLength(2);
    expect(monitor.isReady("mock")).toBe(true);
    expect(monitor.isReady("comfyui")).toBe(false);
    expect(monitor.report("comfyui").detail).toBe("down");
    expect(() => monitor.requireReady("comfyui")).toThrow(expect.objectContaining({ code: "UNHEALTHY" }));
  });

  it("the gated executor never dispatches to unhealthy providers", async () => {
    let executed = 0;
    const monitor = createHealthMonitor();
    monitor.register(
      readyAdapter({
        health: async () => ({ status: "unavailable", detail: "down", checkedAt: new Date().toISOString() }),
      })
    );
    await monitor.checkAll();
    const gated = createGatedExecutor(
      readyAdapter({
        execute: async () => {
          executed++;
          return { ok: true, output: null };
        },
      }),
      monitor
    );
    const result = await gated({ taskId: "t1", taskType: "text", params: {} });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNAVAILABLE");
    expect(executed).toBe(0);
  });

  it("the gated executor dispatches once the provider is ready", async () => {
    const monitor = createHealthMonitor();
    const adapter = readyAdapter();
    monitor.register(adapter);
    await monitor.checkAll();
    const gated = createGatedExecutor(adapter, monitor);
    const result = await gated({ taskId: "t2", taskType: "text", params: {} });
    expect(result.ok).toBe(true);
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/provider/health.ts"), "utf8");
    const code = source
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
