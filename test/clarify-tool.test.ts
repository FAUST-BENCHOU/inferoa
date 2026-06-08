import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { Runtime } from "../src/runtime.js";
import { SessionStore } from "../src/session/store.js";
import { CORE_TOOL_DEFINITIONS } from "../src/tools/schemas.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { ClarifyRequest, ClarifyResponse, VllmAgentConfig, WorkspaceIdentity } from "../src/types.js";

function config(baseUrl?: string): VllmAgentConfig {
  const next = structuredClone(DEFAULT_CONFIG);
  next.permissions.mode = "full_access";
  if (baseUrl) {
    next.model_setup.base_url = baseUrl;
    next.model_setup.model = "clarify-test";
  }
  return next;
}

test("clarify tool asks through the runtime callback and returns the selected answer", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-clarify-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_clarify", root: dir, alias: "clarify" };
    const session = store.createSession(workspace, "clarify");
    const registry = new ToolRegistry(config(), workspace, store);
    const seen: ClarifyRequest[] = [];

    assert.ok(CORE_TOOL_DEFINITIONS.some((tool) => tool.name === "clarify"));

    const result = await registry.call(
      {
        id: "clarify_1",
        name: "clarify",
        arguments: {
          question: "Which migration strategy should I use?",
          choices: [
            { id: "safe", label: "Safe path", description: "Use additive schema first." },
            { id: "fast", label: "Fast path", description: "Edit directly." },
          ],
          allow_freeform: true,
        },
      },
      {
        session_id: session.session_id,
        run_id: "run_clarify",
        clarify: async (request): Promise<ClarifyResponse> => {
          seen.push(request);
          return { answer: "Use additive schema first.", choice_id: "safe", choice_label: "Safe path", freeform: false };
        },
      },
    );

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(seen[0]?.question, "Which migration strategy should I use?");
    assert.equal(seen[0]?.choices?.[0]?.id, "safe");
    assert.equal(result.data?.choice_id, "safe");
    assert.equal(result.data?.answer, "Use additive schema first.");
    assert.ok(store.listEvents(session.session_id).some((event) => event.type === "clarification.answered"));
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime continues after a model clarify tool call receives user input", async () => {
  let chatCalls = 0;
  const modelServer = createServer((req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "clarify-test" }] }));
      return;
    }
    if (req.url === "/load") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ waiting: 0, running: 0 }));
      return;
    }
    if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("vllm:prefix_cache_queries_total 2\nvllm:prefix_cache_hits_total 1\n");
      return;
    }
    req.resume();
    req.on("end", () => {
      if (req.url !== "/v1/chat/completions") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      chatCalls += 1;
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      if (chatCalls === 1) {
        writeSse(res, {
          id: "resp_clarify",
          model: "clarify-test",
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: "clarify_call",
                    type: "function",
                    function: {
                      name: "clarify",
                      arguments: JSON.stringify({
                        question: "Should I use the safe path?",
                        choices: [{ id: "safe", label: "Safe path" }],
                        allow_freeform: true,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        });
        writeSse(res, { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
      } else {
        writeSse(res, { id: "resp_final", model: "clarify-test", choices: [{ delta: { content: "Continuing with the safe path." } }] });
        writeSse(res, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 5 } });
      }
      res.end("data: [DONE]\n\n");
    });
  });
  modelServer.listen(0, "127.0.0.1");
  await once(modelServer, "listening");
  const address = modelServer.address() as AddressInfo;

  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-clarify-runtime-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_clarify_runtime", root: dir, alias: "clarify-runtime" };
    const runtime = new Runtime(config(`http://127.0.0.1:${address.port}/v1`), workspace, store);
    const seen: ClarifyRequest[] = [];
    const result = await runtime.run({
      prompt: "make the migration safe",
      onClarify: async (request) => {
        seen.push(request);
        return { answer: "Safe path", choice_id: "safe", choice_label: "Safe path", freeform: false };
      },
    });

    assert.equal(result.content, "Continuing with the safe path.");
    assert.equal(chatCalls, 2);
    assert.equal(seen[0]?.question, "Should I use the safe path?");
    assert.ok(store.listEvents(result.session.session_id).some((event) => event.type === "clarification.answered"));
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await new Promise<void>((resolve) => modelServer.close(() => resolve()));
  }
});

function writeSse(res: { write: (chunk: string) => void }, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

test("clarify tool fails cleanly when no interactive callback is available", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-clarify-missing-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_clarify_missing", root: dir, alias: "clarify-missing" };
    const session = store.createSession(workspace, "clarify-missing");
    const registry = new ToolRegistry(config(), workspace, store);

    const result = await registry.call(
      { id: "clarify_missing", name: "clarify", arguments: { question: "Need user input?", allow_freeform: true } },
      { session_id: session.session_id, run_id: "run_clarify" },
    );

    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "clarify_unavailable");
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("clarify tool does not silently pick a default when the UI cannot answer", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-clarify-cancelled-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_clarify_cancelled", root: dir, alias: "clarify-cancelled" };
    const session = store.createSession(workspace, "clarify-cancelled");
    const registry = new ToolRegistry(config(), workspace, store);

    const result = await registry.call(
      {
        id: "clarify_cancelled",
        name: "clarify",
        arguments: {
          question: "Should I take the risky path?",
          choices: [{ id: "safe", label: "Safe path" }],
          allow_freeform: true,
        },
      },
      {
        session_id: session.session_id,
        run_id: "run_clarify",
        clarify: async () => {
          throw new Error("Clarification requires an interactive terminal.");
        },
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "clarify_cancelled");
    const events = store.listEvents(session.session_id);
    assert.ok(events.some((event) => event.type === "clarification.requested"));
    assert.equal(events.some((event) => event.type === "clarification.answered"), false);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
