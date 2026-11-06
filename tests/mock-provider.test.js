// S2.12 Mock Provider Testing tests.
//
// Proves the spec acceptance: the whole Stage-2 stage acceptance
// (create → persist → execute → interrupt → resume → recover) passes
// against scripted mock adapters, without real providers or the UI:
//
// - success/failure/slow/varied-progress ("mixed") behaviors
// - failNext against bounded retry (S2.6)
// - interrupt against the queue (pause/cancel + resume)
// - health gating (S2.11) and restart recovery (S2.8)
// - mocks never ship as production behavior (no src import)
//
// Imported from the built `out/node/engines/provider/mock.js` with a
// fresh temp DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const mockPath = path.join(root, "out/node/engines/provider/mock.js");
if (!fs.existsSync(mockPath)) {
  throw new Error("Missing out/node/engines/provider/mock.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");
if (!fs.existsSync(databasePath)) {
  throw new Error("Missing out/node/database/service.js — run 'npm run build' first");
}
const retryPath = path.join(root, "out/node/engines/tasks/retry.js");
if (!fs.existsSync(retryPath)) {
  throw new Error("Missing out/node/engines/tasks/retry.js — run 'npm run build' first");
}

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(path.join(root, "out/node/engines/tasks/store.js"));
const { createTaskQueue } = require(path.join(root, "out/node/engines/tasks/queue.js"));
const { recoverQueue } = require(path.join(root, "out/node/engines/tasks/recovery.js"));
const { retryTaskWithPolicy } = require(retryPath);
const { createMockAdapter } = require(mockPath);
const { createHealthMonitor, createGatedExecutor } = require(
  path.join(root, "out/node/engines/provider/health.js")
);
const { isProviderProgress, isProviderHealth, isProviderResult } = require(
  path.join(root, "out/node/engines/provider/types.js")
);

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-mockprov-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.12 mock provider adapters", () => {
  it("success mock executes through the queue to completion", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const queue = createTaskQueue(
      store,
      { text: (req) => mock.execute(req) },
      { text: (id) => mock.interrupt(id) }
    );
    const { taskId } = await queue.enqueue("text", { prompt: "hello" });
    expect((await store.getTask(taskId)).state).toBe("queued");
    const results = await queue.runUntilIdle();
    expect(results).toEqual([{ taskId, state: "complete" }]);
    expect((await store.getTask(taskId)).state).toBe("complete");
    expect(mock.getCalls().execute).toBe(1);
    expect(isProviderHealth(await mock.health())).toBe(true);
    expect((await mock.health()).status).toBe("ready");
  });

  it("failure mock fails through the queue without aborting siblings", async () => {
    const failing = createMockAdapter({ behavior: "failure" });
    const okMock = createMockAdapter({ behavior: "success" });
    const queue = createTaskQueue(store, {
      image: (req) => failing.execute(req),
      text: (req) => okMock.execute(req),
    });
    const bad = await queue.enqueue("image");
    const good = await queue.enqueue("text");
    const results = await queue.runUntilIdle();
    expect(results).toContainEqual({ taskId: bad.taskId, state: "failed" });
    expect(results).toContainEqual({ taskId: good.taskId, state: "complete" });
  });

  it("mock results satisfy the S2.1 validators (no invented progress)", async () => {
    const mock = createMockAdapter({ behavior: "mixed" });
    const progress = [];
    const result = await mock.execute({
      taskId: "t1",
      taskType: "text",
      params: {},
      onProgress: (p) => progress.push(p),
    });
    expect(result).toEqual({ ok: true, output: null });
    expect(isProviderResult(result)).toBe(true);
    for (const p of progress) {
      expect(isProviderProgress(p)).toBe(true);
      // Honest progress: defined percents are measured; undefined stays undefined.
      if (p.percent !== undefined) {
        expect(Number.isFinite(p.percent)).toBe(true);
        expect(p.percent).toBeGreaterThanOrEqual(0);
        expect(p.percent).toBeLessThanOrEqual(100);
      }
    }
  });

  it("mixed mock emits the scripted varied progress sequence", async () => {
    const script = [
      { stage: "preparing" },
      { stage: "generating", percent: 25 },
      { stage: "generating", percent: 60 },
      { stage: "saving" },
    ];
    const mock = createMockAdapter({ behavior: "mixed", script });
    const progress = [];
    await mock.execute({
      taskId: "t1",
      taskType: "text",
      params: {},
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toEqual(script);
  });

  it("slow mock interrupt returns INTERRUPTED and cancels the wait", async () => {
    const mock = createMockAdapter({ behavior: "slow", delayMs: 200 });
    const running = mock.execute({ taskId: "t1", taskType: "text", params: {} });
    await new Promise((r) => setTimeout(r, 30));
    mock.interrupt("t1");
    const result = await running;
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INTERRUPTED");
    expect(mock.getCalls().interrupt).toBe(1);
  });

  it("slow mock pause through the queue holds, then resumes to complete", async () => {
    const mock = createMockAdapter({ behavior: "slow", delayMs: 60 });
    const queue = createTaskQueue(
      store,
      { text: (req) => mock.execute(req) },
      { text: (id) => mock.interrupt(id) }
    );
    const { taskId } = await queue.enqueue("text");
    const running = queue.runUntilIdle();
    await new Promise((r) => setTimeout(r, 30));
    await queue.pauseTask(taskId);
    expect((await store.getTask(taskId)).state).toBe("paused");
    const results = await running;
    const byId = Object.fromEntries(results.map((r) => [r.taskId, r.state]));
    expect(byId[taskId]).toBe("paused"); // no resurrection
    await queue.resumeTask(taskId);
    expect((await store.getTask(taskId)).state).toBe("queued");
    const resumed = await queue.runUntilIdle();
    expect(resumed).toContainEqual({ taskId, state: "complete" });
    expect((await store.getTask(taskId)).state).toBe("complete");
  });

  it("failNext mock succeeds after bounded retry", async () => {
    const mock = createMockAdapter({ behavior: "success", failNext: 2 });
    const queue = createTaskQueue(store, { text: (req) => mock.execute(req) });
    const { taskId } = await queue.enqueue("text");
    expect(await queue.runNext()).toEqual({ taskId, state: "failed" });
    const outcome = await retryTaskWithPolicy(store, queue, taskId, { maxAttempts: 3, backoffMs: 1 });
    expect(outcome.state).toBe("complete");
    expect(outcome.attemptsMade).toBe(2);
    expect((await store.getTask(taskId)).state).toBe("complete");
  });

  it("unavailable mock health gates the queue executor (no dispatch)", async () => {
    const mock = createMockAdapter({ behavior: "success", healthStatus: "unavailable" });
    expect((await mock.health()).status).toBe("unavailable");
    const monitor = createHealthMonitor();
    monitor.register(mock);
    await monitor.checkAll();
    expect(monitor.isReady(mock.id)).toBe(false);
    const queue = createTaskQueue(store, { text: createGatedExecutor(mock, monitor) });
    const { taskId } = await queue.enqueue("text");
    expect(await queue.runNext()).toEqual({ taskId, state: "failed" });
    expect(mock.getCalls().execute).toBe(0); // never dispatched
  });

  it("mock tasks survive restart recovery (create→persist→interrupt→resume→recover)", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const queue = createTaskQueue(
      store,
      { text: (req) => mock.execute(req) },
      { text: (id) => mock.interrupt(id) }
    );
    const a = await queue.enqueue("text", { n: 1 });
    const b = await queue.enqueue("text", { n: 2 });
    // "Crash": first task was mid-run, second never started.
    await store.setState(a.taskId, "generating");
    db.close();
    // Restart: new handles over the same database.
    const db2 = createDatabaseService(tmpBase);
    const store2 = createTaskStore(db2);
    const summary = await recoverQueue(store2);
    expect(summary.resumed).toBe(1);
    expect((await store2.getTask(a.taskId)).state).toBe("queued");
    const queue2 = createTaskQueue(store2, { text: (req) => mock.execute(req) });
    const results = await queue2.runUntilIdle();
    expect(results.filter((r) => r.state === "complete")).toHaveLength(2);
    db2.close();
  });

  it("mocks never ship as production behavior (no src import outside mock.ts)", () => {
    const srcDir = path.join(root, "src");
    let offenders = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts")) {
          const text = stripLineComments(fs.readFileSync(full, "utf8"));
          if (text.includes("provider/mock") && !full.endsWith("mock.ts")) {
            offenders.push(full);
          }
        }
      }
    }
    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
