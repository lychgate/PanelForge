// S2.15 Telemetry Adapter Interface tests.
//
// Proves the spec acceptance: adapters can be added per-platform
// without touching the Resource Manager.
//
// - Registry: register + sampleAll, throws normalize to unknown,
//   malformed samples rejected to unknown, stable order.
// - OS memory adapter: RAM metrics detected with >0 values.
// - NVIDIA adapter: CSV parsing, absent/throwing probes, no zero
//   fabrication (0% utilization stays unavailable).
// - Detection integration: monitoring signal reflects adapters.
// - Resource Manager isolation: resources.ts never imports telemetry.
//
// Imported from the built `out/node/engines/hardware/telemetry.js`,
// run in plain Node without a display.
const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const telemetryPath = path.join(root, "out/node/engines/hardware/telemetry.js");
if (!fs.existsSync(telemetryPath)) {
  throw new Error("Missing out/node/engines/hardware/telemetry.js — run 'npm run build' first");
}
const detectPath = path.join(root, "out/node/engines/hardware/detect.js");
if (!fs.existsSync(detectPath)) {
  throw new Error("Missing out/node/engines/hardware/detect.js — run 'npm run build' first");
}

const {
  createTelemetryRegistry,
  createOsMemoryAdapter,
  createNvidiaAdapter,
  parseNvidiaTelemetryCsv,
  isTelemetrySample,
} = require(telemetryPath);
const { detectHardware } = require(detectPath);

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.15 telemetry adapter interface", () => {
  it("registry samples registered adapters in registration order", async () => {
    const registry = createTelemetryRegistry();
    expect(registry.list()).toEqual([]);
    expect(await registry.sampleAll()).toEqual([]);
    const at = new Date().toISOString();
    registry.register({
      id: "fake-a",
      sample: async () => ({
        adapterId: "fake-a",
        checkedAt: at,
        metrics: { temperatureC: { status: "detected", value: 55, checkedAt: at } },
      }),
    });
    registry.register({
      id: "fake-b",
      sample: async () => ({
        adapterId: "fake-b",
        checkedAt: at,
        metrics: { gpuUtilPercent: { status: "unavailable", detail: "n/a", checkedAt: at } },
      }),
    });
    expect(registry.list()).toEqual(["fake-a", "fake-b"]);
    const samples = await registry.sampleAll();
    expect(samples.map((s) => s.adapterId)).toEqual(["fake-a", "fake-b"]);
    expect(isTelemetrySample(samples[0])).toBe(true);
    expect(samples[0].metrics.temperatureC).toMatchObject({ status: "detected", value: 55 });
    expect(samples[1].metrics.gpuUtilPercent.status).toBe("unavailable");
  });

  it("throwing and malformed adapters normalize to unknown (never crash)", async () => {
    const registry = createTelemetryRegistry();
    registry.register({
      id: "throws",
      sample: async () => {
        throw new Error("probe exploded");
      },
    });
    registry.register({
      id: "malformed",
      sample: async () => ({ adapterId: "malformed" }),
    });
    const samples = await registry.sampleAll();
    expect(samples).toHaveLength(2);
    for (const sample of samples) {
      expect(isTelemetrySample(sample)).toBe(true);
      for (const signal of Object.values(sample.metrics)) {
        expect(signal.status).toBe("unknown");
        expect(signal.value).toBeUndefined();
      }
    }
  });

  it("isTelemetrySample enforces value-only-when-detected with positive numbers", () => {
    const at = new Date().toISOString();
    expect(
      isTelemetrySample({
        adapterId: "x",
        checkedAt: at,
        metrics: { temperatureC: { status: "detected", value: 0, checkedAt: at } },
      })
    ).toBe(false); // zero is never a measurement
    expect(
      isTelemetrySample({
        adapterId: "x",
        checkedAt: at,
        metrics: { temperatureC: { status: "unavailable", value: 42, checkedAt: at } },
      })
    ).toBe(false); // absent carries no value
    expect(
      isTelemetrySample({
        adapterId: "x",
        checkedAt: at,
        metrics: { temperatureC: { status: "detected", value: 42, checkedAt: at } },
      })
    ).toBe(true);
  });

  it("OS memory adapter reports RAM only when measurable", async () => {
    const adapter = createOsMemoryAdapter();
    expect(adapter.id).toBe("os-memory");
    const sample = await adapter.sample();
    expect(isTelemetrySample(sample)).toBe(true);
    const total = sample.metrics.ramTotalBytes;
    const used = sample.metrics.ramUsedBytes;
    for (const signal of Object.values(sample.metrics)) {
      if (signal.status === "detected") expect(signal.value).toBeGreaterThan(0);
      else expect(signal.value).toBeUndefined();
    }
    expect(typeof total).toBe("object");
    expect(total.status).toBe("detected"); // os.totalmem is measurable in Node
    expect(used.status).toBe("detected");
  });

  it("NVIDIA CSV parsing maps fields without fabricating zeros", () => {
    const metrics = parseNvidiaTelemetryCsv("61, 2048, 16376, 42");
    expect(metrics.temperatureC).toMatchObject({ status: "detected", value: 61 });
    expect(metrics.vramUsedBytes).toMatchObject({ status: "detected", value: 2048 * 1024 * 1024 });
    expect(metrics.vramTotalBytes).toMatchObject({ status: "detected", value: 16376 * 1024 * 1024 });
    expect(metrics.gpuUtilPercent).toMatchObject({ status: "detected", value: 42 });
    const zeroed = parseNvidiaTelemetryCsv("0, 0, 0, 0");
    expect(zeroed.temperatureC.status).toBe("unavailable");
    expect(zeroed.vramUsedBytes.status).toBe("unavailable");
    expect(zeroed.gpuUtilPercent.status).toBe("unavailable"); // 0% is not a measurement
  });

  it("NVIDIA adapter degrades to unavailable when the probe is absent", async () => {
    const absent = createNvidiaAdapter({ runProbe: async () => null });
    const sample = await absent.sample();
    expect(isTelemetrySample(sample)).toBe(true);
    expect(sample.adapterId).toBe("nvidia");
    for (const signal of Object.values(sample.metrics)) {
      expect(signal.status).toBe("unavailable");
      expect(signal.value).toBeUndefined();
    }
    const present = createNvidiaAdapter({ runProbe: async () => "55, 1024, 8192, 10" });
    const found = await present.sample();
    expect(found.metrics.temperatureC).toMatchObject({ status: "detected", value: 55 });
  });

  it("detection monitoring signal reflects registered adapters", async () => {
    const base = { runGpuProbe: async () => null, probeService: async () => "refused" };
    const without = await detectHardware(base);
    expect(without.monitoring.status).toBe("unknown");
    const withAdapters = await detectHardware({
      ...base,
      telemetryAdapters: [createOsMemoryAdapter(), createNvidiaAdapter({ runProbe: async () => null })],
    });
    expect(withAdapters.monitoring).toMatchObject({ status: "detected", value: ["os-memory", "nvidia"] });
  });

  it("Resource Manager stays decoupled from telemetry (no import)", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/resources.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("telemetry");
    expect(code).not.toContain("TelemetryAdapter");
  });
});
