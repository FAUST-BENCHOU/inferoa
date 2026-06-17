import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { PromptBuilder } from "../src/context/prompt.js";
import { Runtime } from "../src/runtime.js";
import { SessionStore } from "../src/session/store.js";
import { CORE_TOOL_DEFINITIONS } from "../src/tools/schemas.js";
import type { JsonObject, ModelMessage, SessionEvent, VllmAgentConfig, WorkspaceIdentity } from "../src/types.js";

test("new sessions freeze independent prompt-cache snapshots from the current live tools", async () => {
  const server = simpleModelServer();
  await server.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-prefix-new-session-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const runtimeConfig = config(server.baseUrl);
    runtimeConfig.omni.enabled = false;
    const workspace: WorkspaceIdentity = { id: "w_prefix_new_session", root: dir, alias: "prefix-new-session" };
    const runtime = new Runtime(runtimeConfig, workspace, store);

    const first = await runtime.run({ prompt: "first new session" });
    runtimeConfig.omni.enabled = true;
    runtimeConfig.omni.endpoints.image_generation = { base_url: server.baseUrl, model: "image-model" };
    const second = await runtime.run({ prompt: "second new session after live tools change" });

    assert.equal(server.requests.length, 2);
    assert.equal(toolNames(server.requests[0]!).includes("image_generation"), false);
    assert.equal(toolNames(server.requests[1]!).includes("image_generation"), false);
    assert.deepEqual(toolNames(server.requests[1]!), toolNames(server.requests[0]!));

    const firstRequest = modelRequests(store, first.session.session_id)[0]!;
    const secondRequest = modelRequests(store, second.session.session_id)[0]!;
    assert.notEqual(first.session.session_id, second.session.session_id);
    assert.notEqual(firstRequest.data.prompt_epoch_id, secondRequest.data.prompt_epoch_id);
    assert.equal(firstRequest.data.tool_schema_hash, secondRequest.data.tool_schema_hash);
    assert.notEqual(store.getCurrentPromptEpoch(first.session.session_id)?.cache_salt, store.getCurrentPromptEpoch(second.session.session_id)?.cache_salt);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await server.stop();
  }
});

test("resumed sessions reuse the frozen prompt surface after live tools change", async () => {
  const server = simpleModelServer();
  await server.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-prefix-resume-session-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const runtimeConfig = config(server.baseUrl);
    runtimeConfig.omni.enabled = false;
    const workspace: WorkspaceIdentity = { id: "w_prefix_resume_session", root: dir, alias: "prefix-resume-session" };
    const runtime = new Runtime(runtimeConfig, workspace, store);
    const session = store.createSession(workspace, "prefix-resume-session");

    await runtime.run({ prompt: "first turn freezes the session prompt surface", session_id: session.session_id });
    runtimeConfig.omni.enabled = true;
    runtimeConfig.omni.endpoints.image_generation = { base_url: server.baseUrl, model: "image-model" };
    const resumedRuntime = new Runtime(runtimeConfig, workspace, store);
    await resumedRuntime.run({ prompt: "resume the same session after live tools changed", session_id: session.session_id });

    assert.equal(server.requests.length, 2);
    assert.equal(toolNames(server.requests[0]!).includes("image_generation"), false);
    assert.deepEqual(toolNames(server.requests[1]!), toolNames(server.requests[0]!));
    assert.equal(systemMessage(server.requests[1]!), systemMessage(server.requests[0]!));

    const requests = modelRequests(store, session.session_id);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.data.prompt_epoch_id, requests[0]?.data.prompt_epoch_id);
    assert.equal(requests[1]?.data.tool_schema_hash, requests[0]?.data.tool_schema_hash);
    assert.equal(store.listEvents(session.session_id).filter((event) => event.type === "prompt.session_snapshot.created").length, 1);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await server.stop();
  }
});

