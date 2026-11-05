// S2.7 Progress Reporting tests.
//
// Proves the spec acceptance:
// - Each task's §11.2 fields are readable from records
//   (name/type/queue position/stage/elapsed/model/backend/profile/status)
// - No fabricated percentages: estimated remaining is null unless the
//   caller supplied a meaningful estimate; generating without an estimate
//   is indeterminate
//
// Imported from the built `out/node/engines/tasks/*.js` with a fresh temp
// DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("progress.js"))) {
  throw new Error("Missing out/node/engines/tasks/progress.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(built("store.js"));
const { describeTask, describeAllTasks } = require(built("progress.js"));

let store;
beforeEach(() => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-progress-"));
  store = createTaskStore(createDatabaseService(tmpBase));
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.7 progress reporting", () => {
  it("reports the §11.2 fields for a queued task", async () => {
    const created = await store.createTask({
      taskType: "image",
      params: { name: "hero.png", model: "small-v1", backend: "comfyui", resourceProfile: "safe" },
    });
    const view = await describeTask(store, created.taskId);
    expect(view.taskId).toBe(created.taskId);
    expect(view.taskType).toBe("image");
    expect(view.name).toBe("hero.png");
    expect(view.queuePosition).toBe(1);
    expect(view.stage).toBe("queued");
    expect(view.status).toBe("queued");
    expect(typeof view.elapsedMs).toBe("number");
    expect(view.model).toBe("small-v1");
    expect(view.backend).toBe("comfyui");
    expect(view.resourceProfile).toBe("safe");
    expect(view.errorMessage).toBeNull();
  });

  it("defaults the display name and unknown metadata when params lack them", async () => {
    const created = await store.createTask({ taskType: "text" });
    const view = await describeTask(store, created.taskId);
    expect(view.name).toContain(created.taskId.slice(0, 8));
    expect(view.model).toBeNull();
    expect(view.backend).toBeNull();
    expect(view.resourceProfile).toBeNull();
  });

  it("never fabricates an estimate: null unless supplied, indeterminate while generating", async () => {
    const created = await store.createTask({ taskType: "text" });
    expect((await describeTask(store, created.taskId)).estimatedRemainingMs).toBeNull();
    await store.setState(created.taskId, "preparing");
    await store.setState(created.taskId, "generating");
    const generating = await describeTask(store, created.taskId);
    expect(generating.stage).toBe("generating");
    expect(generating.indeterminate).toBe(true);
    expect(generating.estimatedRemainingMs).toBeNull();
  });

  it("a supplied estimate is reported (never invented)", async () => {
    const created = await store.createTask({
      taskType: "image",
      params: { estimatedRemainingMs: 12000 },
    });
    const view = await describeTask(store, created.taskId);
    expect(view.estimatedRemainingMs).toBe(12000);
    expect(view.indeterminate).toBe(false);
  });

  it("queue positions follow creation order", async () => {
    const a = await store.createTask({ taskType: "text" });
    const b = await store.createTask({ taskType: "image" });
    const c = await store.createTask({ taskType: "text" });
    expect((await describeTask(store, a.taskId)).queuePosition).toBe(1);
    expect((await describeTask(store, b.taskId)).queuePosition).toBe(2);
    expect((await describeTask(store, c.taskId)).queuePosition).toBe(3);
  });

  it("run timing is recorded: started on first non-queued state, finished on terminal", async () => {
    const created = await store.createTask({ taskType: "text" });
    await store.setState(created.taskId, "preparing");
    const running = await store.getTask(created.taskId);
    expect(running.startedAt).not.toBeNull();
    expect(running.finishedAt).toBeNull();
    await store.setState(created.taskId, "complete");
    const done = await store.getTask(created.taskId);
    expect(done.finishedAt).not.toBeNull();
    const view = await describeTask(store, created.taskId);
    expect(view.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(view.stage).toBe("complete");
  });

  it("describeAllTasks lists every task with positions", async () => {
    await store.createTask({ taskType: "text", params: { name: "first" } });
    await store.createTask({ taskType: "image", params: { name: "second" } });
    const all = await describeAllTasks(store);
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name)).toEqual(["first", "second"]);
    expect(all.map((t) => t.queuePosition)).toEqual([1, 2]);
  });

  it("unknown tasks are NOT_FOUND", async () => {
    await expect(describeTask(store, "missing-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/progress.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
