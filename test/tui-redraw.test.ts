import test from "node:test";
import assert from "node:assert/strict";
import { terminalBlockPatchSequence } from "../src/tui/redraw.js";

test("terminal block patch updates changed rows without clearing the whole surface", () => {
  const output = terminalBlockPatchSequence(
    {
      lines: ["alpha", "bravo", "charlie"],
      cursorLine: 1,
      cursorColumn: 2,
      width: 80,
    },
    {
      lines: ["alpha", "bravo!", "charlie"],
      cursorLine: 1,
      cursorColumn: 6,
    },
  );

  assert.doesNotMatch(output, /\x1b\[J/);
  assert.doesNotMatch(output, /\x1b\[2Kalpha/);
  assert.match(output, /\x1b\[2Kbravo!/);
  assert.match(output, /\x1b\[6C/);
});

test("terminal block patch clears rows removed by a shorter redraw", () => {
  const output = terminalBlockPatchSequence(
    {
      lines: ["alpha", "bravo", "charlie"],
      cursorLine: 2,
      cursorColumn: 0,
      width: 80,
    },
    {
      lines: ["alpha"],
      cursorLine: 0,
      cursorColumn: 1,
    },
  );

  assert.doesNotMatch(output, /\x1b\[J/);
  assert.equal((output.match(/\x1b\[2K/g) ?? []).length, 2);
  assert.match(output, /\x1b\[1C/);
});
