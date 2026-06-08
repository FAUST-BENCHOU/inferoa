import test from "node:test";
import assert from "node:assert/strict";
import { withConversationGap } from "../src/tui/transcript-spacing.js";

test("transcript blocks end with one blank line for readable chat spacing", () => {
  assert.equal(withConversationGap("prompt block"), "prompt block\n\n");
  assert.equal(withConversationGap("assistant response\n"), "assistant response\n\n");
  assert.equal(withConversationGap(""), "\n\n");
});
