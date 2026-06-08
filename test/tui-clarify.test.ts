import test from "node:test";
import assert from "node:assert/strict";
import { applyClarifyInputToken, createClarifyInputState, renderClarifyComposerPanel } from "../src/tui/clarify.js";
import { renderComposerSurface } from "../src/tui/composer.js";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";
import type { ClarifyRequest } from "../src/types.js";

const request: ClarifyRequest = {
  question: "Which path should the agent take?",
  details: "The next edit is irreversible.",
  choices: [
    { id: "safe", label: "Safe path", description: "Add checks first." },
    { id: "fast", label: "Fast path", description: "Patch directly." },
  ],
  allow_freeform: true,
};

test("clarify input supports arrow selection and enter confirmation", () => {
  let state = createClarifyInputState(request);
  assert.equal(state.selectedIndex, 0);

  let result = applyClarifyInputToken(state, request, "\u001b[B");
  state = result.state;
  assert.equal(state.selectedIndex, 1);
  assert.equal(result.response, undefined);

  result = applyClarifyInputToken(state, request, "\r");
  assert.deepEqual(result.response, {
    answer: "Fast path",
    choice_id: "fast",
    choice_label: "Fast path",
    freeform: false,
  });
});

test("clarify input preserves numeric hotkeys and freeform answers", () => {
  let result = applyClarifyInputToken(createClarifyInputState(request), request, "2");
  assert.equal(result.response?.choice_id, "fast");

  let state = createClarifyInputState(request);
  for (const key of ["u", "s", "e", " ", "c", "a", "n", "a", "r", "y"]) {
    state = applyClarifyInputToken(state, request, key).state;
  }
  result = applyClarifyInputToken(state, request, "\r");
  assert.deepEqual(result.response, {
    answer: "use canary",
    freeform: true,
  });
});

test("clarify freeform input keeps j and k as printable text", () => {
  let state = createClarifyInputState(request);
  for (const key of ["j", "u", "s", "t", " ", "k", "e", "e", "p"]) {
    state = applyClarifyInputToken(state, request, key).state;
  }
  const result = applyClarifyInputToken(state, request, "\r");

  assert.deepEqual(result.response, {
    answer: "just keep",
    freeform: true,
  });
});

test("clarify input refuses empty freeform when no choice exists", () => {
  const freeformOnly: ClarifyRequest = {
    question: "What should change?",
    choices: [],
    allow_freeform: true,
  };
  const result = applyClarifyInputToken(createClarifyInputState(freeformOnly), freeformOnly, "\r");

  assert.equal(result.response, undefined);
  assert.equal(result.state.selectedIndex, -1);
});

test("clarify panel renders inline above the composer without truncating the request", () => {
  const longRequest: ClarifyRequest = {
    question: "是否要批准当前 plan，让我继续测试剩下的 14 个 mutating 工具（write_file、edit_file、apply_patch、ast_edit、进程管理等）？",
    details: "这一步应该保持在 chat 输入框上方，而不是跳到独立全屏。",
    choices: [
      { id: "approve", label: "批准计划，继续测试写入/进程工具", description: "批准 plan 并继续测试剩下的 mutating 工具。" },
      { id: "stop", label: "目前的结果已经够了", description: "不需要继续当前验证。" },
    ],
    allow_freeform: true,
  };
  let state = createClarifyInputState(longRequest);
  state = applyClarifyInputToken(state, longRequest, "\u001b[B").state;
  const panel = renderClarifyComposerPanel(longRequest, state, 82);
  const plain = stripAnsi(panel.lines.join("\n"));

  assert.match(plain, /clarify needs your response/);
  assert.match(plain, /是否要批准当前 plan/);
  assert.match(plain, /apply_patch/);
  assert.match(plain, /跳到独立全屏/);
  assert.match(plain, /批准计划，继续测试写入\/进程工具/);
  assert.match(plain, /目前的结果已经够了/);
  assert.ok(panel.lines.every((line) => visibleWidth(line) <= 82));
  assert.ok(panel.cursorLine !== undefined && panel.cursorLine > 0);

  const composed = renderComposerSurface({
    buffer: "",
    cursor: 0,
    items: [],
    selected: 0,
    width: 82,
    panel,
  });
  const composedPlain = stripAnsi(composed.lines.join("\n"));
  assert.ok(composed.cursorLine < composed.lines.findIndex((line) => stripAnsi(line).includes("Ask Inferoa")));
  assert.equal(composed.lines.length, panel.lines.length + 3);
  assert.equal(stripAnsi(composed.lines[panel.lines.length] ?? "").trim(), "");
  assert.match(composedPlain, /clarify needs your response/);
  assert.match(composedPlain, /Ask Inferoa/);
});
