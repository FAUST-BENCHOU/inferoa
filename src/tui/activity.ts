import { fg256, stripAnsi, truncateToWidth, visibleWidth } from "./ansi.js";
import { formatDuration } from "./cache-footer.js";

const ACTIVITY_FRAMES = {
  thinking: ["·", "•", "·"],
  goal: ["•", "·"],
  research: ["›", "›"],
  tool: ["•", "·"],
  retry: ["↻", "↺"],
  compression: ["▱", "▰"],
  context: ["·", "•"],
} as const;

export function renderActivityLine(label: string, elapsedMs: number, frameIndex: number, width: number): string {
  const safeWidth = Math.max(1, Math.trunc(width));
  const phase = activityPhase(label);
  const frames = ACTIVITY_FRAMES[phase];
  const glyph = frames[frameIndex % frames.length] ?? frames[0]!;
  const glyphColor = phase === "retry" ? 252 : 244;
  const elapsed = formatDuration(elapsedMs);
  const suffix = ` ${elapsed}`;
  const normalized = label.replace(/\s+/g, " ").trim() || "Working";
  let room = Math.max(0, safeWidth - visibleWidth(glyph) - visibleWidth(suffix) - 1);
  let labelText = plainTruncateToWidth(normalized, room);
  let body = labelText ? ` ${fg256(250, labelText)}` : "";
  let line = `${fg256(glyphColor, glyph)}${body}${fg256(244, suffix)}`;
  while (visibleWidth(line) > safeWidth && room > 0) {
    room -= 1;
    labelText = plainTruncateToWidth(normalized, room);
    body = labelText ? ` ${fg256(250, labelText)}` : "";
    line = `${fg256(glyphColor, glyph)}${body}${fg256(244, suffix)}`;
  }
  return visibleWidth(line) <= safeWidth ? line : truncateToWidth(line, safeWidth);
}

export function renderActivityRecordLine(options: {
  marker: string;
  markerColor: number;
  action: string;
  actionColor: number;
  detail?: string;
  detailColor?: number;
  suffix?: string;
  width: number;
}): string {
  const safeWidth = Math.max(1, Math.trunc(options.width));
  const marker = fg256(options.markerColor, options.marker);
  const suffix = options.suffix ? ` ${fg256(244, options.suffix)}` : "";
  const suffixPlain = options.suffix ? ` ${options.suffix}` : "";
  const actionRoom = Math.max(0, safeWidth - 2 - visibleWidth(options.marker) - 1 - visibleWidth(suffixPlain));
  const actionText =
    2 + visibleWidth(options.marker) + 1 + visibleWidth(options.action) + visibleWidth(suffixPlain) > safeWidth
      ? plainTruncateToWidth(options.action, actionRoom)
      : options.action;
  const action = actionText ? fg256(options.actionColor, actionText) : "";
  const base = `  ${marker} ${action}`;
  const separator = options.detail ? fg256(244, " · ") : "";
  const detailRoom = Math.max(0, safeWidth - visibleWidth(base) - visibleWidth(separator) - visibleWidth(suffix));
  const detail = options.detail && detailRoom > 0 ? fg256(options.detailColor ?? 250, plainTruncateToWidth(options.detail, detailRoom)) : "";
  const line = `${base}${detail ? `${separator}${detail}` : ""}${suffix}`;
  return visibleWidth(line) <= safeWidth ? line : truncateToWidth(line, safeWidth);
}

function activityPhase(label: string): keyof typeof ACTIVITY_FRAMES {
  const normalized = label.trim().toLowerCase();
  if (normalized.startsWith("decode") || normalized.startsWith("decoding") || normalized.startsWith("thinking")) {
    return "thinking";
  }
  if (normalized.startsWith("retrying")) {
    return "retry";
  }
  if (normalized.startsWith("compressing") || normalized.startsWith("compacted")) {
    return "compression";
  }
  if (normalized.startsWith("prefill") || normalized.startsWith("prefilling") || normalized.startsWith("loading")) {
    return "context";
  }
  if (normalized.includes("goal")) {
    return "goal";
  }
  if (normalized.includes("autoresearch") || normalized.includes("experiment") || normalized.includes("benchmark")) {
    return "research";
  }
  return "tool";
}

function plainTruncateToWidth(text: string, width: number): string {
  return stripAnsi(truncateToWidth(text, width));
}
