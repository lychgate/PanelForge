// S2.5 Pause and Cancellation tests.
//
// Proves the spec acceptance:
// - A running task can be paused and resumed (no resurrection of work)
// - A running task can be cancelled, stays cancelled, and a late
//   executor result never brings it back
// - Interruptors fire best-effort (missing interruptors are fine)
// - Queued tasks pause before starting; terminal states reject pause/cancel
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

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { createTaskQueue } = require(built("queue.js"));

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-pausecancel-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("S2.5 pause and cancellation", () => {
  it("a running task pauses, skips until resumed, then completes", async () => {
    const gate = deferred();
    const queue = createTaskQueue(store, {
      text: async (request) => {
        if (request.params.n === 1) {
          await gate.promise; // fake long task; interrupted by the test
          return { ok: true, output: { slow: true } };
        }
        return { ok: true, output: { fast: true } };
      },
    });
    const first = await queue.enqueue("text", { n: 1 });
    const second = await queue.enqueue("text", { n: 2 });
    const running = queue.runUntilIdle();
    await new Promise((r) => setTimeout(r, 50));
    await queue.pauseTask(first.taskId);
    expect((await store.getTask(first.taskId)).state).toBe("paused");
    gate.resolve();
    // While paused, the queue finishes only the second task's execution path?
    // (first task stays paused even though its late result lands)
    const results = await running;
    const byId = Object.fromEntries(results.map((r) => [r.taskId, r.state]));
    expect(byId[first.taskId]).toBe("paused"); // no resurrection
    expect(byId[second.taskId]).toBe("complete");
    // Resume works.
    await queue.resumeTask(first.taskId);
    expect((await store.getTask(first.taskId)).state).toBe("queued");
    const resumed = await queue.runUntilIdle();
    expect(resumed.some((r) => r.taskId === first.taskId && r.state === "complete")).toBe(true);
  });

  it("a running task cancels and a late success never resurrects it", async () => {
    const gate = deferred();
    const queue = createTaskQueue(store, {
      image: async () => {
        await gate.promise;
        return { ok: true, output: { late: true } };
      },
    });
    const { taskId } = await queue.enqueue("image");
    const running = queue.runUntilIdle();
    await new Promise((r) => setTimeout(r, 50));
    await queue.cancelTask(taskId);
    gate.resolve();
    await running.catch(() => undefined);
    const record = await store.getTask(taskId);
    expect(record.state).toBe("cancelled");
    // Cancelled never reruns.
    await expect(queue.resumeTask(taskId)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(await queue.runUntilIdle()).toHaveLength(0);
  });

  it("interruptors fire best-effort (absent interruptors are fine)", async () => {
    const gate = deferred();
    const calls = [];
    const queue = createTaskQueue(
      store,
      {
        text: async () => {
          await gate.promise;
          return { ok: true, output: null };
        },
      },
      { text: (taskId) => calls.push(taskId) }
    );
    const { taskId } = await queue.enqueue("text");
    const running = queue.runUntilIdle();
    await new Promise((r) => setTimeout(r, 50));
    await queue.pauseTask(taskId);
    expect(calls).toEqual([taskId]);
    gate.resolve();
    await running.catch(() => undefined);
    expect((await store.getTask(taskId)).state).toBe("paused");
  });

  it("a queued task pauses before starting and resume re-queues it", async () => {
    const queue = createTaskQueue(store, { text: async () => ({ ok: true, output: null }) });
    const { taskId } = await queue.enqueue("text");
    await queue.pauseTask(taskId);
    expect((await store.getTask(taskId)).state).toBe("paused");
    expect(await queue.runUntilIdle()).toHaveLength(0); // skipped while paused
    await queue.resumeTask(taskId);
    expect(await queue.runUntilIdle()).toEqual([{ taskId, state: "complete" }]);
  });

  it("pause/cancel of unknown tasks is NOT_FOUND; terminal states reject", async () => {
    const queue = createTaskQueue(store, { text: async () => ({ ok: true, output: null }) });
    await expect(queue.pauseTask("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(queue.cancelTask("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { taskId } = await queue.enqueue("text");
    await queue.runUntilIdle();
    expect((await store.getTask(taskId)).state).toBe("complete");
    await expect(queue.pauseTask(taskId)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(queue.cancelTask(taskId)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("cancel while queued works and the task never executes", async () => {
    let ran = false;
    const queue = createTaskQueue(store, {
      text: async () => {
        ran = true;
        return { ok: true, output: null };
      },
    });
    const { taskId } = await queue.enqueue("text");
    await queue.cancelTask(taskId);
    expect(await queue.runUntilIdle()).toHaveLength(0);
    expect(ran).toBe(false);
    expect((await store.getTask(taskId)).state).toBe("cancelled");
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/queue.ts"), "utf8");
    const code = source
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
