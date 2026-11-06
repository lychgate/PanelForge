// S2.18 Small GPU Mode tests.
//
// Proves the spec acceptance (§10.3): a small-GPU profile runs the
// queue within its memory budget; approved art is never silently
// replaced.
//
// - Envelope: one task at a time, sequential model loading, 1024 cap,
//   release hook after each execution.
// - Oversized work parks (memory budget enforced).
// - OOM failure → downsized cpu-fallback retry that completes;
//   original stays failed (history preserved).
// - Approved images are never downgraded (fail-closed).
// - Minimum-size tasks refuse further retries.
//
// Imported from the built `out/node/engines/tasks/smallgpu.js` with a
// fresh temp DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("smallgpu.js"))) {
  throw new Error("Missing out/node/engines/tasks/smallgpu.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { createTaskQueue } = require(built("queue.js"));
const { createMockAdapter } = require(path.join(root, "out/node/engines/provider/mock.js"));
const {
  SMALL_GPU_TARGET,
  RESOURCE_MODE_CPU_FALLBACK,
  resolveSmallGpuProfile,
  createSmallGpuQueue,
  isOomMessage,
  retryOomWithLowerResources,
} = require(built("smallgpu.js"));

let tmpBase;
let db;
let store;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-smallgpu-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

describe("S2.18 small GPU mode", () => {
  it("envelope is one-at-a-time, sequential, 1024-capped, with release", () => {
    const profile = resolveSmallGpuProfile();
    expect(profile.queueConcurrency).toBe(1);
    expect(profile.sequentialModelLoading).toBe(true);
    expect(profile.maxGenerationSize).toEqual({ width: 1024, height: 1024 });
    expect(profile.memoryBehavior).toBe("conservative");
    expect(profile.releaseAfterEachTask).toBe(true);
    expect(SMALL_GPU_TARGET).toContain("GTX 1660 Ti");
    expect(SMALL_GPU_TARGET).toContain("not a guarantee");
  });

  it("queue runs within its memory budget; oversized parks; release fires per task", async () => {
    const mock = createMockAdapter({ behavior: "success" });
    const base = createTaskQueue(store, { text: (req) => mock.execute(req) });
    let releases = 0;
    const queue = createSmallGpuQueue(base, store, () => releases++);
    const big = await queue.enqueue("text", { width: 4096, height: 256 });
    const small = await queue.enqueue("text", { width: 512, height: 512 });
    const results = await queue.runUntilIdle();
    const byId = Object.fromEntries(results.map((r) => [r.taskId, r.state]));
    expect(byId[big.taskId]).toBe("waiting-for-resources");
    expect(byId[small.taskId]).toBe("complete");
    expect(releases).toBe(1); // one dispatch happened
    // Pairwise model loading stays sequential (single batch dispatch).
    expect(queue.profile.sequentialModelLoading).toBe(true);
  });

  it("OOM failure retries downsized in cpu-fallback mode; original stays failed", async () => {
    const failing = createMockAdapter({ behavior: "failure" });
    const base = createTaskQueue(store, { text: (req) => failing.execute(req) });
    const small = createSmallGpuQueue(base, store);
    const original = await small.enqueue("text", { width: 1024, height: 1024, prompt: "keep me" });
    expect(await small.runNext()).toEqual({ taskId: original.taskId, state: "failed" });
    // Replace the failing executor with a success one for the retry.
    const okMock = createMockAdapter({ behavior: "success" });
    const retryQueue = createTaskQueue(store, { text: (req) => okMock.execute(req) });
    const outcome = await retryOomWithLowerResources(store, retryQueue, original.taskId);
    expect(outcome.retried).toBe(true);
    expect(outcome.width).toBe(512);
    expect(outcome.height).toBe(512);
    expect((await store.getTask(outcome.taskId)).state).toBe("complete");
    const retryRecord = await store.getTask(outcome.taskId);
    expect(retryRecord.params).toMatchObject({
      width: 512,
      height: 512,
      prompt: "keep me",
      resourceMode: RESOURCE_MODE_CPU_FALLBACK,
      retriedFrom: original.taskId,
    });
    expect((await store.getTask(original.taskId)).state).toBe("failed"); // history preserved
  });

  it("approved images are never silently replaced", async () => {
    const base = createTaskQueue(store, { text: async () => ({ ok: false, code: "FAILED", message: "out of memory" }) });
    const queue = createSmallGpuQueue(base, store);
    const { taskId } = await queue.enqueue("text", { width: 1024, approvedImageId: "img-123" });
    await queue.runNext();
    const outcome = await retryOomWithLowerResources(store, queue, taskId);
    expect(outcome.retried).toBe(false);
    expect(outcome.reason).toBe("approved-image-never-replaced");
    expect((await store.getTask(taskId)).state).toBe("failed");
    expect((await store.listTasks())).toHaveLength(1); // no extra record created
  });

  it("minimum-size and no-size tasks refuse OOM retries", async () => {
    const base = createTaskQueue(store, { text: async () => ({ ok: false, code: "FAILED", message: "out of memory" }) });
    const tiny = await base.enqueue("text", { width: 256, height: 256 });
    await base.runNext();
    expect((await retryOomWithLowerResources(store, base, tiny.taskId)).reason).toBe("already-minimum");
    const unsized = await base.enqueue("text", { prompt: "x" });
    await base.runNext();
    expect((await retryOomWithLowerResources(store, base, unsized.taskId)).reason).toBe("no-sized-params");
  });

  it("isOomMessage matches CUDA/OOM wording, not ordinary failures", () => {
    expect(isOomMessage("CUDA out of memory. Tried to allocate 2.00 GiB")).toBe(true);
    expect(isOomMessage("OOM")).toBe(true);
    expect(isOomMessage("nope")).toBe(false);
  });
});
