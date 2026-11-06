// S2.13 Resource Profiles tests.
//
// Proves the spec acceptance (§10.2): selecting a profile constrains
// queue concurrency + memory behavior; Custom exposes configurable
// limits.
//
// - Presets: Safe one-at-a-time + small sizes + cooling; Balanced
//   sequential; Performance parallel up to a conservative cap.
// - Enforcement: supersized tasks park to waiting-for-resources instead
//   of dispatching; cooling pauses separate batches; enqueue stamps the
//   profile for the S2.7 progress view.
// - Custom: valid overrides apply; out-of-range limits reject with
//   ResourceError.
//
// Imported from the built `out/node/engines/tasks/resources.js` with a
// fresh temp DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("resources.js"))) {
  throw new Error("Missing out/node/engines/tasks/resources.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");
if (!fs.existsSync(databasePath)) {
  throw new Error("Missing out/node/database/service.js — run 'npm run build' first");
}

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { createTaskQueue } = require(built("queue.js"));
const { createMockAdapter } = require(path.join(root, "out/node/engines/provider/mock.js"));
const {
  RESOURCE_PROFILES,
  CUSTOM_LIMITS,
  ResourceError,
  isResourceProfileName,
  listResourceProfiles,
  resolveResourceProfile,
  isOversizedForProfile,
  createProfileQueue,
} = require(built("resources.js"));
const { describeTask } = require(built("progress.js"));

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-resources-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

// Executor that tracks concurrent execution overlap.
function trackingExecutor(mock, stats) {
  return async (request) => {
    stats.active++;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
    try {
      return await mock.execute(request);
    } finally {
      stats.active--;
    }
  };
}