test("scoped runtime tools freeze per session and cannot widen on resume", async () => {
  const server = simpleModelServer();
  await server.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-prefix-scoped-tools-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const runtimeConfig = config(server.baseUrl);
    const workspace: WorkspaceIdentity = { id: "w_prefix_scoped_tools", root: dir, alias: "prefix-scoped-tools" };
    const runtime = new Runtime(runtimeConfig, workspace, store);

    const first = await runtime.run({
      prompt: "freeze scoped self-improve tools",
      tool_names: ["read_file", "skill"],
    });
    await runtime.run({
      session_id: first.session.session_id,
      prompt: "try to widen scoped tools",
      tool_names: ["edit_file", "run_command"],
    });

    assert.equal(server.requests.length, 2);
    assert.deepEqual(toolNames(server.requests[0]!), ["read_file"]);
    assert.deepEqual(toolNames(server.requests[1]!), ["read_file"]);
    assert.equal(toolNames(server.requests[1]!).includes("edit_file"), false);
    assert.equal(toolNames(server.requests[1]!).includes("run_command"), false);

    const requests = modelRequests(store, first.session.session_id);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.data.prompt_epoch_id, requests[0]?.data.prompt_epoch_id);
    assert.equal(requests[1]?.data.tool_schema_hash, requests[0]?.data.tool_schema_hash);
    assert.equal(store.listEvents(first.session.session_id).filter((event) => event.type === "prompt.session_snapshot.created").length, 1);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await server.stop();
  }
});

test("model calls within an epoch append new tail messages without rewriting the prefix", async () => {
  let calls = 0;
  const server = captureModelServer((res) => {
    calls += 1;
    if (calls === 1) {
      writeSse(res, {
        id: "resp_prefix_tool",
        model: "prefix-cache-test",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: "call_prefix_read",
                  type: "function",
                  function: { name: "read_file", arguments: JSON.stringify({ path: "missing-prefix-file.txt" }) },
                },
              ],
            },
          },
        ],
      });
      writeSse(res, { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 2 } });
      return;
    }
    writeSse(res, { id: "resp_prefix_done", model: "prefix-cache-test", choices: [{ delta: { content: "prefix stable" } }] });
    writeSse(res, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 21, completion_tokens: 3 } });
  });
  await server.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-prefix-within-epoch-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_prefix_within_epoch", root: dir, alias: "prefix-within-epoch" };
    const runtime = new Runtime(config(server.baseUrl), workspace, store);

    const result = await runtime.run({ prompt: "read a file then finish" });

    assert.equal(result.content, "prefix stable");
    assert.equal(server.requests.length, 2);
    assert.equal(systemMessage(server.requests[1]!), systemMessage(server.requests[0]!));
    assert.deepEqual(toolNames(server.requests[1]!), toolNames(server.requests[0]!));
    const firstMessages = messages(server.requests[0]!).map((message) => JSON.stringify(message));
    const secondMessages = messages(server.requests[1]!).map((message) => JSON.stringify(message));
    assert.deepEqual(secondMessages.slice(0, firstMessages.length), firstMessages);

    const requests = modelRequests(store, result.session.session_id);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.data.prompt_epoch_id, requests[0]?.data.prompt_epoch_id);
    assert.equal(requests[1]?.data.tool_schema_hash, requests[0]?.data.tool_schema_hash);
    assert.equal(requests[0]?.data.prefix_cache_status, "new_epoch");
    assert.equal(requests[1]?.data.prefix_cache_status, "safe");
    assert.equal(requests[1]?.data.prefix_cache_parent_prompt_hash, requests[0]?.data.prompt_hash);
    assert.equal(requests[1]?.data.prefix_cache_checked_messages, requests[0]?.data.prompt_message_count);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await server.stop();
  }
});

test("tool-loop continuation prompts are persisted so multi-round requests stay prefix-safe", async () => {
  let calls = 0;
  const server = captureModelServer((res) => {
    calls += 1;
    if (calls <= 2) {
      writeSse(res, {
        id: `resp_prefix_tool_${calls}`,
        model: "prefix-cache-test",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: `call_prefix_read_${calls}`,
                  type: "function",
                  function: { name: "read_file", arguments: JSON.stringify({ path: `missing-prefix-file-${calls}.txt` }) },
                },
              ],
            },
          },
        ],
      });
      writeSse(res, { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20 + calls, completion_tokens: 2 } });
      return;
    }
    writeSse(res, { id: "resp_prefix_done", model: "prefix-cache-test", choices: [{ delta: { content: "prefix stable" } }] });
    writeSse(res, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 30, completion_tokens: 3 } });
  });
  await server.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-prefix-multiround-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_prefix_multiround", root: dir, alias: "prefix-multiround" };
    const runtime = new Runtime(config(server.baseUrl), workspace, store);

    const result = await runtime.run({ prompt: "read two missing files then finish" });

    assert.equal(result.content, "prefix stable");
    assert.equal(server.requests.length, 3);
    const firstMessages = messages(server.requests[0]!).map((message) => JSON.stringify(message));
    const secondMessages = messages(server.requests[1]!).map((message) => JSON.stringify(message));
    const thirdMessages = messages(server.requests[2]!).map((message) => JSON.stringify(message));
    assert.deepEqual(secondMessages.slice(0, firstMessages.length), firstMessages);
    assert.deepEqual(thirdMessages.slice(0, secondMessages.length), secondMessages);
    assert.match(JSON.stringify(server.requests[1]), /Continue from the tool evidence/);
    assert.match(JSON.stringify(server.requests[2]), /Continue from the tool evidence/);

    const requests = modelRequests(store, result.session.session_id);
    assert.equal(requests.length, 3);
    assert.equal(requests[1]?.data.prefix_cache_status, "safe");
    assert.equal(requests[2]?.data.prefix_cache_status, "safe");
    assert.equal(store.listEvents(result.session.session_id).filter((event) => event.type === "user.prompt" && event.data.synthetic === "tool-loop-continuation").length, 2);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await server.stop();
  }
});

