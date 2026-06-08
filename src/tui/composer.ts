import { ansi, bgLine, center, fg256, padRight, truncateToWidth, visibleWidth } from "./ansi.js";

export interface ComposerSuggestion {
  label: string;
  description: string;
  kind: "command" | "skill";
}

export interface ComposerRenderOptions {
  buffer: string;
  cursor: number;
  items: ComposerSuggestion[];
  selected: number;
  width: number;
  height?: number;
  panel?: ComposerPanel;
  activity?: string;
  queue?: string[];
  footer?: string;
  metadataLeft?: string;
  metadataRight?: string;
  placeholder?: string;
}

export interface WelcomeComposerRenderOptions extends ComposerRenderOptions {
  workspaceRoot: string;
  mode: string;
  model: string;
  contextWindow?: number;
  codeIntelligence?: string;
}

export interface ComposerRenderResult {
  lines: string[];
  cursorLine: number;
  cursorColumn: number;
  activityLine?: number;
  codeIntelligenceLine?: number;
  codeIntelligenceColumn?: number;
  codeIntelligenceWidth?: number;
}

export interface ComposerPanel {
  lines: string[];
  cursorLine?: number;
  cursorColumn?: number;
}

interface LineSegment {
  text: string;
  start: number;
  end: number;
}

interface Viewport {
  text: string;
  cursorColumn: number;
}

export function insertComposerText(buffer: string, cursor: number, text: string): { buffer: string; cursor: number } {
  const safeCursor = clampCursor(buffer, cursor);
  return {
    buffer: `${buffer.slice(0, safeCursor)}${text}${buffer.slice(safeCursor)}`,
    cursor: safeCursor + text.length,
  };
}

export function insertComposerNewline(buffer: string, cursor: number): { buffer: string; cursor: number } {
  return insertComposerText(buffer, cursor, "\n");
}

export function backspaceComposer(buffer: string, cursor: number): { buffer: string; cursor: number } {
  const safeCursor = clampCursor(buffer, cursor);
  if (safeCursor <= 0) {
    return { buffer, cursor: 0 };
  }
  const nextCursor = previousCharBoundary(buffer, safeCursor);
  return {
    buffer: `${buffer.slice(0, nextCursor)}${buffer.slice(safeCursor)}`,
    cursor: nextCursor,
  };
}

export function moveComposerCursorLeft(buffer: string, cursor: number): number {
  return previousCharBoundary(buffer, clampCursor(buffer, cursor));
}

export function moveComposerCursorRight(buffer: string, cursor: number): number {
  return nextCharBoundary(buffer, clampCursor(buffer, cursor));
}

export function moveComposerCursorHome(buffer: string, cursor: number): number {
  const lines = splitLines(buffer);
  const segment = segmentForCursor(lines, clampCursor(buffer, cursor));
  return segment.start;
}

export function moveComposerCursorEnd(buffer: string, cursor: number): number {
  const lines = splitLines(buffer);
  const segment = segmentForCursor(lines, clampCursor(buffer, cursor));
  return segment.end;
}

export function clampCursor(buffer: string, cursor: number): number {
  if (!Number.isFinite(cursor)) {
    return buffer.length;
  }
  const clamped = Math.max(0, Math.min(buffer.length, Math.floor(cursor)));
  const boundaries = charBoundaries(buffer);
  let best = 0;
  for (const boundary of boundaries) {
    if (boundary > clamped) {
      break;
    }
    best = boundary;
  }
  return best;
}

