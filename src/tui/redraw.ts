import { ansi } from "./ansi.js";

export interface TerminalBlockRenderState {
  lines: readonly string[];
  cursorLine: number;
  cursorColumn: number;
  width: number;
}

export interface TerminalBlockRenderTarget {
  lines: readonly string[];
  cursorLine: number;
  cursorColumn: number;
}

const CLEAR_LINE = "\x1b[2K";

export function terminalBlockPatchSequence(previous: TerminalBlockRenderState, next: TerminalBlockRenderTarget): string {
  const lineCount = Math.max(previous.lines.length, next.lines.length);
  const chunks = [ansi.hideCursor, cursorVertical(-previous.cursorLine)];

  for (let index = 0; index < lineCount; index += 1) {
    const nextLine = next.lines[index] ?? "";
    chunks.push("\r");
    if ((previous.lines[index] ?? "") !== nextLine) {
      chunks.push(CLEAR_LINE, nextLine);
    }
    if (index < lineCount - 1) {
      chunks.push("\n");
    }
  }

  chunks.push(cursorVertical(-(lineCount - 1 - next.cursorLine)), "\r", cursorHorizontal(next.cursorColumn), ansi.showCursor);
  return chunks.join("");
}

function cursorVertical(delta: number): string {
  if (delta > 0) {
    return `\x1b[${delta}B`;
  }
  if (delta < 0) {
    return `\x1b[${Math.abs(delta)}A`;
  }
  return "";
}

function cursorHorizontal(column: number): string {
  const safeColumn = Math.max(0, Math.trunc(column));
  return safeColumn > 0 ? `\x1b[${safeColumn}C` : "";
}
