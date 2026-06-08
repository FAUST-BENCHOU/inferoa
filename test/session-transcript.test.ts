import test from "node:test";
import assert from "node:assert/strict";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";
import { renderSessionTranscript } from "../src/tui/session-transcript.js";
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
