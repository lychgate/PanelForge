// S2.6 Retry Handling tests.
//
// Proves the spec acceptance:
// - A failed task can be retried without disturbing completed siblings
// - Retries are bounded (permanent failure stays failed; no storms)
// - Only failed tasks may be retried (typed errors otherwise)
//
// Imported from the built `out/node/engines/tasks/*.js` with a fresh temp
// DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("retry.js"))) {
  throw new Error("Missing out/node/engines/tasks/retry.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { createTaskQueue } = require(built("queue.js"));
const { retryTaskWithPolicy } = require(built("retry.js"));

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-retry-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.6 retry handling", () => {
  it("a flaky task succeeds within the attempt budget", async () => {
    let calls = 0;
    const queue = createTaskQueue(store, {
      text: async () => {
        calls++;
        return calls === 1
          ? { ok: false, code: "FAILED", message: "flaky" }
          : { ok: true, output: null };
      },
    });
    const { taskId } = await queue.enqueue("text");
    expect((await queue.runUntilIdle())[0].state).toBe("failed");
    const outcome = await retryTaskWithPolicy(store, queue, taskId, { maxAttempts: 3, backoffMs: 1 });
    expect(outcome).toMatchObject({ taskId, state: "complete", attemptsMade: 1 });
    expect(calls).toBe(2);
  });

  it("a permanently failing task stays failed after the bounded attempts", async () => {
    let calls = 0;
    const queue = createTaskQueue(store, {
      text: async () => {
        calls++;
        return { ok: false, code: "FAILED", message: "always" };
      },
    });
    const { taskId } = await queue.enqueue("text");
    await queue.runUntilIdle();
    const outcome = await retryTaskWithPolicy(store, queue, taskId, { maxAttempts: 3, backoffMs: 1 });
    expect(outcome.attemptsMade).toBe(3);
    expect(outcome.state).toBe("failed");
    expect(calls).toBe(1 + 3); // initial run + 3 attempts, then it stops
  });

  it("retry never disturbs completed siblings", async () => {
    const queue = createTaskQueue(store, {
      text: async (request) => ({ ok: true, output: { n: request.params.n } }),
    });
    const done = await queue.enqueue("text", { n: "done" });
    await queue.runUntilIdle();
    expect((await store.getTask(done.taskId)).state).toBe("complete");
    const flaky = await queue.enqueue("text", { n: "flaky" });
    const queue2 = createTaskQueue(store, {
      text: async (request) => ({
        ok: request.params.n === "flaky" ? false : true,
        ...(request.params.n === "flaky" ? { code: "FAILED", message: "x" } : {}),
      }),
    });
    await queue2.runUntilIdle(); // flaky fails; "done" already complete — untouched
    await retryTaskWithPolicy(store, queue2, flaky.taskId, { maxAttempts: 2, backoffMs: 1 });
    expect((await store.getTask(done.taskId)).state).toBe("complete");
  });

  it("only failed tasks can be retried (typed error otherwise)", async () => {
    const queue = createTaskQueue(store, { text: async () => ({ ok: true, output: null }) });
    const { taskId } = await queue.enqueue("text");
    await queue.runUntilIdle(); // complete now
    await expect(retryTaskWithPolicy(store, queue, taskId, { maxAttempts: 2, backoffMs: 1 })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    const queued = await queue.enqueue("text");
    await expect(retryTaskWithPolicy(store, queue, queued.taskId)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });

  it("unknown tasks are NOT_FOUND; bad policies are INVALID_POLICY", async () => {
    const queue = createTaskQueue(store, { text: async () => ({ ok: true, output: null }) });
    await expect(retryTaskWithPolicy(store, queue, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { taskId } = await queue.enqueue("text");
    await queue.runUntilIdle();
    // task is complete now, but policy validation happens first
    await expect(
      retryTaskWithPolicy(store, queue, taskId, { maxAttempts: 0, backoffMs: -1 })
    ).rejects.toMatchObject({ code: "INVALID_POLICY" });
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/retry.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