export function renderComposerSurface(options: ComposerRenderOptions): ComposerRenderResult {
  const width = Math.max(20, options.width);
  const contentWidth = Math.max(1, width - 4);
  const lines: string[] = [];
  let cursorLine = 0;
  let cursorColumn = 2;
  let activityLine: number | undefined;
  let panelCursorLine: number | undefined;
  let panelCursorColumn: number | undefined;

  if (options.panel?.lines.length) {
    const panelStartLine = lines.length;
    lines.push(...options.panel.lines.map((line) => truncateToWidth(line, width)));
    if (options.panel.cursorLine !== undefined && options.panel.cursorColumn !== undefined) {
      panelCursorLine = panelStartLine + options.panel.cursorLine;
      panelCursorColumn = options.panel.cursorColumn;
    }
  }

  if (options.activity || options.queue?.length) {
    lines.push("");
    if (options.activity) {
      activityLine = lines.length;
      lines.push(renderComposerActivityLine(options.activity, width));
      lines.push("");
    }
    if (options.queue?.length) {
      lines.push(`  ${fg256(250, "Messages queued after current loop")} ${fg256(244, "(esc interrupts current loop)")}`);
      options.queue.forEach((prompt, index) => {
        const branch = index === options.queue!.length - 1 ? "╰" : "├";
        lines.push(`  ${fg256(238, branch)} ${fg256(244, truncateToWidth(prompt, Math.max(20, width - 6)))}`);
      });
    }
    lines.push("");
  }

  const inputStartLine = lines.length;
  lines.push(bgLine(236, "", width));

  if (options.buffer.length === 0) {
    const placeholder = fg256(244, options.placeholder ?? "Ask Inferoa to inspect, edit, test, or explain");
    lines.push(bgLine(236, `›  ${placeholder}`, width));
    cursorLine = inputStartLine + 1;
    cursorColumn = 2;
  } else {
    const cursor = clampCursor(options.buffer, options.cursor);
    const segments = splitLines(options.buffer);
    const active = segmentForCursor(segments, cursor);
    for (const [index, segment] of segments.entries()) {
      const prefix = index === 0 ? "› " : "  ";
      if (segment === active) {
        const localCursor = cursor - segment.start;
        const view = lineViewport(segment.text, localCursor, contentWidth);
        cursorLine = inputStartLine + 1 + index;
        cursorColumn = visibleWidth(prefix) + view.cursorColumn;
        lines.push(bgLine(236, `${prefix}${view.text}`, width));
      } else {
        const view = lineViewport(segment.text, 0, contentWidth);
        lines.push(bgLine(236, `${prefix}${view.text}`, width));
      }
    }
  }

  lines.push(bgLine(236, "", width));

  if (options.metadataLeft || options.metadataRight || options.footer) {
    lines.push(renderComposerMetadataLine(composerFooterMetadata(options.footer, options.metadataLeft), options.metadataRight, width));
  }
  if (options.items.length) {
    lines.push(...options.items.map((item, index) => renderComposerSuggestion(item, index === options.selected, width)));
    const hint = options.items[0]?.kind === "skill"
      ? "tab insert skill · enter open/submit · ↑/↓ choose · esc clear"
      : "tab complete · enter open/submit · ↑/↓ choose · esc clear";
    lines.push(fg256(244, `  ${hint}`));
  }

  return {
    lines,
    cursorLine: panelCursorLine ?? cursorLine,
    cursorColumn: Math.max(0, Math.min(width - 1, panelCursorColumn ?? cursorColumn)),
    activityLine,
  };
}

export function renderComposerActivityLine(activity: string, width: number): string {
  return `  ${truncateToWidth(activity, Math.max(20, Math.max(20, width) - 2))}`;
}

export function renderWelcomeComposerSurface(options: WelcomeComposerRenderOptions): ComposerRenderResult {
  const width = Math.max(36, options.width);
  const height = Math.max(12, options.height ?? 30);
  const maxBoxWidth = Math.max(28, width - 8);
  const boxWidth = Math.max(28, Math.min(Math.max(46, Math.floor(width * 0.5)), 78, maxBoxWidth));
  const left = Math.max(0, Math.floor((width - boxWidth) / 2));
  const contentWidth = Math.max(1, boxWidth - 5);
  const mark = renderWelcomeMark();
  const inputSegments = options.buffer.length === 0 ? splitLines("") : splitLines(options.buffer);
  const extraRows = options.items.length ? Math.min(5, options.items.length) : 1;
  const minInputRowsBeforeMeta = 3;
  const inputBoxRows = Math.max(5, 1 + inputSegments.length + 2);
  const naturalHeight = mark.length + 1 + inputBoxRows + 1 + extraRows;
  const topPad = Math.max(1, Math.floor(Math.max(0, height - naturalHeight) * 0.42));
  const lines: string[] = [];
  for (let index = 0; index < topPad; index += 1) {
    lines.push("");
  }
  for (const line of mark) {
    lines.push(centerLine(line, width));
  }
  lines.push("");

  const inputStartLine = lines.length;
  const rail = fg256(75, "▌");
  let inputRowsBeforeMeta = 0;
  const pushInputLine = (text = "") => {
    lines.push(`${" ".repeat(left)}${rail}${bgLine(236, text, boxWidth - 1)}`);
    inputRowsBeforeMeta += 1;
  };
  pushInputLine();
  let cursorLine = inputStartLine + 1;
  let cursorColumn = left + 3;
  if (options.buffer.length === 0) {
    const placeholder = fg256(244, options.placeholder ?? "Ask Inferoa");
    pushInputLine(`  ${placeholder}`);
  } else {
    const cursor = clampCursor(options.buffer, options.cursor);
    const active = segmentForCursor(inputSegments, cursor);
    for (const [index, segment] of inputSegments.entries()) {
      const prefix = index === 0 ? "  " : "  ";
      if (segment === active) {
        const localCursor = cursor - segment.start;
        const view = lineViewport(segment.text, localCursor, contentWidth);
        cursorLine = inputStartLine + 1 + index;
        cursorColumn = left + 1 + visibleWidth(prefix) + view.cursorColumn;
        pushInputLine(`${prefix}${view.text}`);
      } else {
        const view = lineViewport(segment.text, 0, contentWidth);
        pushInputLine(`${prefix}${view.text}`);
      }
    }
  }
  while (inputRowsBeforeMeta < minInputRowsBeforeMeta) {
    pushInputLine();
  }
  lines.push(`${" ".repeat(left)}${rail}${bgLine(236, welcomeMetaLine(options, boxWidth - 1), boxWidth - 1)}`);
  lines.push(`${" ".repeat(left)}${rail}${bgLine(236, "", boxWidth - 1)}`);
  lines.push("");
  let codeIntelligenceLine: number | undefined;
  let codeIntelligenceColumn: number | undefined;
  let codeIntelligenceWidth: number | undefined;
  if (options.items.length) {
    lines.push(...options.items.slice(0, 5).map((item, index) => `${" ".repeat(left + 1)}${renderComposerSuggestion(item, index === options.selected, boxWidth - 1)}`));
  } else {
    const affordance = welcomeAffordanceLine(options, width, left, boxWidth);
    codeIntelligenceLine = lines.length;
    codeIntelligenceColumn = affordance.statusColumn;
    codeIntelligenceWidth = affordance.statusWidth;
    lines.push(affordance.line);
  }
  return { lines, cursorLine, cursorColumn: Math.max(0, Math.min(width - 1, cursorColumn)), codeIntelligenceLine, codeIntelligenceColumn, codeIntelligenceWidth };
}

