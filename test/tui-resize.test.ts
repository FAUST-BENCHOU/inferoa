import test from "node:test";
import assert from "node:assert/strict";
import { composerEraseRowsForResize } from "../src/tui/resize.js";

test("composer resize erase accounts for wrapped old full-width rows", () => {
  assert.equal(composerEraseRowsForResize({
    renderedCursorLine: 1,
    renderedCursorColumn: 2,
    renderedWidth: 200,
    terminalWidth: 100,
  }), 2);
});

test("composer resize erase stays precise when width does not wrap old rows", () => {
  assert.equal(composerEraseRowsForResize({
    renderedCursorLine: 1,
    renderedCursorColumn: 2,
    renderedWidth: 100,
    terminalWidth: 200,
  }), 1);
});
