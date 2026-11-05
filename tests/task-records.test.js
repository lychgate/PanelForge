// S2.2 Persistent Task Records tests.
//
// Proves the spec acceptance:
// - A task (incl. its state, params, timestamps) persists across restarts
// - All 12 §11.1 machine states are supported
// - Invalid states are rejected with useful errors
//
// Imported from the built `out/node/engines/tasks/store.js` with a fresh
// temp DB per test (createDatabaseService over an isolated userData dir),
// so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("store.js"))) {
  throw new Error("Missing out/node/engines/tasks/store.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");
if (!fs.existsSync(databasePath)) {
  throw new Error("Missing out/node/database/service.js — run 'npm run build' first");
}

const { createDatabaseService } = require(databasePath);
const { createTaskStore, TASK_STATES } = require(built("store.js"));

let tmpBase;
let store;
let db;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-tasks-"));
  db = createDatabaseService(tmpBase);
  store = createTaskStore(db);
});

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.2 persistent task records", () => {
  it("creates a task with the queued state, params, and timestamps", async () => {
    const record = await store.createTask({
      taskType: "text",
      params: { prompt: "a hero", model: "small-v1" },
      projectId: "proj-1",
    });
    expect(typeof record.taskId).toBe("string");
    expect(record.state).toBe("queued");
    expect(record.params).toEqual({ prompt: "a hero", model: "small-v1" });
    expect(record.projectId).toBe("proj-1");
    expect(typeof record.createdAt).toBe("string");
    expect(typeof record.updatedAt).toBe("string");
    expect(await store.getTask(record.taskId)).toMatchObject({
      taskId: record.taskId,
      params: { prompt: "a hero", model: "small-v1" },
    });
  });

  it("persists across restarts (new store, same database)", async () => {
    const created = await store.createTask({ taskType: "image", params: { seed: 42 } });
    db.close();
    // Reopen with a fresh service/store on the same userData dir.
    const db2 = createDatabaseService(tmpBase);
    const store2 = createTaskStore(db2);
    const reopened = await store2.getTask(created.taskId);
    expect(reopened).toMatchObject({
      taskId: created.taskId,
      taskType: "image",
      state: "queued",
      params: { seed: 42 },
    });
    expect((await store2.listTasks())).toHaveLength(1);
    db2.close();
  });

  it("setState updates the state and persists it", async () => {
    const record = await store.createTask({ taskType: "text" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await store.setState(record.taskId, "generating");
    expect(updated.state).toBe("generating");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(record.updatedAt));
    expect((await store.getTask(record.taskId)).state).toBe("generating");
  });

  it("all 12 §11.1 states are settable", async () => {
    expect([...TASK_STATES]).toHaveLength(12);
    const record = await store.createTask({ taskType: "text" });
    for (const state of TASK_STATES) {
      const updated = await store.setState(record.taskId, state);
      expect(updated.state).toBe(state);
    }
  });

  it("rejects unknown states, unknown tasks, and empty task types", async () => {
    const record = await store.createTask({ taskType: "text" });
    await expect(store.setState(record.taskId, "flying")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(store.setState("missing", "failed")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(store.createTask({ taskType: "" })).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    expect(await store.getTask("missing")).toBeNull();
  });

  it("listTasks returns every record in creation order", async () => {
    await store.createTask({ taskType: "text", params: { n: 1 } });
    await store.createTask({ taskType: "image", params: { n: 2 } });
    const list = await store.listTasks();
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.taskType)).toEqual(["text", "image"]);
  });

  it("service source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/store.ts"), "utf8");
    const code = stripLineComments(source);
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
