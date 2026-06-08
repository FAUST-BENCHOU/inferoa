import type { JsonObject, RtkSavingsSummary, SessionEvent } from "../types.js";
import { fg256, terminalWidth, truncateToWidth } from "./ansi.js";

export function renderRtkSessionLines(events: SessionEvent[], width = terminalWidth()): string[] {
  const runEvents = events.filter((event) => isRunEvent(event) && Object.keys(objectField(event.data.rtk)).length > 0);
  if (!runEvents.length) {
    return ["No RTK savings recorded yet."];
  }
  const totals = runEvents.reduce(
    (acc, event) => {
      const rtk = rtkSummary(event.data.rtk);
      acc.turns += 1;
      acc.tools += numberField(event.data.tool_calls) || rtk.tool_calls;
      acc.rtkCommands += rtk.rtk_commands;
      acc.saved += rtk.saved_tokens;
      acc.actual += numberField(event.data.tokens);
      acc.without += rtk.estimated_without_rtk_tokens;
      return acc;
    },
    { turns: 0, tools: 0, rtkCommands: 0, saved: 0, actual: 0, without: 0 },
  );

  const lines = [
    fg256(39, "RTK tool savings"),
    [
      `${fg256(39, "turns")} ${totals.turns}`,
      `${fg256(39, "tools")} ${totals.tools}`,
      `${fg256(39, "rtk commands")} ${totals.rtkCommands}`,
      `${fg256(39, "saved")} ${totals.saved}`,
      `${fg256(39, "actual tokens")} ${totals.actual}`,
      `${fg256(39, "without RTK")} ${totals.without}`,
    ].join(" · "),
    "",
    fg256(39, "Recent turns"),
  ];

  const recent = runEvents.slice(-10);
  for (const [index, event] of [...recent].reverse().entries()) {
    const rtk = rtkSummary(event.data.rtk);
    const actual = numberField(event.data.tokens);
    const detail = [
      `turn ${recent.length - index}`,
      `tools ${numberField(event.data.tool_calls) || rtk.tool_calls}`,
      `rtk commands ${rtk.rtk_commands}`,
      `saved ${rtk.saved_tokens}`,
      `actual tokens ${actual}`,
      `without RTK ${rtk.estimated_without_rtk_tokens}`,
      rtk.savings_pct > 0 ? `${rtk.savings_pct.toFixed(1)}%` : undefined,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    lines.push(`  ${truncateToWidth(detail, width - 2)}`);
  }

  return lines.map((line) => truncateToWidth(line, width));
}

function isRunEvent(event: SessionEvent): boolean {
  return event.type === "run.completed" || event.type === "run.stopped" || event.type === "run.failed";
}

function rtkSummary(value: unknown): RtkSavingsSummary {
  const data = objectField(value);
  const status = stringField(data.status);
  return {
    tool_calls: numberField(data.tool_calls),
    rtk_tool_calls: numberField(data.rtk_tool_calls),
    rtk_commands: numberField(data.rtk_commands),
    input_tokens: numberField(data.input_tokens),
    output_tokens: numberField(data.output_tokens),
    saved_tokens: numberField(data.saved_tokens),
    savings_pct: numberField(data.savings_pct),
    estimated_without_rtk_tokens: numberField(data.estimated_without_rtk_tokens),
    status: status === "disabled" || status === "unavailable" || status === "partial" ? status : "ok",
  };
}

function objectField(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringField(value: unknown): RtkSavingsSummary["status"] | undefined {
  return value === "ok" || value === "disabled" || value === "unavailable" || value === "partial" ? value : undefined;
}