test("cross-run prompts preserve tool-loop prefix history and skip hidden reflection branches", async () => {
  let calls = 0;
  const server = captureModelServer((res) => {
    calls += 1;
    if (calls === 1) {
      writeSse(res, {
        id: "resp_cross_run_tool",
        model: "prefix-cache-test",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: "call_cross_run_read",
                  type: "function",
                  function: { name: "read_file", arguments: JSON.stringify({ path: "missing-cross-run-file.txt" }) },
                },
              ],
            },
          },
        ],
      });
      writeSse(res, { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 2 } });
      return;
    }
    writeSse(res, { id: `resp_cross_run_done_${calls}`, model: "prefix-cache-test", choices: [{ delta: { content: `done ${calls}` } }] });
    writeSse(res, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 30 + calls, completion_tokens: 3 } });
  });
  await server.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-prefix-cross-run-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_prefix_cross_run", root: dir, alias: "prefix-cross-run" };
    const runtime = new Runtime(config(server.baseUrl), workspace, store);

    const first = await runtime.run({ prompt: "read a missing file before finishing" });
    await runtime.run({
      session_id: first.session.session_id,
      prompt: "run a hidden reflection pass",
      request_class: "reflection",
      visibility: "internal",
    });
    await runtime.run({ session_id: first.session.session_id, prompt: "continue normal work" });

    assert.equal(server.requests.length, 4);
    const toolLoopMessages = messages(server.requests[1]!).map((message) => JSON.stringify(message));
    const reflectionMessages = messages(server.requests[2]!).map((message) => JSON.stringify(message));
    const interactiveMessages = messages(server.requests[3]!).map((message) => JSON.stringify(message));
    assert.deepEqual(reflectionMessages.slice(0, toolLoopMessages.length), toolLoopMessages);
    assert.deepEqual(interactiveMessages.slice(0, toolLoopMessages.length), toolLoopMessages);

    const requests = modelRequests(store, first.session.session_id);
    assert.equal(requests.length, 4);
    assert.equal(requests[0]?.data.prefix_cache_status, "new_epoch");
    assert.equal(requests[1]?.data.prefix_cache_status, "safe");
    assert.equal(requests[2]?.data.prefix_cache_status, "safe");
    assert.equal(requests[3]?.data.prefix_cache_status, "safe");
    assert.equal(requests[2]?.data.prefix_cache_parent_prompt_hash, requests[1]?.data.prompt_hash);
    assert.equal(requests[3]?.data.prefix_cache_parent_prompt_hash, requests[1]?.data.prompt_hash);
    assert.equal(requests[3]?.data.prefix_cache_reason, "prior_prompt_is_prefix");
    assert.equal(requests[3]?.data.prefix_cache_skipped_requests, 1);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await server.stop();
  }
});

