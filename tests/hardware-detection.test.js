// S2.14 Hardware Detection tests.
//
// Proves the spec acceptance (§10.1): each signal reports exactly one
// of Detected/Unavailable/Unknown; absence is never shown as zero.
//
// - RAM/CPU measured via os (injected fakes for coverage of the honest
//   unavailable/unknown branches).
// - GPU: present / absent / throwing probe.
// - Services: up / refused / error probes.
// - Monitoring: unknown until S2.15 (never zero, never fabricated).
// - Validators enforce the value-present-iff-detected rule.
//
// Imported from the built `out/node/engines/hardware/detect.js`, run in
// plain Node without a display.
const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const detectPath = path.join(root, "out/node/engines/hardware/detect.js");
if (!fs.existsSync(detectPath)) {
  throw new Error("Missing out/node/engines/hardware/detect.js — run 'npm run build' first");
}

const {
  detectHardware,
  isSignalStatus,
  isHardwareSnapshot,
  LMSTUDIO_HEALTH_URL,
  COMFYUI_HEALTH_URL,
} = require(detectPath);

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const SIGNALS = ["gpuModel", "vramBytes", "ramBytes", "cpu", "imageBackends", "modelServices", "monitoring"];

function expectSignalRules(snapshot) {
  for (const key of SIGNALS) {
    const signal = snapshot[key];
    expect(isSignalStatus(signal.status)).toBe(true);
    expect(typeof signal.checkedAt).toBe("string");
    if (signal.status === "detected") {
      expect(signal.value).toBeDefined();
      if (typeof signal.value === "number") expect(signal.value).toBeGreaterThan(0);
    } else {
      // Absence is never shown as zero — no value at all.
      expect(signal.value).toBeUndefined();
    }
  }
}

describe("S2.14 hardware detection", () => {
  it("all seven signals present and honestly typed", async () => {
    const snapshot = await detectHardware({
      totalMem: () => 16 * 1024 * 1024 * 1024,
      cpus: () => [{ model: "Test CPU" }, { model: "Test CPU" }],
      runGpuProbe: async () => ({ name: "Test GPU", vramBytes: 8 * 1024 * 1024 * 1024 }),
      probeService: async (url) => (url === COMFYUI_HEALTH_URL ? "up" : "refused"),
    });
    expectSignalRules(snapshot);
    expect(isHardwareSnapshot(snapshot)).toBe(true);
    expect(snapshot.gpuModel).toMatchObject({ status: "detected", value: "Test GPU" });
    expect(snapshot.vramBytes.value).toBe(8 * 1024 * 1024 * 1024);
    expect(snapshot.ramBytes.value).toBe(16 * 1024 * 1024 * 1024);
    expect(snapshot.cpu.value).toEqual({ model: "Test CPU", cores: 2 });
    expect(snapshot.imageBackends).toMatchObject({ status: "detected", value: ["comfyui"] });
    expect(snapshot.modelServices).toMatchObject({ status: "detected", value: ["comfyui"] });
    expect(snapshot.monitoring.status).toBe("unknown");
  });

  it("LM Studio probe URL is used for model services", async () => {
    const seen = [];
    const snapshot = await detectHardware({
      runGpuProbe: async () => null,
      probeService: async (url) => {
        seen.push(url);
        return url === LMSTUDIO_HEALTH_URL ? "up" : "refused";
      },
    });
    expect(seen).toContain(LMSTUDIO_HEALTH_URL);
    expect(snapshot.modelServices).toMatchObject({ status: "detected", value: ["lmstudio"] });
  });

  it("absent GPU and services report unavailable (never zero values)", async () => {
    const snapshot = await detectHardware({
      runGpuProbe: async () => null,
      probeService: async () => "refused",
    });
    expectSignalRules(snapshot);
    expect(snapshot.gpuModel.status).toBe("unavailable");
    expect(snapshot.vramBytes.status).toBe("unavailable");
    expect(snapshot.imageBackends.status).toBe("unavailable");
    expect(snapshot.modelServices.status).toBe("unavailable");
  });

  it("ambiguous probes report unknown (timeouts, probe errors)", async () => {
    const throwingGpu = await detectHardware({
      runGpuProbe: async () => {
        throw new Error("spawn exploded");
      },
      probeService: async () => "error",
    });
    expectSignalRules(throwingGpu);
    expect(throwingGpu.gpuModel.status).toBe("unknown");
    expect(throwingGpu.vramBytes.status).toBe("unknown");
    expect(throwingGpu.imageBackends.status).toBe("unknown");
    expect(throwingGpu.modelServices.status).toBe("unknown");
  });

  it("empty CPU list and zero RAM degrade honestly", async () => {
    const snapshot = await detectHardware({
      totalMem: () => 0,
      cpus: () => [],
      runGpuProbe: async () => ({ name: "GPU", vramBytes: 0 }),
    });
    expectSignalRules(snapshot);
    expect(snapshot.cpu.status).toBe("unavailable");
    expect(snapshot.ramBytes.status).toBe("unknown");
    expect(snapshot.vramBytes.status).toBe("unavailable");
  });

  it("default detection never throws and keeps signal rules", async () => {
    const snapshot = await detectHardware();
    expectSignalRules(snapshot);
    expect(isHardwareSnapshot(snapshot)).toBe(true);
    expect(snapshot.monitoring.status).toBe("unknown");
  });

  it("validators reject malformed snapshots", () => {
    expect(isSignalStatus("detected")).toBe(true);
    expect(isSignalStatus("degraded")).toBe(false);
    expect(isHardwareSnapshot(null)).toBe(false);
    expect(
      isHardwareSnapshot({
        gpuModel: { status: "detected", checkedAt: new Date().toISOString() }, // detected without value
        vramBytes: { status: "unavailable", checkedAt: new Date().toISOString() },
        ramBytes: { status: "unavailable", checkedAt: new Date().toISOString() },
        cpu: { status: "unavailable", checkedAt: new Date().toISOString() },
        imageBackends: { status: "unavailable", checkedAt: new Date().toISOString() },
        modelServices: { status: "unavailable", checkedAt: new Date().toISOString() },
        monitoring: { status: "unknown", checkedAt: new Date().toISOString() },
        checkedAt: new Date().toISOString(),
      })
    ).toBe(false);
  });

  it("startup wires detection as a non-blocking lifecycle step", () => {
    const main = fs.readFileSync(path.join(root, "src/main/index.ts"), "utf8");
    const code = stripLineComments(main);
    expect(code).toContain("detectHardware");
    expect(code).toContain("hardware-detection");
  });
});
