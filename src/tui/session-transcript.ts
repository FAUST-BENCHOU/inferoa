import type { SessionEvent } from "../types.js";
import type { SessionStore } from "../session/store.js";
import { bgLine, truncateToWidth, visibleWidth } from "./ansi.js";
import { renderMarkdown } from "./markdown.js";
import { renderToolCards } from "./tool-renderer.js";
import { withConversationGap } from "./transcript-spacing.js";

export function renderSessionTranscript(events: readonly SessionEvent[], width = 100, store?: SessionStore): string {
  const safeWidth = Math.max(20, width);
  const blocks: string[] = [];
  const renderedToolCallIds = new Set<string>();

  for (const event of events) {
    if (!isVisibleTranscriptEvent(event)) {
      continue;
    }
    if (event.type === "user.prompt") {
      const prompt = stringField(event.data.prompt);
      if (prompt !== undefined) {
        blocks.push(renderPromptBlock(prompt, safeWidth));
      }
      continue;
    }
    if (event.type === "model.response.settled") {
      const content = stringField(event.data.content);
      if (content?.trim()) {
        blocks.push(renderMarkdown(content, { width: Math.max(20, safeWidth - 1) }));
      }
      continue;
    }
    if (event.type === "tool.result" && store) {
      const toolCallId = stringField(event.data.tool_call_id);
      const renderKey = toolCallId ?? `${event.run_id ?? "run"}:${event.id ?? renderedToolCallIds.size}`;
      if (renderedToolCallIds.has(renderKey)) {
        continue;
      }
      const lines = renderToolCards(toolEventsForResult(events, event, toolCallId), store, { collapseCompact: false });
      if (lines.length) {
        blocks.push(lines.join("\n"));
        renderedToolCallIds.add(renderKey);
      }
    }
  }

  return blocks.map((block) => withConversationGap(block)).join("");
}

function isVisibleTranscriptEvent(event: SessionEvent): boolean {
  if (event.data.visibility === "internal" || event.data.visibility === "hidden") {
    return false;
  }
  if (event.data.request_class === "reflection" || event.data.request_class === "verification") {
    return false;
  }
  if (event.data.control_plane === true) {
    return false;
  }
  return true;
}

function toolEventsForResult(events: readonly SessionEvent[], resultEvent: SessionEvent, toolCallId: string | undefined): SessionEvent[] {
  if (!toolCallId) {
    return [resultEvent];
  }
  return events.filter((event) => {
    if (!isVisibleTranscriptEvent(event)) {
      return false;
    }
    if (event.run_id !== resultEvent.run_id) {
      return false;
    }
    if (event.type !== "tool.call" && event.type !== "tool.result") {
      return false;
    }
    return stringField(event.data.tool_call_id) === toolCallId;
  });
}

function renderPromptBlock(prompt: string, width: number): string {
  const maxPromptLines = 10;
  const rawLines = prompt.split(/\r?\n/);
  const promptLines = rawLines.slice(0, maxPromptLines);
  if (rawLines.length > maxPromptLines) {
    promptLines.push(`... ${rawLines.length - maxPromptLines} more lines`);
  }
  const body = promptLines.length ? promptLines : [""];
  return [
    bgLine(236, "", width),
    ...body.map((line, index) => {
      const prefix = index === 0 ? "› " : "  ";
      return bgLine(236, `${prefix}${truncateToWidth(line, Math.max(10, width - visibleWidth(prefix) - 1))}`, width);
    }),
    bgLine(236, "", width),
  ].join("\n");
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