function renderWelcomeMark(): string[] {
  const logo = [
    " ██╗███╗   ██╗███████╗███████╗██████╗  ██████╗  █████╗ ",
    " ██║████╗  ██║██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔══██╗",
    " ██║██╔██╗ ██║█████╗  █████╗  ██████╔╝██║   ██║███████║",
    " ██║██║╚██╗██║██╔══╝  ██╔══╝  ██╔══██╗██║   ██║██╔══██║",
    " ██║██║ ╚████║██║     ███████╗██║  ██║╚██████╔╝██║  ██║",
    " ╚═╝╚═╝  ╚═══╝╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝",
  ];
  return [
    ...logo.map((line, index) => `${ansi.bold}${fg256(index < 2 ? 244 : 252, line)}${ansi.reset}`),
    center(fg256(244, "inference optimized agent harness"), visibleWidth(logo[0] ?? "")),
  ];
}

function welcomeMetaLine(options: WelcomeComposerRenderOptions, width: number): string {
  const modelText = compactModelLabel(options.model);
  const contextText = options.contextWindow ? compactTokenWindow(options.contextWindow) : undefined;
  const left = [fg256(252, modelText), ...(contextText ? [fg256(244, contextText)] : [])].join(` ${fg256(244, "·")} `);
  return renderComposerMetadataLine(left, undefined, width);
}

function welcomeAffordanceLine(options: WelcomeComposerRenderOptions, width: number, inputLeft: number, inputWidth: number): { line: string; statusColumn?: number; statusWidth?: number } {
  const commands = `${fg256(39, "/")} ${fg256(250, "commands")}   ${fg256(39, "$")} ${fg256(250, "skills")}`;
  const containerLeft = Math.max(0, Math.min(width - 1, inputLeft + 3));
  const containerRight = Math.max(containerLeft, Math.min(width, inputLeft + inputWidth));
  const containerWidth = Math.max(0, containerRight - containerLeft);
  const commandText = truncateToWidth(commands, containerWidth);
  const commandWidth = visibleWidth(commandText);
  const linePrefix = " ".repeat(containerLeft);
  if (!options.codeIntelligence || containerWidth <= 0) {
    return { line: `${linePrefix}${commandText}` };
  }
  const gap = 3;
  const minStatusWidth = 8;
  const statusWidth = containerWidth - commandWidth - gap;
  if (statusWidth < minStatusWidth) {
    return { line: `${linePrefix}${commandText}` };
  }
  const statusColumn = containerRight - statusWidth;
  const status = padRight(fg256(244, truncateToWidth(options.codeIntelligence, statusWidth)), statusWidth);
  return {
    line: `${linePrefix}${commandText}${" ".repeat(Math.max(gap, statusColumn - containerLeft - commandWidth))}${status}`,
    statusColumn,
    statusWidth,
  };
}

export function compactModelLabel(model: string): string {
  const clean = model.trim();
  if (!clean || clean === "unconfigured") {
    return "unconfigured";
  }
  return clean.split("/").filter(Boolean).at(-1) ?? clean;
}

