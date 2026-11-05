// S2.1 Provider Interface Definitions tests.
//
// Proves the spec acceptance:
// - An adapter can implement the contract without renderer/UI dependencies
//   (a fake adapter written against the types alone works)
// - Progress honesty: invented/invalid percentages are rejected
// - Health taxonomy (ready/unavailable/unknown) and result taxonomy
//
// Imported from the built `out/node/engines/provider/types.js`. The module
// is types + validators only — executing adapters land in S2.9+ and the
// queue in S2.3.
const { describe, it, expect } = await import("vitest");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const typesPath = path.join(root, "out/node/engines/provider/types.js");
if (!fs.existsSync(typesPath)) {
  throw new Error("Missing out/node/engines/provider/types.js — run 'npm run build' first");
}

const {
  ProviderAdapterError,
  isProviderProgress,
  isProviderHealth,
  isProviderResult,
  listTaskTypes,
} = require(typesPath);

function stripLineComments(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("S2.1 provider interface definitions", () => {
  it("a fake adapter implements the contract without renderer/UI imports", () => {
    const fakeAdapter = {
      id: "mock",
      displayName: "Mock Fake",
      execute: async (request) => {
        if (isProviderProgress({ stage: "generating", percent: 50 })) {
          request.onProgress?.({ stage: "generating", percent: 50 });
        }
        return { ok: true, output: { echo: request.taskId } };
      },
      interrupt: (_taskId) => {},
      health: async () => ({ status: "ready", detail: "", checkedAt: new Date().toISOString() }),
    };
    expect(typeof fakeAdapter.execute).toBe("function");
    expect(typeof fakeAdapter.interrupt).toBe("function");
    expect(typeof fakeAdapter.health).toBe("function");
    expect(listTaskTypes()).toEqual(["text", "image"]);
  });

  it("isProviderProgress accepts valid progress and rejects invented values", () => {
    expect(isProviderProgress({ stage: "generating" })).toBe(true); // indeterminate is honest
    expect(isProviderProgress({ stage: "generating", percent: 42.5 })).toBe(true);
    expect(isProviderProgress({ stage: "generating", percent: Number.NaN })).toBe(false); // never invented
    expect(isProviderProgress({ stage: "generating", percent: 101 })).toBe(false);
    expect(isProviderProgress({ stage: "generating", percent: -1 })).toBe(false);
    expect(isProviderProgress({ stage: "flying" })).toBe(false);
    expect(isProviderProgress(null)).toBe(false);
  });

  it("isProviderHealth covers ready/unavailable/unknown only", () => {
    const at = new Date().toISOString();
    expect(isProviderHealth({ status: "ready", checkedAt: at })).toBe(true);
    expect(isProviderHealth({ status: "unavailable", checkedAt: at })).toBe(true);
    expect(isProviderHealth({ status: "unknown", checkedAt: at })).toBe(true);
    expect(isProviderHealth({ status: "degraded", checkedAt: at })).toBe(false);
    expect(isProviderHealth({ status: "ready" })).toBe(false);
  });

  it("isProviderResult validates both shapes", () => {
    expect(isProviderResult({ ok: true, output: 123 })).toBe(true);
    expect(isProviderResult({ ok: false, code: "FAILED", message: "boom" })).toBe(true);
    expect(isProviderResult({ ok: false, message: "boom" })).toBe(false);
    expect(isProviderResult({ output: 1 })).toBe(false);
  });

  it("ProviderAdapterError carries a taxonomy code", () => {
    const err = new ProviderAdapterError("INTERRUPTED", "stopped");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("INTERRUPTED");
    expect(err.message).toBe("stopped");
  });

  it("the contract module is free of renderer/UI/electron/network imports", () => {
    const source = fs.readFileSync(path.join(root, "src/engines/provider/types.ts"), "utf8");
    const code = stripLineComments(source);
    for (const token of ["electron", "ipcRenderer", "contextBridge", "document", "window", "fetch(", "http"]) {
      expect(code).not.toContain(token);
    }
  });

  it("task types are the Stage-2 base set", () => {
    expect(listTaskTypes()).toEqual(["text", "image"]);
  });
});
