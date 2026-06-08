import { stdout } from "node:process";

export const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  inverse: "\x1b[7m",
  clear: "\x1b[2J\x1b[3J\x1b[H",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
};

export function fg256(code: number, text: string): string {
  return `\x1b[38;5;${code}m${text}${ansi.reset}`;
}

export function bg256(code: number, text: string): string {
  const bg = `\x1b[48;5;${code}m`;
  return `${bg}${text.replaceAll(ansi.reset, `${ansi.reset}${bg}`)}${ansi.reset}`;
}

export function styled(open: string, text: string): string {
  return `${open}${text}${ansi.reset}`;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function visibleWidth(text: string): number {
  return [...stripAnsi(text)].reduce((width, char) => width + charWidth(char), 0);
}

export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (visibleWidth(text) <= width) {
    return text;
  }
  const target = Math.max(1, width - 1);
  let out = "";
  let inEscape = false;
  let count = 0;
  for (const char of text) {
    if (char === "\x1b") {
      inEscape = true;
      out += char;
      continue;
    }
    if (inEscape) {
      out += char;
      if (char === "m") {
        inEscape = false;
      }
      continue;
    }
    const width = charWidth(char);
    if (count + width > target) {
      break;
    }
    out += char;
    count += width;
  }
  return `${out}${ansi.reset}…`;
}

export function padRight(text: string, width: number): string {
  const clipped = truncateToWidth(text, width);
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

export function center(text: string, width: number): string {
  const clipped = truncateToWidth(text, width);
  const pad = Math.max(0, width - visibleWidth(clipped));
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + clipped + " ".repeat(pad - left);
}

export function centerBlock(lines: string[], width = terminalWidth()): string[] {
  return lines.map((line) => center(line, width));
}

export function bgLine(code: number, text = "", width = terminalWidth()): string {
  return bg256(code, padRight(text, width));
}

export function frame(title: string, body: string[], width = terminalWidth()): string[] {
  const boxWidth = Math.max(28, Math.min(width - 2, 110));
  const inner = boxWidth - 2;
  const cleanTitle = ` ${title} `;
  const left = Math.max(1, Math.floor((inner - visibleWidth(cleanTitle)) / 2));
  const right = Math.max(0, inner - left - visibleWidth(cleanTitle));
  const top = `${fg256(39, "╭")}${fg256(243, "─".repeat(left))}${styled(ansi.bold, fg256(248, cleanTitle))}${fg256(243, "─".repeat(right))}${fg256(39, "╮")}`;
  const rows = body.map((line) => `${fg256(39, "│")}${padRight(line, inner)}${fg256(39, "│")}`);
  const bottom = `${fg256(39, "╰")}${fg256(243, "─".repeat(inner))}${fg256(39, "╯")}`;
  return [top, ...rows, bottom];
}

export function terminalWidth(): number {
  return stdout.columns && stdout.columns > 0 ? stdout.columns : 100;
}

export function terminalHeight(): number {
  return stdout.rows && stdout.rows > 0 ? stdout.rows : 30;
}

export function gradientText(text: string, phase = 0): string {
  const ramp = [199, 171, 135, 99, 75, 51, 87, 45, 159];
  const chars = [...text];
  return chars
    .map((char, index) => {
      if (char === " ") {
        return char;
      }
      const pos = (index / Math.max(1, chars.length - 1) + phase) % 1;
      const color = ramp[Math.floor(pos * ramp.length) % ramp.length] ?? ramp[0]!;
      return fg256(color, char);
    })
    .join("");
}

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) {
    return 0;
  }
  if (code < 32 || (code >= 0x7f && code < 0xa0)) {
    return 0;
  }
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) {
    return 2;
  }
  return 1;
}