export function compactTokenWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return "ctx ?";
  }
  if (tokens >= 1_000_000) {
    return `${formatCompact(tokens / 1_000_000)}M`;
  }
  if (tokens >= 1_000) {
    return `${formatCompact(tokens / 1_000)}k`;
  }
  return String(Math.round(tokens));
}

function formatCompact(value: number): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function centerLine(text: string, width: number): string {
  return center(text, width);
}

function renderComposerSuggestion(item: ComposerSuggestion, active: boolean, width: number): string {
  const marker = active ? fg256(75, "›") : " ";
  const labelWidth = item.kind === "command" ? 18 : 28;
  const label = padRight(truncateToWidth(item.label, labelWidth), labelWidth);
  const descriptionWidth = Math.max(8, width - labelWidth - 6);
  const text = `${marker} ${active ? fg256(87, label) : fg256(250, label)} ${fg256(244, truncateToWidth(item.description, descriptionWidth))}`;
  return padRight(text, width);
}

function renderComposerMetadataLine(left: string, right: string | undefined, width: number): string {
  const available = Math.max(0, width - 2);
  const cleanRight = right?.trim() ? right.trim() : undefined;
  if (!cleanRight) {
    return `  ${truncateToWidth(left, available)}`;
  }
  const rightWidth = visibleWidth(cleanRight);
  if (rightWidth >= available - 2) {
    return `  ${truncateToWidth(cleanRight, available)}`;
  }
  const leftWidth = Math.max(0, available - rightWidth - 2);
  const clippedLeft = truncateToWidth(left, leftWidth);
  const gap = Math.max(2, available - visibleWidth(clippedLeft) - rightWidth);
  return `  ${clippedLeft}${" ".repeat(gap)}${cleanRight}`;
}

function composerFooterMetadata(footer: string | undefined, metadataLeft: string | undefined): string {
  const separator = metadataSeparator();
  const footerParts = splitFooterParts(footer);
  const worked = footerParts.find((part) => stripAnsiLocal(part).startsWith("worked for"));
  const primaryFooter = footerParts.filter((part) => part !== worked).join(separator);
  return [primaryFooter, metadataLeft, worked].filter((part): part is string => Boolean(part?.trim())).join(separator);
}

function splitFooterParts(footer: string | undefined): string[] {
  return footer?.split(metadataSeparator()).filter((part) => part.trim()) ?? [];
}

function metadataSeparator(): string {
  return ` ${fg256(238, "·")} `;
}

function stripAnsiLocal(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").trim();
}

function splitLines(buffer: string): LineSegment[] {
  if (!buffer) {
    return [{ text: "", start: 0, end: 0 }];
  }
  const lines: LineSegment[] = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === "\n") {
      lines.push({ text: buffer.slice(start, index), start, end: index });
      start = index + 1;
    }
  }
  lines.push({ text: buffer.slice(start), start, end: buffer.length });
  return lines;
}

function segmentForCursor(lines: LineSegment[], cursor: number): LineSegment {
  return lines.find((line) => cursor >= line.start && cursor <= line.end) ?? lines[lines.length - 1]!;
}

function lineViewport(text: string, cursor: number, width: number): Viewport {
  const safeCursor = clampCursor(text, cursor);
  const chars = Array.from(text);
  const boundaries = charBoundaries(text);
  const cursorCharIndex = boundaries.findIndex((boundary) => boundary === safeCursor);
  const targetIndex = cursorCharIndex >= 0 ? cursorCharIndex : chars.length;

  let startIndex = 0;
  while (startIndex < targetIndex && visibleWidth(chars.slice(startIndex, targetIndex).join("")) > Math.max(0, width - 1)) {
    startIndex += 1;
  }

  let out = "";
  for (let index = startIndex; index < chars.length; index += 1) {
    const next = `${out}${chars[index]}`;
    if (visibleWidth(next) > width) {
      break;
    }
    out = next;
  }

  return {
    text: out,
    cursorColumn: visibleWidth(chars.slice(startIndex, targetIndex).join("")),
  };
}

function previousCharBoundary(buffer: string, cursor: number): number {
  let previous = 0;
  for (const boundary of charBoundaries(buffer)) {
    if (boundary >= cursor) {
      return previous;
    }
    previous = boundary;
  }
  return previous;
}

function nextCharBoundary(buffer: string, cursor: number): number {
  for (const boundary of charBoundaries(buffer)) {
    if (boundary > cursor) {
      return boundary;
    }
  }
  return buffer.length;
}

function charBoundaries(buffer: string): number[] {
  const boundaries = [0];
  let offset = 0;
  for (const char of buffer) {
    offset += char.length;
    boundaries.push(offset);
  }
  return boundaries;
}
