// S0.9 Application Lifecycle tests.
//
// Proves the spec acceptance:
// - Reliable startup sequence (ordered steps; a failing step does not
//   block later steps or the window)
// - Reliable shutdown sequence (cleanup hooks in reverse order, each
//   failure-isolated; nothing left behind)
// - Basic lifecycle events (state machine + broadcast events)
//
// The service is imported from the built
// `out/node/core/lifecycle/service.js` with no display needed.
const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const servicePath = path.join(root, "out/node/core/lifecycle/service.js");
if (!fs.existsSync(servicePath)) {
  throw new Error("Missing out/node/core/lifecycle/service.js — run 'npm run build' first");
}

const { createLifecycleService } = require(servicePath);

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S0.9 lifecycle service", () => {
  it("runs startup steps in order", async () => {
    const svc = createLifecycleService();
    const order = [];
    const summary = await svc.start([
      { name: "one", run: () => order.push("one") },
      { name: "two", run: () => order.push("two") },
      { name: "three", run: () => order.push("three") },
    ]);
    expect(order).toEqual(["one", "two", "three"]);
    expect(summary).toEqual({ ok: true, completed: ["one", "two", "three"], failed: [] });
  });

  it("supports async steps", async () => {
    const svc = createLifecycleService();
    const order = [];
    await svc.start([
      {
        name: "async",
        run: async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push("async");
        },
      },
    ]);
    expect(order).toEqual(["async"]);
  });

  it("isolates a failing step: later steps still run and are reported", async () => {
    const svc = createLifecycleService();
    const order = [];
    const summary = await svc.start([
      { name: "good", run: () => order.push("good") },
      {
        name: "bad",
        run: () => {
          throw new Error("nope");
        },
      },
      { name: "last", run: () => order.push("last") },
    ]);
    expect(order).toEqual(["good", "last"]);
    expect(summary.ok).toBe(false);
    expect(summary.failed).toEqual(["bad"]);
    expect(svc.getState()).toBe("ready");
  });

  it("transitions state idle → starting → ready → shutting-down → closed", async () => {
    const svc = createLifecycleService();
    const states = [svc.getState()];
    await svc.start([{ name: "s", run: () => states.push(svc.getState()) }]);
    states.push(svc.getState());
    await svc.shutdown();
    states.push(svc.getState());
    expect(states).toEqual(["idle", "starting", "ready", "closed"]);
  });

  it("broadcasts lifecycle events", async () => {
    const events = [];
    const svc = createLifecycleService((e) => events.push(e));
    await svc.start([{ name: "only", run: () => {} }]);
    await svc.shutdown();
    const types = events.map((e) => e.type);
    expect(types).toContain("startup:step");
    expect(types).toContain("startup:complete");
    expect(types).toContain("shutdown:complete");
    const stepEvent = events.find((e) => e.type === "startup:step");
    expect(stepEvent.name).toBe("only");
  });

  it("runs cleanup hooks in reverse registration order", async () => {
    const svc = createLifecycleService();
    const order = [];
    svc.registerCleanup({ name: "a", run: () => order.push("a") });
    svc.registerCleanup({ name: "b", run: () => order.push("b") });
    svc.registerCleanup({ name: "c", run: () => order.push("c") });
    const summary = await svc.shutdown();
    expect(order).toEqual(["c", "b", "a"]);
    expect(summary.ok).toBe(true);
  });

  it("isolates failing cleanup hooks", async () => {
    const svc = createLifecycleService();
    const order = [];
    svc.registerCleanup({ name: "first", run: () => order.push("first") });
    svc.registerCleanup({
      name: "bad",
      run: () => {
        throw new Error("cleanup nope");
      },
    });
    svc.registerCleanup({ name: "last", run: () => order.push("last") });
    const summary = await svc.shutdown();
    expect(order).toEqual(["last", "first"]);
    expect(summary.ok).toBe(false);
    expect(summary.failed).toEqual(["bad"]);
    expect(svc.getState()).toBe("closed");
  });

  it("shutdown is idempotent (hooks run once)", async () => {
    const svc = createLifecycleService();
    let calls = 0;
    svc.registerCleanup({
      name: "count",
      run: () => {
        calls++;
      },
    });
    await svc.shutdown();
    await svc.shutdown();
    expect(calls).toBe(1);
    expect(svc.getState()).toBe("closed");
  });

  it("reports registered cleanup names", () => {
    const svc = createLifecycleService();
    svc.registerCleanup({ name: "database", run: () => {} });
    expect(svc.getCleanupNames()).toEqual(["database"]);
  });

  it("main runs startup through the lifecycle service and shuts down on quit", () => {
    const mainCode = stripLineComments(
      fs.readFileSync(path.join(root, "out/node/main/index.js"), "utf8")
    );
    expect(mainCode).toContain("defaultLifecycleService");
    expect(mainCode).toContain("registerCleanup");
    expect(mainCode).toContain("shutdown");
  });
});
