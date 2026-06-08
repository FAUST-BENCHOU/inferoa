import { ansi, fg256, truncateToWidth, visibleWidth } from "./ansi.js";

interface MarkdownRendererOptions {
  width?: number;
  partialFlushColumns?: number;
}

export class MarkdownStreamRenderer {
  private buffer = "";
  private inFence = false;
  private readonly width: number;
  private readonly partialFlushColumns: number;

  constructor(options: MarkdownRendererOptions = {}) {
    this.width = Math.max(24, options.width ?? 100);
    this.partialFlushColumns = Math.max(16, options.partialFlushColumns ?? Math.min(96, Math.floor(this.width * 0.72)));
  }

  write(chunk: string): string {
    this.buffer += chunk;
    let out = "";
    while (this.buffer.includes("\n")) {
      const index = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, index + 1);
      this.buffer = this.buffer.slice(index + 1);
      out += this.renderLine(line);
    }
    if (this.shouldFlushPartial(chunk)) {
      out += this.renderLine(`${this.buffer.trimEnd()}\n`);
      this.buffer = "";
    }
    return out;
  }

  flush(): string {
    if (!this.buffer) {
      return "";
    }
    const out = this.renderLine(this.buffer);
    this.buffer = "";
    return out;
  }

  private renderLine(line: string): string {
    const newline = line.endsWith("\n") ? "\n" : "";
    const raw = newline ? line.slice(0, -1) : line;
    if (/^\s*```/.test(raw)) {
      this.inFence = !this.inFence;
      const label = raw.replace(/^\s*```/, "").trim();
      return `${fg256(75, label ? `╭─ ${label}` : "╭─ code")}${newline}`;
    }
    if (this.inFence) {
      return `${fg256(250, truncateToWidth(raw, this.width))}${newline}`;
    }
    if (raw.trim() === "") {
      return newline;
    }
    const rendered = this.renderBlock(raw);
    return `${rendered.join("\n")}${newline}`;
  }

  private renderBlock(raw: string): string[] {
    const heading = /^(#{1,6})\s+(.+)$/.exec(raw);
    if (heading) {
      return wrapLine(heading[2] ?? "", this.width, "").map((line) => `${ansi.bold}${fg256(75, line)}${ansi.reset}`);
    }
    const task = /^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/.exec(raw);
    if (task) {
      const marker = (task[2] ?? " ").trim() ? fg256(48, "[x]") : fg256(244, "[ ]");
      return renderWrappedInline(`${task[1] ?? ""}${marker} ${task[3] ?? ""}`, this.width, `${task[1] ?? ""}    `);
    }
    const bullet = /^(\s*)[-*]\s+(.+)$/.exec(raw);
    if (bullet) {
      const prefix = `${bullet[1] ?? ""}${fg256(75, "•")} `;
      return renderWrappedInline(`${prefix}${bullet[2] ?? ""}`, this.width, `${bullet[1] ?? ""}  `);
    }
    const ordered = /^(\s*\d+\.)\s+(.+)$/.exec(raw);
    if (ordered) {
      const prefix = `${fg256(75, ordered[1] ?? "1.")} `;
      return renderWrappedInline(`${prefix}${ordered[2] ?? ""}`, this.width, " ".repeat(visibleWidth(ordered[1] ?? "1.") + 1));
    }
    const quote = /^\s*>\s?(.+)$/.exec(raw);
    if (quote) {
      const prefix = `${fg256(75, "▌")} `;
      return renderWrappedInline(`${prefix}${fg256(244, quote[1] ?? "")}`, this.width, "  ");
    }
    if (looksLikeTable(raw)) {
      return renderTableLine(raw, this.width);
    }
    return renderWrappedInline(raw, this.width);
  }

  private shouldFlushPartial(chunk: string): boolean {
    if (!this.buffer) {
      return false;
    }
    if (this.buffer.includes("|")) {
      return false;
    }
    if (visibleWidth(this.buffer) >= this.partialFlushColumns) {
      return true;
    }
    if (this.inFence) {
      return false;
    }
    return visibleWidth(this.buffer) >= 36 && /[\s,.;:!?，。；：！？)]$/.test(chunk);
  }
}

export function renderMarkdown(text: string, options: MarkdownRendererOptions = {}): string {
  const renderer = new MarkdownStreamRenderer(options);
  return renderer.write(text) + renderer.flush();
}

