import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";
import { renderSessionTranscript } from "../src/tui/session-transcript.js";
import { SessionStore } from "../src/session/store.js";
import type { SessionEvent } from "../src/types.js";

test("session transcript restores visible user and assistant turns", () => {
  const events: SessionEvent[] = [
    { session_id: "s1", run_id: "r1", type: "session.resumed", data: {} },
    { session_id: "s1", run_id: "r1", type: "user.prompt", data: { prompt: "who are you" } },
    { session_id: "s1", run_id: "r1", type: "model.response.settled", data: { content: "I am **Inferoa**." } },
    { session_id: "s1", run_id: "r2", type: "user.prompt", data: { prompt: "show a table" } },
    { session_id: "s1", run_id: "r2", type: "model.response.settled", data: { content: "| A | B |\n| - | - |\n| long value | wrapped content |" } },
  ];

  const rendered = renderSessionTranscript(events, 72);
  const plain = stripAnsi(rendered);

  assert.match(plain, /› who are you/);
  assert.match(plain, /I am Inferoa\./);
  assert.match(plain, /› show a table/);
  assert.match(plain, /long value/);
  assert.doesNotMatch(plain, /session\.resumed/);
  assert.ok(rendered.endsWith("\n\n"));
});

test("session transcript respects narrow terminal widths", () => {
  const rendered = renderSessionTranscript(
    [
      {
        session_id: "s1",
        run_id: "r1",
        type: "user.prompt",
        data: { prompt: "a very long prompt that should be clipped inside the prompt block" },
      },
      {
        session_id: "s1",
        run_id: "r1",
        type: "model.response.settled",
        data: { content: "a very long answer that should wrap without overflowing the terminal width" },
      },
    ],
    40,
  );

  for (const line of rendered.split("\n").filter(Boolean)) {
    assert.ok(visibleWidth(line) <= 40, line);
  }
});

test("session transcript restores visible tool traces after a fullscreen redraw", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-session-transcript-tools-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const events: SessionEvent[] = [
      { session_id: "s1", run_id: "r1", type: "user.prompt", data: { prompt: "inspect the file" } },
      { session_id: "s1", run_id: "r1", type: "model.response.settled", data: { content: "I will inspect it.", tool_calls: [{ id: "call_read", name: "read_file", arguments: { path: "src/app.ts" } }] } },
      { session_id: "s1", run_id: "r1", type: "tool.call", data: { tool_call_id: "call_read", tool_name: "read_file", arguments: { path: "src/app.ts" } } },
      {
        session_id: "s1",
        run_id: "r1",
        type: "tool.result",
        data: {
          tool_call_id: "call_read",
          tool_name: "read_file",
          result: { ok: true, summary: "Read src/app.ts", data: { path: "src/app.ts", content: "export function app() {}" } },
        },
      },
      { session_id: "s1", run_id: "r1", type: "model.response.settled", data: { content: "Done." } },
    ];

    const rendered = renderSessionTranscript(events, 96, store);
    const plain = stripAnsi(rendered);

    assert.match(plain, /› inspect the file/);
    assert.match(plain, /I will inspect it\./);
    assert.match(plain, /Read file .*src\/app\.ts/);
    assert.match(plain, /Done\./);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("session transcript trims stored assistant trailing blank lines", () => {
  const events: SessionEvent[] = [
    { session_id: "s1", run_id: "r1", type: "model.response.settled", data: { content: "I will inspect it.\n\n\n\n" } },
    { session_id: "s1", run_id: "r1", type: "model.response.settled", data: { content: "Done." } },
  ];

  const plain = stripAnsi(renderSessionTranscript(events, 96));

  assert.match(plain, /I will inspect it\.\n\nDone\./);
  assert.doesNotMatch(plain, /I will inspect it\.\n\n\nDone\./);
});

test("session transcript hides internal loop prompts and tool traces on redraw", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-session-transcript-internal-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const events: SessionEvent[] = [
      { session_id: "s1", run_id: "visible", type: "user.prompt", data: { prompt: "visible request" } },
      { session_id: "s1", run_id: "visible", type: "model.response.settled", data: { content: "Visible answer." } },
      {
        session_id: "s1",
        run_id: "reflect",
        type: "user.prompt",
        data: { prompt: "Loop objective: internal reflection should not redraw", request_class: "reflection", visibility: "internal" },
      },
      {
        session_id: "s1",
        run_id: "reflect",
        type: "tool.result",
        data: {
          tool_call_id: "reflect_goal",
          tool_name: "goal",
          request_class: "reflection",
          visibility: "internal",
          result: { ok: true, summary: "Recorded hidden loop decision", data: { status: "done" } },
        },
      },
      {
        session_id: "s1",
        run_id: "reflect",
        type: "model.response.settled",
        data: { content: "Hidden reflection text", request_class: "reflection", visibility: "internal" },
      },
    ];

    const plain = stripAnsi(renderSessionTranscript(events, 96, store));

    assert.match(plain, /› visible request/);
    assert.match(plain, /Visible answer\./);
    assert.doesNotMatch(plain, /Loop objective/);
    assert.doesNotMatch(plain, /Recorded hidden loop decision/);
    assert.doesNotMatch(plain, /Hidden reflection text/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
