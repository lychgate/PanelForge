// S2.8 Queue Persistence and Recovery tests.
//
// Proves the spec acceptance:
// - After a restart the queue is intact (persisted tasks reloaded)
// - Interrupted tasks resume (running → queued) and execute exactly once
// - No lost or double-run work (idempotent recovery; terminal/paused kept)
//
// Imported from the built `out/node/engines/tasks/*.js` with a fresh temp
// DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("recovery.js"))) {
  throw new Error("Missing out/node/engines/tasks/recovery.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { createTaskQueue } = require(built("queue.js"));
const { recoverQueue } = require(built("recovery.js"));

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-recovery-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.8 queue persistence and recovery", () => {
  it("reloaded tasks after a restart resume and run exactly once", async () => {
    const runs = [];
    const queue = createTaskQueue(store, {
      text: async (request) => {
        runs.push(request.taskId);
        return { ok: true, output: null };
      },
    });
    const a = await queue.enqueue("text", { n: 1 });
    const b = await queue.enqueue("text", { n: 2 });
    // "Crash": first task was mid-run, second never started.
    await store.setState(a.taskId, "preparing");
    db.close();
    // Restart: new handles over the same database.
    const db2 = createDatabaseService(tmpBase);
    const store2 = createTaskStore(db2);
    const summary = await recoverQueue(store2);
    expect(summary.resumed).toBe(1);
    expect((await store2.getTask(a.taskId)).state).toBe("queued");
    const queue2 = createTaskQueue(store2, {
      text: async (request) => {
        runs.push(request.taskId);
        return { ok: true, output: null };
      },
    });
    const results = await queue2.runUntilIdle();
    expect(new Set(runs)).toEqual(new Set([a.taskId, b.taskId])); // no double runs
    expect(results.filter((r) => r.state === "complete")).toHaveLength(2);
    db2.close();
  });

  it("paused and terminal tasks are never touched by recovery", async () => {
    const done = await store.createTask({ taskType: "text" });
    await store.setState(done.taskId, "complete");
    const paused = await store.createTask({ taskType: "text" });
    await store.setState(paused.taskId, "paused");
    const summary = await recoverQueue(store);
    expect(summary).toMatchObject({ total: 2, resumed: 0, paused: 1, terminal: 1 });
    expect((await store.getTask(done.taskId)).state).toBe("complete");
    expect((await store.getTask(paused.taskId)).state).toBe("paused");
  });

  it("recovery is idempotent", async () => {
    const created = await store.createTask({ taskType: "text" });
    await store.setState(created.taskId, "generating");
    expect((await recoverQueue(store)).resumed).toBe(1);
    expect((await recoverQueue(store)).resumed).toBe(0);
    expect((await store.getTask(created.taskId)).state).toBe("queued");
  });

  it("every running state is recovered to queued", async () => {
    for (const state of ["preparing", "loading-model", "generating", "post-processing", "saving"]) {
      const created = await store.createTask({ taskType: "text" });
      await store.setState(created.taskId, state);
      await recoverQueue(store);
      expect((await store.getTask(created.taskId)).state).toBe("queued");
    }
    expect((await recoverQueue(store)).resumed).toBe(0);
  });

  it("summary counts are accurate", async () => {
    await store.createTask({ taskType: "text" }); // queued
    const running = await store.createTask({ taskType: "text" });
    await store.setState(running.taskId, "generating");
    const done = await store.createTask({ taskType: "text" });
    await store.setState(done.taskId, "complete");
    const summary = await recoverQueue(store);
    expect(summary).toEqual({ total: 3, resumed: 1, queued: 2, paused: 0, terminal: 1 });
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/recovery.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });

  it("main runs queue recovery in the startup sequence", () => {
    const mainCode = stripLineComments(
      fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8")
    );
    expect(mainCode).toContain("recoverQueue");
    expect(mainCode).toContain("queue recovered");
  });
});
