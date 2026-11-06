// S7.1 ComfyUI workflow integration tests.
//
// Proves the spec acceptance against a local fixture server
// (mock-deferred): submit → poll → bytes; health-closed →
// typed refusal; no silent retries.
//
// - runWorkflow drives the real ComfyUiAdapter against a
//   node:http fixture mimicking /system_stats, /prompt,
//   /history, /view: submit → poll (empty, then complete) →
//   PNG bytes harvested as base64.
// - Health gate closed (system_stats 500): typed UNAVAILABLE,
//   zero /prompt submissions.
// - Server unreachable: typed UNAVAILABLE.
// - Oversized workflow dims refuse ENVELOPE_EXCEEDED before
//   any submission; invalid workflow throws typed.
//
// Imported from the built `out/node/engines/provider/comfyui-client.js`.
const { describe, it, expect, beforeEach, afterEach } = await import("vitest");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const clientPath = path.join(root, "out/node/engines/provider/comfyui-client.js");
const adapterPath = path.join(root, "out/node/engines/provider/comfyui.js");
if (!fs.existsSync(clientPath)) {
  throw new Error("Missing out/node/engines/provider/comfyui-client.js — run 'npm run build' first");
}
if (!fs.existsSync(adapterPath)) {
  throw new Error("Missing out/node/engines/provider/comfyui.js — run 'npm run build' first");
}
const { runWorkflow } = require(clientPath);
const { createComfyUiAdapter } = require(adapterPath);

const PNG_BYTES = Buffer.from("89504e470d0a1a0a", "hex");

let server;
let baseUrl;
let submittedPrompts;
let historyPolls;

function startFixture(behavior) {
  submittedPrompts = [];
  historyPolls = 0;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://fixture.local");
    if (url.pathname === "/system_stats") {
      if (behavior.healthDown) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({}));
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ system: { os: "fixture" } }));
      }
    } else if (url.pathname === "/prompt") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        submittedPrompts.push(JSON.parse(raw));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ prompt_id: "prompt-1", node_errors: {} }));
      });
    } else if (url.pathname === "/history/prompt-1") {
      historyPolls++;
      const done = historyPolls >= 2;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          "prompt-1": done
            ? {
                status: { completed: true, status_str: "success" },
                outputs: { 1: { images: [{ filename: "panel.png", subfolder: "", type: "output" }] } },
              }
            : { status: { completed: false } },
        })
      );
    } else if (url.pathname === "/view") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG_BYTES);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
}

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
});

const WORKFLOW = {
  "1": { class_type: "KSampler", inputs: { width: 512, height: 512 } },
};

describe("S7.1 ComfyUI workflow integration", () => {
  it("submit → poll → harvested bytes against the fixture server", async () => {
    await startFixture({ healthDown: false });
    const adapter = createComfyUiAdapter({ baseUrl });
    const result = await runWorkflow(adapter, { taskId: "job-1", workflow: WORKFLOW });
    expect(result.ok).toBe(true);
    expect(result.output.promptId).toBe("prompt-1");
    expect(result.output.images).toHaveLength(1);
    expect(Buffer.from(result.output.images[0], "base64")).toEqual(PNG_BYTES);
    expect(submittedPrompts).toHaveLength(1);
    expect(historyPolls).toBe(2);
  });

  it("health-closed refuses typed, submits nothing, retries never", async () => {
    await startFixture({ healthDown: true });
    const adapter = createComfyUiAdapter({ baseUrl });
    const result = await runWorkflow(adapter, { taskId: "job-2", workflow: WORKFLOW });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNAVAILABLE");
    expect(submittedPrompts).toHaveLength(0);
  });

  it("unreachable server refuses typed UNAVAILABLE", async () => {
    const adapter = createComfyUiAdapter({ baseUrl: "http://127.0.0.1:1" });
    const result = await runWorkflow(adapter, { taskId: "job-3", workflow: WORKFLOW });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNAVAILABLE");
  });

  it("oversized workflows refuse before submission; invalid throws typed", async () => {
    await startFixture({ healthDown: false });
    const adapter = createComfyUiAdapter({ baseUrl });
    const oversized = {
      "1": { class_type: "KSampler", inputs: { width: 4096, height: 512 } },
    };
    const refused = await runWorkflow(adapter, { taskId: "job-4", workflow: oversized });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("ENVELOPE_EXCEEDED");
    expect(submittedPrompts).toHaveLength(0);
    await expect(runWorkflow(adapter, { taskId: "", workflow: WORKFLOW })).rejects.toMatchObject({ code: "WORKFLOW_INVALID" });
    await expect(runWorkflow(adapter, { taskId: "job-5", workflow: null })).rejects.toMatchObject({ code: "WORKFLOW_INVALID" });
  });
});