function renderInline(text: string): string {
  const rendered = text
    .replace(/`([^`]+)`/g, (_, code: string) => fg256(222, code))
    .replace(/\*\*([^*]+)\*\*/g, (_, bold: string) => `${ansi.bold}${fg256(255, bold)}${ansi.reset}`)
    .replace(/(^|[^*])\*([^*\n]+)\*/g, (_, prefix: string, italic: string) => `${prefix}${ansi.italic}${fg256(252, italic)}${ansi.reset}`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => `${fg256(75, label)} ${fg256(244, url)}`);
  return stripDanglingInlineMarkers(rendered);
}

function stripDanglingInlineMarkers(text: string): string {
  return text.replace(/\*\*/g, "").replace(/__/g, "");
}

function fgInline(code: number, text: string): string {
  const open = `\x1b[38;5;${code}m`;
  return `${open}${text.replaceAll(ansi.reset, `${ansi.reset}${open}`)}${ansi.reset}`;
}

function renderWrappedInline(text: string, width: number, continuationIndent = ""): string[] {
  return wrapLine(text, width, continuationIndent).map(renderInline);
}

function wrapLine(text: string, width: number, continuationIndent: string): string[] {
  if (/[\u3000-\u9fff]/.test(text)) {
    return wrapChars(text, width, continuationIndent);
  }
  const firstWidth = Math.max(12, width);
  const nextWidth = Math.max(12, width - visibleWidth(continuationIndent));
  const words = text.split(/(\s+)/).filter((part) => part.length > 0 && !/^\s+$/.test(part));
  const lines: string[] = [];
  let current = "";
  let currentWidth = firstWidth;
  for (const word of words) {
    const candidate = current ? `${current}${word.startsWith(" ") ? "" : " "}${word.trimStart()}` : word.trimStart();
    if (visibleWidth(candidate) <= currentWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = `${continuationIndent}${word.trimStart()}`;
      currentWidth = nextWidth + visibleWidth(continuationIndent);
      continue;
    }
    lines.push(truncateToWidth(word.trimStart(), currentWidth));
    current = "";
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function wrapChars(text: string, width: number, continuationIndent: string): string[] {
  const lines: string[] = [];
  let current = "";
  let first = true;
  for (const char of [...text]) {
    const limit = first ? width : width;
    if (visibleWidth(current + char) > limit && current) {
      lines.push(current);
      current = continuationIndent + char.trimStart();
      first = false;
      continue;
    }
    current += char;
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function looksLikeTable(raw: string): boolean {
  const cells = splitTableCells(raw);
  return cells.length >= 2 && (cells.every((cell) => /^:?-{3,}:?$/.test(cell)) || raw.includes("|"));
}

function renderTableLine(raw: string, width: number): string[] {
  const cells = splitTableCells(raw);
  const columnWidths = tableColumnWidths(cells.length, width);
  if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    const separatorWidth = columnWidths.reduce((total, columnWidth) => total + columnWidth, 0) + Math.max(0, cells.length - 1) * 3;
    return [fg256(238, "─".repeat(Math.min(width, Math.max(12, separatorWidth))))];
  }
  const wrapped = cells.map((cell, index) => wrapMarkdownCell(cell, columnWidths[index] ?? 12));
  const height = Math.max(1, ...wrapped.map((cell) => cell.length));
  return Array.from({ length: height }, (_, rowIndex) =>
    cells
      .map((_, index) => {
        const columnWidth = columnWidths[index] ?? 12;
        const rendered = renderInline(wrapped[index]?.[rowIndex] ?? "");
        const padded = padCell(rendered, columnWidth);
        return index === 0 ? fgInline(75, padded) : fgInline(250, padded);
      })
      .join(fg256(238, " │ ")),
  );
}

function tableColumnWidths(columnCount: number, width: number): number[] {
  const count = Math.max(1, columnCount);
  const separatorWidth = Math.max(0, count - 1) * 3;
  const available = Math.max(count * 6, width - separatorWidth);
  if (count === 1) {
    return [available];
  }
  if (count === 2) {
    const first = Math.min(32, Math.max(12, Math.floor(available * 0.4)));
    return [first, Math.max(12, available - first)];
  }
  const base = Math.max(8, Math.floor(available / count));
  const widths = Array.from({ length: count }, () => base);
  const last = count - 1;
  widths[last] = (widths[last] ?? base) + Math.max(0, available - base * count);
  return widths;
}

function wrapMarkdownCell(cell: string, width: number): string[] {
  const wholeBold = /^\*\*([^*]+)\*\*$/.exec(cell);
  if (wholeBold) {
    return wrapCellText(wholeBold[1] ?? "", width).map((line) => `**${line}**`);
  }
  const wholeCode = /^`([^`]+)`$/.exec(cell);
  if (wholeCode) {
    return wrapCellText(wholeCode[1] ?? "", width).map((line) => `\`${line}\``);
  }
  return wrapCellText(cell, width);
}

function wrapCellText(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [""];
  }
  if (/[\u3000-\u9fff]/.test(normalized)) {
    return wrapChars(normalized, safeWidth, "");
  }
  const lines: string[] = [];
  let current = "";
  for (const word of normalized.split(/\s+/).filter(Boolean)) {
    if (markdownVisibleWidth(word) > safeWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(...wrapChars(word, safeWidth, ""));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (markdownVisibleWidth(candidate) <= safeWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function markdownVisibleWidth(text: string): number {
  return visibleWidth(renderInline(text));
}

function padCell(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
}

function splitTableCells(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.includes("|")) {
    return [];
  }
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell, index, cells) => cell.length > 0 || index > 0 || cells.length > 2);
}
