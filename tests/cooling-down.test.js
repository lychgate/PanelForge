// S2.17 Cooling Down State tests.
//
// Proves the spec acceptance (§10.5): cooling is distinguishable from
// Paused/Failed/Waiting/Complete, explains why, and resumes correctly.
//
// - Threshold evaluation: soft/hard trip only on measured temperature;
//   unknown telemetry never triggers cooling.
// - While hot, new dispatch blocks (queued tasks wait, never fail).
// - A generating task cooperatively cools (generating → cooling-down
//   → queued → complete); other running states are left to finish.
// - describeCooling answers all five §10.5 questions.
// - Notifications fire on into/out-of-cooling edges.
// - No temperature/fan/power control is claimed (source guard).
//
// Imported from the built `out/node/engines/tasks/cooling.js` with a
// fresh temp DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("cooling.js"))) {
  throw new Error("Missing out/node/engines/tasks/cooling.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { createTaskQueue } = require(built("queue.js"));
const { createMockAdapter } = require(path.join(root, "out/node/engines/provider/mock.js"));
const {
  DEFAULT_THRESHOLDS,
  CoolingError,
  validateThresholds,
  evaluateThermal,
  describeCooling,
  createCoolingQueue,
} = require(built("cooling.js"));

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-cooling-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

const at = new Date().toISOString();
function tempSamples(celsius) {
  return [
    {
      adapterId: "test",
      checkedAt: at,
      metrics:
        celsius === null
          ? { temperatureC: { status: "unknown", detail: "killed", checkedAt: at } }
          : { temperatureC: { status: "detected", value: celsius, checkedAt: at } },
    },
  ];
}

describe("S2.17 cooling down state", () => {
  it("threshold evaluation trips only on measured temperature", () => {
    expect(evaluateThermal(tempSamples(50), DEFAULT_THRESHOLDS).level).toBe("ok");
    expect(evaluateThermal(tempSamples(80), DEFAULT_THRESHOLDS).level).toBe("cooling");
    expect(evaluateThermal(tempSamples(95), DEFAULT_THRESHOLDS).level).toBe("critical");
    expect(evaluateThermal(tempSamples(null), DEFAULT_THRESHOLDS).level).toBe("ok"); // unknown is never heat
    expect(evaluateThermal([], DEFAULT_THRESHOLDS).level).toBe("ok");
  });

  it("thresholds validate (soft below hard, sane ranges)", () => {
    expect(validateThresholds(DEFAULT_THRESHOLDS)).toEqual(DEFAULT_THRESHOLDS);
    expect(() => validateThresholds({ softC: 90, hardC: 80, coolingIntervalMs: 0 })).toThrow(CoolingError);
    expect(() => validateThresholds({ softC: 20, hardC: 90, coolingIntervalMs: 0 })).toThrow(CoolingError);
    expect(() => validateThresholds({ softC: 80, hardC: 90, coolingIntervalMs: -1 })).toThrow(CoolingError);
  });

  it("while hot, new generation dispatch blocks and queued tasks wait", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const base = createTaskQueue(store, { text: (req) => mock.execute(req) });
    let hot = true;
    const queue = createCoolingQueue(base, store, {}, async () => tempSamples(hot ? 85 : 50), DEFAULT_THRESHOLDS);
    const { taskId } = await queue.enqueue("text");
    expect(await queue.runNext()).toBeNull();
    expect(await queue.runUntilIdle()).toEqual([]);
    expect((await store.getTask(taskId)).state).toBe("queued"); // waiting, not failed
    expect(mock.getCalls().execute).toBe(0);
    expect(await queue.isCoolingDown()).toBe(true);
    hot = false;
    expect(await queue.isCoolingDown()).toBe(false);
    expect(await queue.runNext()).toEqual({ taskId, state: "complete" });
  });

  it("a generating task cooperatively cools then resumes to complete", async () => {
    const mock = createMockAdapter({ behavior: "slow", delayMs: 80 });
    const interrupts = [];
    const queue = createCoolingQueue(
      createTaskQueue(store, { text: (req) => mock.execute(req) }),
      store,
      { text: (id) => { interrupts.push(id); mock.interrupt(id); } },
      async () => tempSamples(88),
      DEFAULT_THRESHOLDS
    );
    const { taskId } = await queue.enqueue("text");
    // Put the task mid-flight the way the queue would.
    await store.setState(taskId, "preparing");
    await store.setState(taskId, "generating");
    const { cooling, cooledTaskIds } = await queue.enforce();
    expect(cooling).toBe(true);
    expect(cooledTaskIds).toContain(taskId);
    expect(interrupts).toContain(taskId);
    expect((await store.getTask(taskId)).state).toBe("cooling-down");
    // Cool again: resume through the guarded path.
    const coolQueue = createCoolingQueue(
      createTaskQueue(store, { text: (req) => mock.execute(req) }),
      store,
      {},
      async () => tempSamples(50),
      DEFAULT_THRESHOLDS
    );
    expect(await coolQueue.resumeCooled()).toBe(1);
    expect((await store.getTask(taskId)).state).toBe("queued");
    expect(await coolQueue.runUntilIdle()).toEqual([{ taskId, state: "complete" }]);
  });

  it("describeCooling explains why, interval, monitoring, availability, next attempt", async () => {
    const hot = evaluateThermal(tempSamples(92), DEFAULT_THRESHOLDS);
    const descriptor = describeCooling(hot, tempSamples(92), new Date().toISOString());
    expect(descriptor.cooling).toBe(true);
    expect(descriptor.reason).toContain("92");
    expect(descriptor.intervalRunning).toBe(true);
    expect(descriptor.thresholdMonitored).toBe(true);
    expect(descriptor.telemetryAvailable).toBe(true);
    expect(descriptor.nextAttemptAt).not.toBeNull();
    const dead = describeCooling(evaluateThermal(tempSamples(null), DEFAULT_THRESHOLDS), tempSamples(null), null);
    expect(dead.cooling).toBe(false);
    expect(dead.telemetryAvailable).toBe(false);
    expect(dead.nextAttemptAt).toBeNull();
  });

  it("notifications fire on into/out-of-cooling edges only", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const base = createTaskQueue(store, { text: (req) => mock.execute(req) });
    let hot = false;
    const events = [];
    const queue = createCoolingQueue(base, store, {}, async () => tempSamples(hot ? 85 : 50), DEFAULT_THRESHOLDS, {
      onCoolingChange: (cooling) => events.push(cooling),
    });
    await queue.enqueue("text");
    await queue.runUntilIdle(); // ok edge
    hot = true;
    await queue.runUntilIdle(); // into cooling
    await queue.runUntilIdle(); // still cooling (no repeat)
    hot = false;
    await queue.runUntilIdle(); // out of cooling
    expect(events).toEqual([false, true, false]);
  });

  it("no temperature, fan, or power control is claimed", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/cooling.ts"), "utf8");
    const code = source
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(code).not.toContain("fancontrol");
    expect(code).not.toContain("nvidia-smi --");
    expect(source).toContain("never claims to control temperature");
  });
});