test("compaction starts a new epoch by appending memory while replaying preserved tail", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-prefix-between-epochs-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const runtimeConfig = config("http://127.0.0.1:9/v1");
    const workspace: WorkspaceIdentity = { id: "w_prefix_between_epochs", root: dir, alias: "prefix-between-epochs" };
    const session = store.createSession(workspace, "prefix-between-epochs");
    const builder = new PromptBuilder(runtimeConfig, store, workspace);
    const userPromptId = store.appendEvent({
      session_id: session.session_id,
      run_id: "run_before_compact",
      type: "user.prompt",
      data: { prompt: "preserved user anchor before compact" },
    });
    const finalResponseId = store.appendEvent({
      session_id: session.session_id,
      run_id: "run_before_compact",
      type: "model.response.settled",
      data: { content: "preserved assistant state before compact", tool_calls: [] },
    });
    const before = builder.build(session, "next request before compact", CORE_TOOL_DEFINITIONS);
    const cutoff = store.latestEventId(session.session_id);
    store.appendEvent({
      session_id: session.session_id,
      type: "context.compacted",
      data: {
        reason: "threshold",
        summary: "Goal\n- Continue after compact without rewriting the stable system prelude.",
        archive_resource_uri: "resource://prefix-between-epochs/archive",
        archived_events: 2,
        protected_tail_events: 2,
        compacted_through_event_id: cutoff,
        preserved_run_anchor_event_ids: [userPromptId],
        preserved_tail_event_ids: [finalResponseId],
      },
    });

    const after = builder.build(store.getSession(session.session_id)!, "next request after compact", CORE_TOOL_DEFINITIONS);
    const beforeSystem = String(before.messages[0]?.content ?? "");
    const afterSystem = String(after.messages[0]?.content ?? "");

    assert.notEqual(after.epoch.prompt_epoch_id, before.epoch.prompt_epoch_id);
    assert.equal(after.tool_schema_hash, before.tool_schema_hash);
    assert.equal(afterSystem.split("\n\n<epoch.memory>")[0], beforeSystem);
    assert.match(afterSystem, /<epoch\.memory>/);
    assert.match(afterSystem, /Continue after compact without rewriting the stable system prelude/);
    assert.match(JSON.stringify(after.messages), /preserved user anchor before compact/);
    assert.match(JSON.stringify(after.messages), /preserved assistant state before compact/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

function config(baseUrl: string): VllmAgentConfig {
  const next = structuredClone(DEFAULT_CONFIG);
  next.model_setup.base_url = baseUrl;
  next.model_setup.model = "prefix-cache-test";
  next.model_setup.mode = "direct";
  next.skills.enabled = [];
  return next;
}

function simpleModelServer(): CapturedModelServer {
  let calls = 0;
  return captureModelServer((res) => {
    calls += 1;
    writeSse(res, { id: `resp_prefix_${calls}`, model: "prefix-cache-test", choices: [{ delta: { content: `turn ${calls}` } }] });
    writeSse(res, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 30 + calls, completion_tokens: 1 } });
  });
}

interface CapturedModelServer {
  readonly baseUrl: string;
  readonly requests: JsonObject[];
  start(): Promise<void>;
  stop(): Promise<void>;
}

function captureModelServer(writeChatResponse: (res: { write: (chunk: string) => void }) => void): CapturedModelServer {
  const requests: JsonObject[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    if (serveEndpointSignal(req.url, res)) {
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body.trim()) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("empty request");
        return;
      }
      requests.push(JSON.parse(body) as JsonObject);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      writeChatResponse(res);
      res.end("data: [DONE]\n\n");
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  let baseUrl = "";
  return {
    get baseUrl() {
      return baseUrl;
    },
    requests,
    async start() {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}/v1`;
    },
    async stop() {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 250);
        timeout.unref();
        server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    },
  };
}

function serveEndpointSignal(url: string | undefined, res: { writeHead: (status: number, headers: Record<string, string>) => void; end: (chunk?: string) => void }): boolean {
  if (url === "/v1/models") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "prefix-cache-test" }] }));
    return true;
  }
  if (url === "/load") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ waiting: 0, running: 0 }));
    return true;
  }
  if (url === "/metrics") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("vllm:prefix_cache_queries_total 2\nvllm:prefix_cache_hits_total 1\n");
    return true;
  }
  return false;
}

function writeSse(res: { write: (chunk: string) => void }, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function messages(body: JsonObject): ModelMessage[] {
  return Array.isArray(body.messages) ? (body.messages as unknown as ModelMessage[]) : [];
}

function systemMessage(body: JsonObject): string {
  return String(messages(body).find((message) => message.role === "system")?.content ?? "");
}

function toolNames(body: JsonObject): string[] {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  return tools.map((tool) => toolName(tool)).filter((name): name is string => Boolean(name)).sort();
}

function toolName(tool: unknown): string | undefined {
  if (!tool || typeof tool !== "object") {
    return undefined;
  }
  const record = tool as { function?: { name?: unknown }; name?: unknown };
  return typeof record.function?.name === "string" ? record.function.name : typeof record.name === "string" ? record.name : undefined;
}

function modelRequests(store: SessionStore, sessionId: string): SessionEvent[] {
  return store.listEvents(sessionId).filter((event) => event.type === "model.request.started");
}
