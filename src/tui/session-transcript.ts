import type { SessionEvent } from "../types.js";
import { bgLine, truncateToWidth, visibleWidth } from "./ansi.js";
import { renderMarkdown } from "./markdown.js";
import { withConversationGap } from "./transcript-spacing.js";

export function renderSessionTranscript(events: readonly SessionEvent[], width = 100): string {
  const safeWidth = Math.max(20, width);
  const blocks: string[] = [];

  for (const event of events) {
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
    }
  }

  return blocks.map((block) => withConversationGap(block)).join("");
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
