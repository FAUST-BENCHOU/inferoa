import test from "node:test";
import assert from "node:assert/strict";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";
import { renderTokenmaxxingLines } from "../src/tui/tokenmaxxing-view.js";
import type { JsonObject, SessionEvent } from "../src/types.js";

test("tokenmaxxing view combines prefix cache, RTK, and recent turn signal", () => {
  const events: SessionEvent[] = [
    event("user.prompt", { prompt: "warm up" }, "run_1"),
    event("run.completed", {
      tool_calls: 1,
      tokens: 100,
      rtk: {
        tool_calls: 1,
        rtk_tool_calls: 0,
        rtk_commands: 0,
        input_tokens: 0,
        output_tokens: 0,
        saved_tokens: 0,
        savings_pct: 0,
        estimated_without_rtk_tokens: 100,
        status: "ok",
      },
    }, "run_1"),
    event("user.prompt", { prompt: "real work" }, "run_2"),
    event("run.completed", {
      tool_calls: 3,
      tokens: 200,
      rtk: {
        tool_calls: 3,
        rtk_tool_calls: 2,
        rtk_commands: 2,
        input_tokens: 300,
        output_tokens: 60,
        saved_tokens: 240,
        savings_pct: 80,
        estimated_without_rtk_tokens: 440,
        status: "ok",
      },
    }, "run_2"),
    event("endpoint.evidence.recorded", {
      run_id: "run_2",
      prompt_tokens: 1000,
      cached_prompt_tokens: 971,
      cache_hit_rate: 0.971,
      model: "demo-model",
    }, "run_2"),
  ];
  const evidence: JsonObject[] = [
    { run_id: "run_1", usage: { prompt_tokens: 1000, cached_prompt_tokens: 58 } },
    { run_id: "run_2", usage: { prompt_tokens: 1000, cached_prompt_tokens: 971 } },
  ];

  const lines = renderTokenmaxxingLines(events, evidence, 140);
  const plain = stripAnsi(lines.join("\n"));

  assert.match(plain, /Tokenmaxxing/);
  assert.match(plain, /saved 1211 .*cache 971 .*rtk 240 .*model 0 .*tokens 300\/1511/);
  assert.match(plain, /prefix cache 97\.1% .*cached 971\/1000 .*1\/1 turns/);
  assert.match(plain, /rtk 2 cmds .*io 300->60 .*saved 240 .*tool 80\.0%/);
  assert.match(plain, /model selection pending .*cost rates unavailable/);
  assert.match(plain, /turn 2 .*tokens 200\/440 .*cache 97\.1% .*rtk 240 .*tools 3/);
  assert.doesNotMatch(plain, /run_2|[{}"]/);
  assert.ok(lines.every((line) => visibleWidth(line) <= 140));
});

function event(type: string, data: SessionEvent["data"], runId?: string): SessionEvent {
  return {
    session_id: "session",
    run_id: runId,
    type,
    data,
    created_at: "2026-06-09T08:09:10.000Z",
  };
}
