// S2.9 LM Studio Connection Adapter tests.
//
// Proves the spec acceptance:
// - The adapter executes tasks against an LM Studio endpoint (mocked
//   locally with a real HTTP server; SSE streaming + progress callbacks)
// - Real or mock endpoints work; absence is handled gracefully
//   (UNAVAILABLE / health unavailable, never a throw across the boundary)
//
// Imported from the built `out/node/engines/provider/lmstudio.js`. The
// mock server is a Node built-in `http` server on an ephemeral port, so
// tests run in plain Node without a display and without hardcoding ports.
const { describe, it, expect } = await import("vitest");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const adapterPath = path.join(root, "out/node/engines/provider/lmstudio.js");
if (!fs.existsSync(adapterPath)) {
  throw new Error("Missing out/node/engines/provider/lmstudio.js — run 'npm run build' first");
}

const { createLmStudioAdapter } = require(adapterPath);

function mockServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe("S2.9 LM Studio adapter", () => {
  it("health is ready against a mock endpoint; execute streams and completes", async () => {
    const { server, url } = await mockServer((req, res) => {
      if (req.url === "/v1/models") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
        return;
      }
      if (req.url === "/v1/chat/completions") {
        res.setHeader("content-type", "text/event-stream");
        res.end(
          [
            'data: {"choices":[{"delta":{"content":"Hello"}}]}',
            'data: {"choices":[{"delta":{"content":" world"}}]}',
            "data: [DONE]",
          ].join("\n") + "\n"
        );
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    try {
      const adapter = createLmStudioAdapter({ baseUrl: url });
      const health = await adapter.health();
      expect(health.status).toBe("ready");
      const progress = [];
      const result = await adapter.execute({
        taskId: "t1",
        taskType: "text",
        params: { prompt: "hi" },
        onProgress: (p) => progress.push(p.stage),
      });
      expect(result.ok).toBe(true);
      expect((result.output).content).toBe("Hello world");
      expect(progress).toContain("generating");
    } finally {
      await stop(server);
    }
  });

  it("an unreachable endpoint reports UNAVAILABLE results (never throws)", async () => {
    const { server, url } = await mockServer((_req, res) => res.end("{}"));
    await stop(server); // close the port so connections are refused
    const adapter = createLmStudioAdapter({ baseUrl: url, timeoutMs: 2000 });
    const result = await adapter.execute({ taskId: "t2", taskType: "text", params: { prompt: "hi" } });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNAVAILABLE");
    const health = await adapter.health();
    expect(health.status).toBe("unavailable");
  });

  it("interrupt aborts a streaming execution", async () => {
    const { server, url } = await mockServer((req, res) => {
      if (req.url === "/v1/models") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: [{ id: "m" }] }));
        return;
      }
      // Never answer the completion stream (hangs until aborted).
      res.setHeader("content-type", "text/event-stream");
      const timer = setTimeout(() => res.end("data: [DONE]\n"), 10000);
      req.on("close", () => clearTimeout(timer));
    });
    try {
      const adapter = createLmStudioAdapter({ baseUrl: url, timeoutMs: 10000 });
      const executing = adapter.execute({ taskId: "t3", taskType: "text", params: { prompt: "hi" } });
      await new Promise((r) => setTimeout(r, 200));
      adapter.interrupt("t3");
      const result = await executing;
      expect(result.ok).toBe(false);
      expect(result.code).toBe("INTERRUPTED");
    } finally {
      await stop(server);
    }
  }, 30000);

  it("HTTP failures map to typed error codes", async () => {
    const { server, url } = await mockServer((req, res) => {
      if (req.url === "/v1/models") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: [{ id: "m" }] }));
        return;
      }
      res.statusCode = 500;
      res.end("{}");
    });
    try {
      const adapter = createLmStudioAdapter({ baseUrl: url });
      const result = await adapter.execute({ taskId: "t4", taskType: "text", params: { prompt: "hi" } });
      expect(result.ok).toBe(false);
      expect(["FAILED", "UNAVAILABLE"]).toContain(result.code);
    } finally {
      await stop(server);
    }
  });
});
