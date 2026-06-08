import test from "node:test";
import assert from "node:assert/strict";
import { RESUME_SESSION_PAGE_SIZE, resumeSessionPage } from "../src/tui/session-picker.js";

const sessions = Array.from({ length: 14 }, (_, index) => `session-${index + 1}`);

test("resume session picker shows at most five sessions per page", () => {
  const first = resumeSessionPage(sessions, 0);
  const second = resumeSessionPage(sessions, 1);
  const last = resumeSessionPage(sessions, 2);

  assert.equal(RESUME_SESSION_PAGE_SIZE, 5);
  assert.deepEqual(first.items, sessions.slice(0, 5));
  assert.deepEqual(second.items, sessions.slice(5, 10));
  assert.deepEqual(last.items, sessions.slice(10, 14));
  assert.equal(first.totalPages, 3);
});

test("resume session picker clamps out-of-range pages", () => {
  assert.equal(resumeSessionPage(sessions, -4).pageIndex, 0);
  assert.equal(resumeSessionPage(sessions, 99).pageIndex, 2);
  assert.equal(resumeSessionPage([], 5).pageIndex, 0);
});
