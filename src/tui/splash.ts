import { ansi, fg256, padRight, terminalHeight, terminalWidth, visibleWidth } from "./ansi.js";

const TICK_MS = 33;
const SPLASH_MS = 1300;
const INFEROA_ROWS = [
  " ██╗███╗   ██╗███████╗███████╗██████╗  ██████╗  █████╗ ",
  " ██║████╗  ██║██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔══██╗",
  " ██║██╔██╗ ██║█████╗  █████╗  ██████╔╝██║   ██║███████║",
  " ██║██║╚██╗██║██╔══╝  ██╔══╝  ██╔══██╗██║   ██║██╔══██║",
  " ██║██║ ╚████║██║     ███████╗██║  ██║╚██████╔╝██║  ██║",
  " ╚═╝╚═╝  ╚═══╝╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝",
];

export { SPLASH_MS, TICK_MS };

export function renderInferoaSplash(elapsedMs: number, width = terminalWidth(), height = terminalHeight()): string[] {
  const w = Math.max(72, width);
  const h = Math.max(18, height);
  const phase = (elapsedMs / SPLASH_MS) % 1;
  const glow = pulseColor(phase);
  const logo = INFEROA_ROWS.map((row, index) => colorLogoRow(row, index === 0 || index === logoAccentRow(phase) ? glow : 75));
  const contentWidth = Math.max(...logo.map((line) => visibleWidth(line)));
  const meterWidth = Math.min(56, Math.max(30, Math.floor(contentWidth * 0.62)));
  const body = [
    ...logo,
    "",
    centerInline(logoMeter(phase, meterWidth), contentWidth),
    "",
    centerInline(fg256(244, "Inferoa · Inference-native Tokenmaxxing Agent Harness"), contentWidth),
  ];
  const top = Math.max(1, Math.floor((h - body.length) / 2));
  const left = Math.max(0, Math.floor((w - contentWidth) / 2));
  const lines: string[] = [];
  for (let y = 0; y < h; y += 1) {
    const line = body[y - top];
    lines.push(padRight(line === undefined ? "" : `${" ".repeat(left)}${line}`, w));
  }
  return lines;
}

function logoAccentRow(phase: number): number {
  return Math.min(INFEROA_ROWS.length - 1, Math.floor(phase * INFEROA_ROWS.length));
}

function pulseColor(phase: number): number {
  if (phase < 0.33) {
    return 252;
  }
  if (phase < 0.66) {
    return 75;
  }
  return 39;
}

function logoMeter(phase: number, width: number): string {
  const segment = Math.max(4, Math.floor(width * 0.24));
  const head = Math.floor(phase * (width + segment)) - segment;
  return Array.from({ length: width }, (_, index) => {
    const active = index >= head && index < head + segment;
    return fg256(active ? 39 : 237, active ? "━" : "─");
  }).join("");
}

function centerInline(text: string, width: number): string {
  const pad = Math.max(0, width - visibleWidth(text));
  return `${" ".repeat(Math.floor(pad / 2))}${text}`;
}

function colorLogoRow(row: string, textColor: number): string {
  return `${ansi.bold}${fg256(textColor, row)}${ansi.reset}`;
}
