import test from "node:test";
import assert from "node:assert/strict";
import { cacheFooterSummaryForRun, renderCacheFooter } from "../src/tui/cache-footer.js";
import { stripAnsi } from "../src/tui/ansi.js";

test("cache footer hides unavailable cached-token fields", () => {
  const footer = stripAnsi(renderCacheFooter({
    mode: "direct",
    model: "model",
    usage: { prompt_tokens: 120, completion_tokens: 12 },
    latencyMs: 10_487,
  }));
  assert.doesNotMatch(footer, /prefill 120/);
  assert.doesNotMatch(footer, /decode 12/);
  assert.match(footer, /worked for 10s/);
  assert.doesNotMatch(footer, /mode direct/);
  assert.doesNotMatch(footer, /model model/);
  assert.doesNotMatch(footer, /cached unavailable/);
  assert.doesNotMatch(footer, /hit unavailable/);
  assert.doesNotMatch(footer, /prefill unavailable/);
  assert.doesNotMatch(footer, /decode unavailable/);
  assert.doesNotMatch(footer, /latency/);
});

test("cache footer shows cached-token hit rate and cache gap when exposed", () => {
  const rawFooter = renderCacheFooter({
    mode: "direct",
    model: "model",
    usage: { prompt_tokens: 1000, cached_prompt_tokens: 500, completion_tokens: 20 },
    previousPromptTokens: 520,
  });
  const footer = stripAnsi(rawFooter);
  assert.doesNotMatch(footer, /prefix cache 750/);
  assert.match(footer, /cache reuse 50\.0% · gap 2\.0%/);
  assert.doesNotMatch(footer, /^cache hit/);
  assert.match(rawFooter, /\x1b\[38;5;48m/);
  assert.doesNotMatch(rawFooter, /\x1b\[38;5;220m/);
});

test("cache footer hides zero percent prefix cache hits", () => {
  const footer = stripAnsi(renderCacheFooter({
    usage: { prompt_tokens: 1000, cached_prompt_tokens: 0, completion_tokens: 20 },
    latencyMs: 12_000,
  }));

  assert.doesNotMatch(footer, /cache \d+\.\d+%/);
  assert.match(footer, /worked for 12s/);
});

test("cache footer labels warmup turns with unavailable cache gap", () => {
  const rawFooter = renderCacheFooter({
    usage: { prompt_tokens: 1000, cached_prompt_tokens: 50, completion_tokens: 20 },
    latencyMs: 4_320,
    cacheKind: "warmup",
  });
  const footer = stripAnsi(rawFooter);

  assert.match(footer, /warm cache 5\.0%/);
  assert.doesNotMatch(footer, /gap/);
  assert.doesNotMatch(footer, /prefix cache warmup \(/);
  assert.match(rawFooter, /\x1b\[38;5;244m/);
  assert.doesNotMatch(rawFooter, /\x1b\[38;5;220m/);
  assert.match(footer, /worked for 4\.3s/);
});

test("cache footer run summary uses the final steady model call instead of labeling the whole first run warm", () => {
  const summary = cacheFooterSummaryForRun([
    { session_id: "s", run_id: "run_1", type: "model.request.started", data: { step_id: "step_1", step_index: 1, prompt_epoch_id: "pe_1" } },
    { session_id: "s", run_id: "run_1", type: "model.response.settled", data: { step_id: "step_1", step_index: 1, usage: { prompt_tokens: 1000, cached_prompt_tokens: 50 } } },
    { session_id: "s", run_id: "run_1", type: "model.request.started", data: { step_id: "step_2", step_index: 2, prompt_epoch_id: "pe_1" } },
    { session_id: "s", run_id: "run_1", type: "model.response.settled", data: { step_id: "step_2", step_index: 2, usage: { prompt_tokens: 1100, cached_prompt_tokens: 990 } } },
  ], [], "run_1");

  const footer = stripAnsi(renderCacheFooter(summary));

  assert.equal(footer, "cache reuse 90.0% · gap 0.9%");
  assert.doesNotMatch(footer, /warm cache/);
});
