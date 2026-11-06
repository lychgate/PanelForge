// S2.16 Graceful Telemetry Failure tests.
//
// Proves the spec acceptance (§10.4): killing telemetry yields Unknown
// everywhere, conservative scheduling, and an explicit unavailable
// indicator — without disabling the app.
//
// - Empty/throwing/absent samples → unavailable verdict + indicator.
// - displayMetric never renders zero or estimates.
// - resolveEffectiveProfile clamps concurrency to 1 but preserves the
//   user-configured cooling interval.
// - The queue still runs to completion on the effective profile
//   (app fully usable without telemetry).
//
// Imported from the built `out/node/engines/hardware/telemetry-status.js`,
// run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const statusPath = path.join(root, "out/node/engines/hardware/telemetry-status.js");
if (!fs.existsSync(statusPath)) {
  throw new Error("Missing out/node/engines/hardware/telemetry-status.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(path.join(root, "out/node/engines/tasks/store.js"));
const { createTaskQueue } = require(path.join(root, "out/node/engines/tasks/queue.js"));
const { createMockAdapter } = require(path.join(root, "out/node/engines/provider/mock.js"));
const { resolveResourceProfile, createProfileQueue } = require(
  path.join(root, "out/node/engines/tasks/resources.js")
);
const {
  displayMetric,
  summarizeTelemetry,
  resolveEffectiveProfile,
  isTelemetryAvailable,
  UNKNOWN_DISPLAY,
  TELEMETRY_UNAVAILABLE_INDICATOR,
} = require(statusPath);

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-telemfail-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

const at = new Date().toISOString();
function sampleWith(id, metrics) {
  return { adapterId: id, checkedAt: at, metrics };
}

describe("S2.16 graceful telemetry failure", () => {
  it("killed telemetry yields the explicit unavailable indicator", () => {
    expect(summarizeTelemetry([])).toMatchObject({
      available: false,
      indicator: TELEMETRY_UNAVAILABLE_INDICATOR,
      detectedCount: 0,
    });
    const allUnknown = summarizeTelemetry([
      sampleWith("dead", {
        temperatureC: { status: "unknown", detail: "killed", checkedAt: at },
        vramTotalBytes: { status: "unavailable", detail: "killed", checkedAt: at },
      }),
      sampleWith("dead-2", { gpuUtilPercent: { status: "unknown", detail: "killed", checkedAt: at } }),
    ]);
    expect(allUnknown.available).toBe(false);
    expect(allUnknown.indicator).toBe(TELEMETRY_UNAVAILABLE_INDICATOR);
    expect(isTelemetryAvailable([])).toBe(false);
  });

  it("present telemetry clears the indicator", () => {
    const summary = summarizeTelemetry([
      sampleWith("live", { temperatureC: { status: "detected", value: 61, checkedAt: at } }),
    ]);
    expect(summary.available).toBe(true);
    expect(summary.indicator).toBe("");
    expect(summary.detectedCount).toBe(1);
    expect(isTelemetryAvailable([{ adapterId: "live", checkedAt: at, metrics: { temperatureC: { status: "detected", value: 61, checkedAt: at } } }])).toBe(true);
  });

  it("missing metrics display as Unknown — never 0, never an estimate", () => {
    expect(displayMetric({ status: "unavailable", detail: "x", checkedAt: at })).toEqual({
      display: UNKNOWN_DISPLAY,
      available: false,
    });
    expect(displayMetric({ status: "unknown", detail: "x", checkedAt: at })).toEqual({
      display: UNKNOWN_DISPLAY,
      available: false,
    });
    expect(displayMetric({ status: "detected", value: 61, checkedAt: at }, "°C")).toEqual({
      display: "61°C",
      available: true,
    });
  });

  it("unavailable telemetry clamps scheduling but preserves user cooling", () => {
    const performance = resolveResourceProfile("performance", { coolingIntervalMs: 250 });
    expect(performance.queueConcurrency).toBe(2);
    const effective = resolveEffectiveProfile(performance, []);
    expect(effective.queueConcurrency).toBe(1);
    expect(effective.memoryBehavior).toBe("conservative");
    expect(effective.coolingIntervalMs).toBe(250); // user-configured, untouched
    // With telemetry present, the profile passes through unchanged.
    const live = [sampleWith("live", { temperatureC: { status: "detected", value: 61, checkedAt: at } })];
    expect(resolveEffectiveProfile(performance, live).queueConcurrency).toBe(2);
  });

  it("invalid samples never count as availability", () => {
    expect(
      summarizeTelemetry([{ adapterId: "bad", checkedAt: at, metrics: { temperatureC: { status: "detected", value: 0, checkedAt: at } } }])
    ).toMatchObject({ available: false, indicator: TELEMETRY_UNAVAILABLE_INDICATOR });
    expect(summarizeTelemetry([{ adapterId: "bad" }])).toMatchObject({ available: false });
  });

  it("app stays fully usable: queue completes on the effective profile without telemetry", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const base = createTaskQueue(store, { text: (req) => mock.execute(req) });
    const effective = resolveEffectiveProfile(resolveResourceProfile("performance", { coolingIntervalMs: 1 }), []);
    const queue = createProfileQueue(base, store, effective);
    const first = await queue.enqueue("text");
    const second = await queue.enqueue("text");
    const results = await queue.runUntilIdle();
    expect(results).toContainEqual({ taskId: first.taskId, state: "complete" });
    expect(results).toContainEqual({ taskId: second.taskId, state: "complete" });
    // Availability indicator remains explicit alongside the working queue.
    expect(summarizeTelemetry([]).indicator).toBe(TELEMETRY_UNAVAILABLE_INDICATOR);
  });
});
