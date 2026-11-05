// S2.10 ComfyUI Connection Adapter tests.
//
// Proves the spec acceptance:
// - The adapter executes image tasks against a ComfyUI endpoint
//   (prompt submission → history polling → image fetch)
// - Graceful absence: unreachable endpoints never throw across the boundary
//   (typed UNAVAILABLE results + health unavailable)
// - Interrupt aborts a running execution; workflow node errors fail typed
//
// Imported from the built `out/node/engines/provider/comfyui.js`. The mock
// server is a Node built-in `http` server on an ephemeral port, so tests
// run in plain Node without a display and without hardcoding ports.
const { describe, it, expect } = await import("vitest");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const adapterPath = path.join(root, "out/node/engines/provider/comfyui.js");
if (!fs.existsSync(adapterPath)) {
  throw new Error("Missing out/node/engines/provider/comfyui.js — run 'npm run build' first");
}

const { createComfyUiAdapter } = require(adapterPath);

function mockServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

const WORKFLOW = { nodes: {} };

function goodHandler() {
  return (req, res) => {
    if (req.url === "/system_stats") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ system: { os: "linux" } }));
      return;
    }
    if (req.url === "/prompt") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ prompt_id: "prompt-1", node_errors: {} }));
      return;
    }
    if (req.url === "/history/prompt-1") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          "prompt-1": {
            status: { completed: true, status_str: "success" },
            outputs: { "4": { images: [{ filename: "out.png", subfolder: "", type: "output" }] } },
          },
        })
      );
      return;
    }
    if (req.url === "/view?filename=out.png&subfolder=&type=output") {
      res.end(Buffer.from("PNG-BYTES"));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  };
}

describe("S2.10 ComfyUI adapter", () => {
  it("health is ready and execute completes with images", async () => {
    const { server, url } = await mockServer(goodHandler());
    try {
      const adapter = createComfyUiAdapter({ baseUrl: url });
      expect((await adapter.health()).status).toBe("ready");
      const progress = [];
      const result = await adapter.execute({
        taskId: "t1",
        taskType: "image",
        params: { workflow: WORKFLOW },
        onProgress: (p) => progress.push(p.stage),
      });
      expect(result.ok).toBe(true);
      expect(result.output.images).toEqual([Buffer.from("PNG-BYTES").toString("base64")]);
      expect(result.output.promptId).toBe("prompt-1");
      expect(progress).toContain("generating");
    } finally {
      await stop(server);
    }
  });

  it("missing workflow param fails closed with a typed error", async () => {
    const { server, url } = await mockServer(goodHandler());
    try {
      const adapter = createComfyUiAdapter({ baseUrl: url });
      const result = await adapter.execute({ taskId: "t2", taskType: "image", params: {} });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("FAILED");
    } finally {
      await stop(server);
    }
  });

  it("an unreachable endpoint reports UNAVAILABLE results (never throws)", async () => {
    const { server, url } = await mockServer(goodHandler());
    await stop(server);
    const adapter = createComfyUiAdapter({ baseUrl: url });
    const result = await adapter.execute({
      taskId: "t3",
      taskType: "image",
      params: { workflow: WORKFLOW },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNAVAILABLE");
    expect((await adapter.health()).status).toBe("unavailable");
  });

  it("workflow node errors fail with a typed error (no images)", async () => {
    const { server, url } = await mockServer((req, res) => {
      if (req.url === "/prompt") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ prompt_id: "p", node_errors: { "1": { errors: ["bad"] } } }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    try {
      const adapter = createComfyUiAdapter({ baseUrl: url });
      const result = await adapter.execute({
        taskId: "t4",
        taskType: "image",
        params: { workflow: WORKFLOW },
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("FAILED");
    } finally {
      await stop(server);
    }
  });

  it("interrupt aborts polling (no hang)", async () => {
    const { server, url } = await mockServer((req, res) => {
      if (req.url === "/prompt") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ prompt_id: "slow-1", node_errors: {} }));
        return;
      }
      if (req.url === "/interrupt") {
        res.end("{}");
        return;
      }
      // History never completes.
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
    try {
      const adapter = createComfyUiAdapter({ baseUrl: url });
      const executing = adapter.execute({
        taskId: "t5",
        taskType: "image",
        params: { workflow: WORKFLOW },
      });
      await new Promise((r) => setTimeout(r, 150));
      adapter.interrupt("t5");
      const result = await executing;
      expect(result.ok).toBe(false);
      expect(result.code).toBe("INTERRUPTED");
    } finally {
      await stop(server);
    }
  }, 30000);
});
