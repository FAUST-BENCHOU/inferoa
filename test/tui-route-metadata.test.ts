import test from "node:test";
import assert from "node:assert/strict";
import { composerRouteSelectionFromRoute, renderComposerRouteSelection } from "../src/tui/app.js";
import { stripAnsi } from "../src/tui/ansi.js";

test("auto composer route metadata renders selected model, category, and decision as separate segments", () => {
  const selection = composerRouteSelectionFromRoute({
    "x-vsr-selected-model": "qwen/qwen3.6-rocm",
    "x-vsr-selected-category": "decision",
    "x-vsr-selected-decision": "agentic_session_route",
  });
  const rendered = renderComposerRouteSelection(selection).join(" ");
  const plain = stripAnsi(rendered);

  assert.equal(plain, "· qwen/qwen3.6-rocm · decision · agentic_session_route");
  assert.doesNotMatch(plain, /selected:/);
  assert.doesNotMatch(plain, / \/ agentic_session_route/);
  assert.match(rendered, /\x1b\[38;5;75mqwen\/qwen3\.6-rocm\x1b\[0m/);
  assert.match(rendered, /\x1b\[38;5;252mdecision\x1b\[0m/);
  assert.match(rendered, /\x1b\[38;5;75magentic_session_route\x1b\[0m/);
});

test("composer route metadata falls back to request class labels when router category is absent", () => {
  const selection = composerRouteSelectionFromRoute(
    {
      "x-vsr-selected-model": "qwen/qwen3.6-rocm",
      "x-vsr-selected-decision": "agentic_session_route",
    },
    { requestClass: "reflection" },
  );
  const plain = stripAnsi(renderComposerRouteSelection(selection).join(" "));

  assert.equal(plain, "· qwen/qwen3.6-rocm · decision · agentic_session_route");
});
