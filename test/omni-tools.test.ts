import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { SessionStore } from "../src/session/store.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { VllmAgentConfig, WorkspaceIdentity } from "../src/types.js";

function config(baseUrl: string): VllmAgentConfig {
  const next = structuredClone(DEFAULT_CONFIG);
  next.omni.enabled = true;
  next.omni.endpoints.video_generation = {
    base_url: baseUrl,
    model: "Wan-AI/Wan2.1-T2V-1.3B-Diffusers",
  };
  return next;
}

test("video_generation follows the vLLM-Omni async video job lifecycle", async () => {
  let polls = 0;
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/videos") {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "vid_1", status: "queued" }));
      return;
    }
    if (req.method === "GET" && req.url === "/v1/videos/vid_1") {
      polls += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "vid_1", status: polls >= 2 ? "completed" : "running" }));
      return;
    }
    if (req.method === "GET" && req.url === "/v1/videos/vid_1/content") {
      res.writeHead(200, { "content-type": "video/mp4" });
      res.end(Buffer.from("fake-video"));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("missing");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;

  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-omni-video-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_omni", root: dir, alias: "omni" };
    const session = store.createSession(workspace, "omni");
    const registry = new ToolRegistry(config(baseUrl), workspace, store);
    const result = await registry.call(
      {
        id: "omni-video",
        name: "video_generation",
        arguments: { prompt: "A GPU rack booting Inferoa", poll_ms: 1, timeout_ms: 1000 },
      },
      { session_id: session.session_id, run_id: "run" },
    );

    assert.equal(result.ok, true);
    assert.equal(result.data?.job_id, "vid_1");
    assert.equal(polls, 2);
    const media = result.data?.media as Array<{ resource_uri?: string; content_type?: string; bytes?: number }>;
    assert.equal(media[0]?.content_type, "video/mp4");
    assert.equal(media[0]?.bytes, Buffer.byteLength("fake-video"));
    const stored = store.readResource(media[0]!.resource_uri!);
    assert.equal(stored?.content, Buffer.from("fake-video").toString("base64"));
  } finally {
    store.close();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
