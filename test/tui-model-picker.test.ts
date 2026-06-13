import test from "node:test";
import assert from "node:assert/strict";
import { stripAnsi } from "../src/tui/ansi.js";
import { modelPickerHint } from "../src/tui/model-picker.js";

test("model picker hint marks live catalog results", () => {
  const hint = stripAnsi(modelPickerHint({
    pageIndex: 0,
    totalPages: 2,
    totalItems: 8,
    source: "live",
  }));

  assert.equal(hint, "1/2 · 8 models · live · ←/→ page · type search · enter select · esc cancel");
});

test("model picker hint marks fallback catalog results", () => {
  const hint = stripAnsi(modelPickerHint({
    pageIndex: 0,
    totalPages: 1,
    totalItems: 4,
    query: "qwen",
    source: "fallback",
  }));

  assert.equal(hint, "1/1 · 4 models · search qwen · fallback · ←/→ page · type search · enter select · esc cancel");
});