describe("S2.13 resource profiles", () => {
  it("presets match spec §10.2 (safe sequential+small, balanced sequential, performance parallel)", () => {
    expect(listResourceProfiles()).toEqual(["safe", "balanced", "performance", "custom"]);
    const safe = RESOURCE_PROFILES.safe;
    expect(safe.queueConcurrency).toBe(1);
    expect(safe.memoryBehavior).toBe("conservative");
    expect(safe.coolingIntervalMs).toBeGreaterThan(0);
    expect(safe.sequentialModelLoading).toBe(true);
    const balanced = RESOURCE_PROFILES.balanced;
    expect(balanced.queueConcurrency).toBe(1); // sequential by default
    expect(balanced.memoryBehavior).toBe("reasonable");
    const perf = RESOURCE_PROFILES.performance;
    expect(perf.queueConcurrency).toBeGreaterThan(1);
    expect(perf.memoryBehavior).toBe("aggressive");
    expect(isResourceProfileName("safe")).toBe(true);
    expect(isResourceProfileName("nope")).toBe(false);
  });

  it("resolve rejects unknown profiles and out-of-range custom limits", () => {
    expect(() => resolveResourceProfile("nope")).toThrow(ResourceError);
    try {
      resolveResourceProfile("nope");
    } catch (err) {
      expect(err.code).toBe("UNKNOWN_PROFILE");
    }
    expect(() => resolveResourceProfile("custom", { queueConcurrency: 0 })).toThrow(ResourceError);
    expect(() =>
      resolveResourceProfile("custom", { queueConcurrency: CUSTOM_LIMITS.maxQueueConcurrency + 1 })
    ).toThrow(ResourceError);
    expect(() => resolveResourceProfile("custom", { maxGenerationSize: { width: 99999, height: 10 } })).toThrow(
      ResourceError
    );
    expect(() => resolveResourceProfile("custom", { coolingIntervalMs: -1 })).toThrow(ResourceError);
  });

  it("custom profiles expose configurable limits with balanced fallbacks", () => {
    const custom = resolveResourceProfile("custom", {
      queueConcurrency: 3,
      maxGenerationSize: { width: 1500, height: 1500 },
      coolingIntervalMs: 120,
    });
    expect(custom.name).toBe("custom");
    expect(custom.queueConcurrency).toBe(3);
    expect(custom.maxGenerationSize).toEqual({ width: 1500, height: 1500 });
    expect(custom.coolingIntervalMs).toBe(120);
    expect(custom.memoryBehavior).toBe("reasonable"); // balanced fallback
  });

  it("oversized detection checks width/height against the profile ceiling", () => {
    const safe = resolveResourceProfile("safe");
    expect(isOversizedForProfile({ width: 2048, height: 512 }, safe)).toBe(true);
    expect(isOversizedForProfile({ size: { width: 512, height: 2048 } }, safe)).toBe(true);
    expect(isOversizedForProfile({ width: 512, height: 512 }, safe)).toBe(false);
    expect(isOversizedForProfile({}, safe)).toBe(false);
  });

  it("performance runs batches in parallel; safe never overlaps", async () => {
    for (const [name, expectOverlap] of [["performance", true], ["safe", false]]) {
      const mock = createMockAdapter({ behavior: "slow", delayMs: 60 });
      const stats = { active: 0, maxActive: 0 };
      const base = createTaskQueue(store, { text: trackingExecutor(mock, stats) });
      const profile = resolveResourceProfile(name, { coolingIntervalMs: 0 }); // no S2.17 pauses here
      const queue = createProfileQueue(base, store, profile);
      await queue.enqueue("text");
      await queue.enqueue("text");
      await queue.enqueue("text");
      const results = await queue.runUntilIdle();
      expect(results.every((r) => r.state === "complete")).toBe(true);
      if (expectOverlap) expect(stats.maxActive).toBeGreaterThan(1);
      else expect(stats.maxActive).toBe(1);
    }
  }, 20000);

  it("oversized tasks park to waiting-for-resources instead of executing", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const base = createTaskQueue(store, { text: (req) => mock.execute(req) });
    const safe = createProfileQueue(base, store, resolveResourceProfile("safe"));
    const big = await safe.enqueue("text", { width: 4096, height: 256 });
    const small = await safe.enqueue("text", { width: 512, height: 512 });
    const results = await safe.runUntilIdle();
    const byId = Object.fromEntries(results.map((r) => [r.taskId, r.state]));
    expect(byId[big.taskId]).toBe("waiting-for-resources");
    expect(byId[small.taskId]).toBe("complete");
    expect((await store.getTask(big.taskId)).state).toBe("waiting-for-resources");
    expect(mock.getCalls().execute).toBe(1); // only the small task ran
  });

  it("cooling interval separates batches", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const base = createTaskQueue(store, { text: (req) => mock.execute(req) });
    const profile = resolveResourceProfile("custom", { queueConcurrency: 1, coolingIntervalMs: 80 });
    const queue = createProfileQueue(base, store, profile);
    const first = await queue.enqueue("text");
    const second = await queue.enqueue("text");
    const t0 = Date.now();
    const results = await queue.runUntilIdle();
    const elapsed = Date.now() - t0;
    expect(results.every((r) => r.state === "complete")).toBe(true);
    expect((await store.getTask(first.taskId)).state).toBe("complete");
    expect((await store.getTask(second.taskId)).state).toBe("complete");
    // Two single-task batches with an 80 ms cooling pause between them.
    expect(elapsed).toBeGreaterThanOrEqual(70);
  });

  it("enqueue stamps the profile onto tasks (progress view surfaces it)", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const base = createTaskQueue(store, { text: (req) => mock.execute(req) });
    const queue = createProfileQueue(base, store, resolveResourceProfile("safe"));
    const { taskId } = await queue.enqueue("text", { prompt: "x" });
    const view = await describeTask(store, taskId);
    expect(view.resourceProfile).toBe("safe");
  });

  it("no overclocking or fan-control behavior is wired in", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/resources.ts"), "utf8");
    const code = stripLineComments(source);
    for (const token of ["overclock(", "fancontrol", "nvidia-smi"]) {
      expect(code.toLowerCase()).not.toContain(token);
    }
  });
});
