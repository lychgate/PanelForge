// S2.4 Task State Transitions tests.
//
// Proves the spec acceptance:
// - Only legal transitions succeed (full happy path through the states)
// - Illegal transitions are rejected with typed errors
//   (INVALID_TRANSITION for illegal edges, NOT_FOUND for unknown tasks)
// - canTransition() answers the same graph (single source of truth)
//
// Imported from the built `out/node/engines/tasks/*.js` with a fresh temp
// DB per test, so tests run in plain Node without a display.
const { describe, it, expect, beforeEach } = await import("vitest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const built = (rel) => path.join(root, "out/node/engines/tasks", rel);
if (!fs.existsSync(built("transitions.js"))) {
  throw new Error("Missing out/node/engines/tasks/transitions.js — run 'npm run build' first");
}
const databasePath = path.join(root, "out/node/database/service.js");
const storePath = built("store.js");
for (const p of [databasePath, storePath]) {
  if (!fs.existsSync(p)) throw new Error(`Missing ${p} — run 'npm run build' first`);
}

const { createDatabaseService } = require(databasePath);
const { createTaskStore } = require(storePath);
const { canTransition, allowedNextStates, transitionTask } = require(built("transitions.js"));

let store;
let taskId;

describe("S2.4 task state transitions", () => {
  beforeEach(async () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "panelforge-transitions-"));
    store = createTaskStore(createDatabaseService(tmpBase));
    ({ taskId } = await store.createTask({ taskType: "text" }));
  });

  it("walks the whole happy path queued → preparing → … → complete", async () => {
    const pathStates = [
      "preparing",
      "loading-model",
      "generating",
      "post-processing",
      "saving",
      "complete",
    ];
    for (const next of pathStates) {
      const updated = await transitionTask(store, taskId, next);
      expect(updated.state).toBe(next);
    }
    expect((await store.getTask(taskId)).state).toBe("complete");
  });

  it("rejects illegal transitions with a typed error", async () => {
    await expect(transitionTask(store, taskId, "complete")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    // Failed (terminal) cannot go back; state untouched.
    await transitionTask(store, taskId, "preparing");
    await transitionTask(store, taskId, "generating");
    await transitionTask(store, taskId, "failed");
    await expect(transitionTask(store, taskId, "generating")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect((await store.getTask(taskId)).state).toBe("failed");
  });

  it("retry edge failed → queued is legal; cancelled is terminal", async () => {
    await transitionTask(store, taskId, "preparing");
    await transitionTask(store, taskId, "failed");
    await transitionTask(store, taskId, "queued");
    expect((await store.getTask(taskId)).state).toBe("queued");
    await transitionTask(store, taskId, "cancelled");
    await expect(transitionTask(store, taskId, "queued")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("crash-resume edges allow running states back to queued", () => {
    expect(canTransition("generating", "queued")).toBe(true);
    expect(canTransition("saving", "queued")).toBe(true);
    expect(canTransition("cooling-down", "queued")).toBe(true);
    expect(canTransition("cooling-down", "paused")).toBe(false); // distinct pause (S2.5)
  });

  it("unknown target states and unknown tasks carry typed codes", async () => {
    await expect(transitionTask(store, taskId, "flying")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    await expect(transitionTask(store, "missing-id", "failed")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("canTransition exposes the graph without a database", () => {
    const next = allowedNextStates("queued");
    expect(next).toContain("preparing");
    expect(canTransition("queued", "complete")).toBe(false);
    expect(canTransition("paused", "queued")).toBe(true);
  });

  it("source contains no hardcoded machine-specific absolute path", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/tasks/transitions.ts"), "utf8");
    const code = source
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(code).not.toContain("/home/wetlander");
    expect(code).not.toContain("/Users/");
  });
});
