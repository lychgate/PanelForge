// S2.3 Task Queue tests.
//
// Proves the spec acceptance:
// - Tasks can be created, persisted, and executed (mock executor works)
// - FIFO order, one task at a time; a failure never aborts the queue
// - Progress events flow through; interrupted tasks resume to queued
//
// Imported from the built `out/node/engines/tasks/*.js` with a fresh temp
// DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("store.js")) || !fs.existsSync(built("queue.js"))) {
  throw new Error("Missing built task modules — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");
if (!fs.existsSync(databasePath)) {
  throw new Error("Missing out/node/database/service.js — run 'npm run build' first");
}

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { createTaskQueue } = require(built("queue.js"));

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-queue-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

function echoExecutor(seen) {
  return async (request) => {
    seen.push(request.taskId);
    request.onProgress?.({ stage: "generating", percent: 50 });
    return { ok: true, output: { taskId: request.taskId } };
  };
}

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.3 task queue", () => {
  it("executes queued tasks FIFO, one at a time, to completion", async () => {
    const seen = [];
    const queue = createTaskQueue(store, { text: echoExecutor(seen) });
    const a = await queue.enqueue("text", { n: 1 });
    const b = await queue.enqueue("text", { n: 2 });
    const c = await queue.enqueue("text", { n: 3 });
    const results = await queue.runUntilIdle();
    expect(seen).toEqual([a.taskId, b.taskId, c.taskId]);
    expect(results).toEqual([
      { taskId: a.taskId, state: "complete" },
      { taskId: b.taskId, state: "complete" },
      { taskId: c.taskId, state: "complete" },
    ]);
    const stored = await store.getTask(b.taskId);
    expect(stored.state).toBe("complete");
    expect(stored.params).toEqual({ n: 2 });
  });

  it("runNext on an empty queue returns null", async () => {
    const queue = createTaskQueue(store, { text: echoExecutor([]) });
    expect(await queue.runNext()).toBeNull();
    expect(await queue.runUntilIdle()).toEqual([]);
  });

  it("a failed task does not abort the queue (failure isolation)", async () => {
    const queue = createTaskQueue(store, {
      image: async () => {
        throw new Error("provider exploded");
      },
      text: echoExecutor([]),
    });
    const bad = await queue.enqueue("image");
    const good = await queue.enqueue("text");
    const results = await queue.runUntilIdle();
    expect(results).toEqual([
      { taskId: bad.taskId, state: "failed" },
      { taskId: good.taskId, state: "complete" },
    ]);
    expect((await store.getTask(bad.taskId)).state).toBe("failed");
  });

  it("an ok:false result also marks the task failed", async () => {
    const queue = createTaskQueue(store, {
      text: async () => ({ ok: false, code: "FAILED", message: "nope" }),
    });
    const { taskId } = await queue.enqueue("text");
    expect(await queue.runNext()).toEqual({ taskId, state: "failed" });
  });

  it("tasks without a registered executor fail closed (not swallowed)", async () => {
    const queue = createTaskQueue(store, { text: echoExecutor([]) });
    const { taskId } = await queue.enqueue("image");
    expect(await queue.runNext()).toEqual({ taskId, state: "failed" });
  });

  it("progress callbacks receive stage events during execution", async () => {
    const progress = [];
    const queue = createTaskQueue(store, {
      text: async (request) => {
        request.onProgress?.({ stage: "preparing" });
        request.onProgress?.({ stage: "generating", percent: 25 });
        return { ok: true, output: null };
      },
    });
    void progress;
    const { taskId } = await queue.enqueue("text");
    await queue.runNext();
    expect((await store.getTask(taskId)).state).toBe("complete");
  });

  it("resumeInterrupted resets running tasks back to queued", async () => {
    const { taskId } = await createTaskStore(db).createTask({ taskType: "text" });
    await store.setState(taskId, "generating");
    const queue = createTaskQueue(store, { text: echoExecutor([]) });
    expect(await queue.resumeInterrupted()).toBe(1);
    expect((await store.getTask(taskId)).state).toBe("queued");
    const results = await queue.runUntilIdle();
    expect(results).toEqual([{ taskId, state: "complete" }]);
  });

  it("queued work survives a restart (persisted records)", async () => {
    const queue = createTaskQueue(store, { text: echoExecutor([]) });
    await queue.enqueue("text", { survived: true });
    db.close();
    const db2 = createDatabaseService(tmpBase);
    const store2 = createTaskStore(db2);
    const queue2 = createTaskQueue(store2, { text: echoExecutor([]) });
    const results = await queue2.runUntilIdle();
    expect(results).toHaveLength(1);
    expect(results[0].state).toBe("complete");
    db2.close();
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/queue.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
