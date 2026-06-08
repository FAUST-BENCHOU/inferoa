import test from "node:test";
import assert from "node:assert/strict";
import { renderPlanDocumentSurface } from "../src/tui/plan-view.js";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";

test("plan document surface gives review plans a restrained gray markdown surface", () => {
  const lines = renderPlanDocumentSurface(
    {
      id: "plan_1",
      objective: "Refine plan mode UX",
      status: "drafting",
      summary: "Ready for user review.",
      body: "## Plan\n- Clarify uncertain constraints before execution\n- Ask for approval and revise from feedback",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    { width: 68, maxBodyLines: 8 },
  );
  const plain = lines.map((line) => stripAnsi(line));

  assert.match(plain[0] ?? "", /Proposed Plan/);
  assert.match(plain[0] ?? "", /Ready for user review/);
  assert.doesNotMatch(plain.join("\n"), /[╭╮╰╯│]/);
  assert.doesNotMatch(plain.join("\n"), /## Plan/);
  assert.match(plain.join("\n"), /Plan/);
  assert.match(plain.join("\n"), /Clarify uncertain constraints/);
  assert.ok(lines.every((line) => visibleWidth(line) <= 68));
});

test("empty plan document surface points back to drafting instead of looking approved", () => {
  const plain = renderPlanDocumentSurface(
    {
      id: "plan_2",
      objective: "Investigate runtime",
      status: "drafting",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    { width: 72 },
  )
    .map((line) => stripAnsi(line))
    .join("\n");

  assert.match(plain, /Plan draft/);
  assert.match(plain, /objective Investigate runtime/);
  assert.match(plain, /Waiting for context/);
});
