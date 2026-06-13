export interface PromptQueueItem {
  prompt: string;
  renderPromptAtSubmission: boolean;
  origin?: "loop";
}

export type PromptQueueState = PromptQueueItem[];

export function createPromptQueueState(): PromptQueueState {
  return [];
}

export function enqueuePromptForSubmission(
  state: PromptQueueState,
  prompt: string,
  options: { busy: boolean; renderPrompt?: boolean; origin?: "loop" },
): { state: PromptQueueState; renderSubmittedPromptNow: boolean } {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { state, renderSubmittedPromptNow: false };
  }
  const renderPrompt = options.renderPrompt !== false;
  return {
    state: [...state, { prompt: trimmed, renderPromptAtSubmission: renderPrompt && options.busy, origin: options.origin }],
    renderSubmittedPromptNow: renderPrompt && !options.busy,
  };
}

export function shiftPromptForSubmission(state: PromptQueueState): { state: PromptQueueState; item?: PromptQueueItem } {
  const [item, ...rest] = state;
  return { state: rest, item };
}

export function promptQueuePreviewLines(state: PromptQueueState, limit = 4): string[] {
  const queued = state.filter((item) => item.renderPromptAtSubmission);
  const lines = queued.slice(0, limit).map((item) => item.prompt.replace(/\s+/g, " ").slice(0, 72));
  if (queued.length > limit) {
    lines.push(`... ${queued.length - limit} more`);
  }
  return lines;
}
