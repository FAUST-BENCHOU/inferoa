import test from "node:test";
import assert from "node:assert/strict";
import {
  createPromptQueueState,
  enqueuePromptForSubmission,
  promptQueuePreviewLines,
  shiftPromptForSubmission,
} from "../src/tui/prompt-queue.js";

test("busy prompts remain queued and render only when their run starts", () => {
  let state = createPromptQueueState();

  const first = enqueuePromptForSubmission(state, "first prompt", { busy: false });
  state = first.state;
  assert.equal(first.renderSubmittedPromptNow, true);

  const queued = enqueuePromptForSubmission(state, "second prompt", { busy: true });
  state = queued.state;
  assert.equal(queued.renderSubmittedPromptNow, false);
  assert.deepEqual(promptQueuePreviewLines(state), ["second prompt"]);

  const firstRun = shiftPromptForSubmission(state);
  assert.equal(firstRun.item?.prompt, "first prompt");
  assert.equal(firstRun.item?.renderPromptAtSubmission, false);

  const secondRun = shiftPromptForSubmission(firstRun.state);
  assert.equal(secondRun.item?.prompt, "second prompt");
  assert.equal(secondRun.item?.renderPromptAtSubmission, true);
  assert.deepEqual(promptQueuePreviewLines(secondRun.state), []);
});

test("hidden prompts submit without transcript rendering or queue preview", () => {
  let state = createPromptQueueState();

  const hiddenIdle = enqueuePromptForSubmission(state, "internal plan continuation", { busy: false, renderPrompt: false });
  state = hiddenIdle.state;
  assert.equal(hiddenIdle.renderSubmittedPromptNow, false);
  assert.deepEqual(promptQueuePreviewLines(state), []);

  const hiddenBusy = enqueuePromptForSubmission(state, "internal approved plan execution", { busy: true, renderPrompt: false });
  state = hiddenBusy.state;
  assert.equal(hiddenBusy.renderSubmittedPromptNow, false);
  assert.deepEqual(promptQueuePreviewLines(state), []);

  const first = shiftPromptForSubmission(state);
  assert.equal(first.item?.prompt, "internal plan continuation");
  assert.equal(first.item?.renderPromptAtSubmission, false);
  const second = shiftPromptForSubmission(first.state);
  assert.equal(second.item?.prompt, "internal approved plan execution");
  assert.equal(second.item?.renderPromptAtSubmission, false);
});

test("queued prompts preserve loop origin metadata for submission", () => {
  let state = createPromptQueueState();

  const queued = enqueuePromptForSubmission(state, "repeat prompt", { busy: true, renderPrompt: true, origin: "loop" });
  state = queued.state;

  const next = shiftPromptForSubmission(state);
  assert.equal(next.item?.prompt, "repeat prompt");
  assert.equal(next.item?.origin, "loop");
});
