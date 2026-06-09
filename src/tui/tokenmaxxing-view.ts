import type { JsonObject, ModelUsage, RtkSavingsSummary, SessionEvent } from "../types.js";
import { fg256, terminalWidth, truncateToWidth } from "./ansi.js";
import { cacheHitRate, cacheTurnKind } from "./cache-footer.js";
import { renderSessionActivityLines } from "./event-view.js";

interface CacheTotals {
  promptTokens: number;
  cachedTokens: number;
  turns: number;
  promptTurns: number;
  warmupTurns: number;
}

interface RtkTotals {
  commands: number;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
  toolSavingsPct: number;
}

interface RunSummary {
  event: SessionEvent;
  index: number;
  actualTokens: number;
  withoutRtkTokens: number;
  toolCalls: number;
  rtk: RtkSavingsSummary;
  cacheHit?: number;
}

export function renderTokenmaxxingLines(events: SessionEvent[], endpointEvidence: JsonObject[] = [], width = terminalWidth()): string[] {
  const runs = runSummaries(events, endpointEvidence);
  const cache = cacheTotals(endpointEvidence, events);
  const rtk = rtkTotals(runs);
  const actualTokens = runs.reduce((sum, run) => sum + run.actualTokens, 0);
  const estimatedWithout = actualTokens + cache.cachedTokens + rtk.savedTokens;
  const totalSaved = cache.cachedTokens + rtk.savedTokens;
  const lines = [
    fg256(39, "Tokenmaxxing"),
    [
      `${fg256(39, "saved")} ${totalSaved}`,
      `${fg256(39, "cache")} ${cache.cachedTokens}`,
      `${fg256(39, "rtk")} ${rtk.savedTokens}`,
      `${fg256(39, "model")} 0`,
      `${fg256(39, "tokens")} ${actualTokens}/${estimatedWithout}`,
    ].join(" · "),
    "",
    cacheLine(cache),
    rtkLine(rtk),
    fg256(244, "model selection pending · cost rates unavailable"),
  ];

  if (runs.length) {
    lines.push("", fg256(39, "Recent turns"));
    for (const run of runs.slice(-6).reverse()) {
      lines.push(`  ${turnLine(run, width - 2)}`);
    }
  }

  const activityEvents = events.filter(isTokenmaxxingActivityEvent).slice(-4);
  if (activityEvents.length) {
    lines.push("", fg256(39, "Recent signals"), ...renderSessionActivityLines(activityEvents, width).slice(-4).map((line) => `  ${line}`));
  }

  return lines.map((line) => truncateToWidth(line, width));
}

function runSummaries(events: SessionEvent[], endpointEvidence: JsonObject[]): RunSummary[] {
  const cacheByRun = new Map<string, number>();
  for (const item of endpointEvidence) {
    const runId = stringField(item.run_id);
    const hit = cacheHitRate(objectField(item.usage) as ModelUsage);
    if (runId && hit !== undefined && cacheTurnKind(events, runId) !== "warmup") {
      cacheByRun.set(runId, hit);
    }
  }
  return events
    .filter(isRunEvent)
    .map((event, index) => {
      const rtk = rtkSummary(event.data.rtk);
      const actualTokens = numberField(event.data.tokens);
      return {
        event,
        index: index + 1,
        actualTokens,
        withoutRtkTokens: rtk.estimated_without_rtk_tokens || actualTokens,
        toolCalls: numberField(event.data.tool_calls) || rtk.tool_calls,
        rtk,
        cacheHit: event.run_id ? cacheByRun.get(event.run_id) : undefined,
      };
    });
}

function cacheTotals(evidence: JsonObject[], events: readonly SessionEvent[]): CacheTotals {
  const totals: CacheTotals = { promptTokens: 0, cachedTokens: 0, turns: 0, promptTurns: 0, warmupTurns: 0 };
  for (const item of evidence) {
    totals.turns += 1;
    const runId = stringField(item.run_id);
    if (cacheTurnKind(events, runId) === "warmup") {
      totals.warmupTurns += 1;
      continue;
    }
    const usage = objectField(item.usage);
    const prompt = numberField(usage.prompt_tokens);
    const cached = numberField(usage.cached_prompt_tokens);
    if (prompt > 0) {
      totals.promptTurns += 1;
      totals.promptTokens += prompt;
      totals.cachedTokens += cached;
    }
  }
  return totals;
}

function rtkTotals(runs: RunSummary[]): RtkTotals {
  const totals: RtkTotals = { commands: 0, inputTokens: 0, outputTokens: 0, savedTokens: 0, toolSavingsPct: 0 };
  for (const run of runs) {
    totals.commands += run.rtk.rtk_commands;
    totals.inputTokens += run.rtk.input_tokens;
    totals.outputTokens += run.rtk.output_tokens;
    totals.savedTokens += run.rtk.saved_tokens;
  }
  totals.toolSavingsPct = totals.inputTokens > 0 ? (totals.savedTokens / totals.inputTokens) * 100 : 0;
  return totals;
}

function cacheLine(cache: CacheTotals): string {
  if (!cache.promptTurns || !cache.promptTokens) {
    return fg256(244, cache.warmupTurns ? "prefix cache warming · no steady turns yet" : "prefix cache unavailable");
  }
  const hit = (cache.cachedTokens / cache.promptTokens) * 100;
  return [
    `${fg256(39, "prefix cache")} ${hit.toFixed(1)}%`,
    `cached ${cache.cachedTokens}/${cache.promptTokens}`,
    `${cache.promptTurns}/${Math.max(cache.promptTurns, cache.turns - cache.warmupTurns)} turns`,
    cache.warmupTurns ? `warmup ${cache.warmupTurns}` : undefined,
  ].filter((part): part is string => Boolean(part)).join(" · ");
}

function rtkLine(rtk: RtkTotals): string {
  if (!rtk.commands) {
    return fg256(244, "rtk unavailable · no rewritten commands");
  }
  return [
    `${fg256(39, "rtk")} ${rtk.commands} cmds`,
    `io ${rtk.inputTokens}->${rtk.outputTokens}`,
    `saved ${rtk.savedTokens}`,
    rtk.toolSavingsPct > 0 ? `tool ${rtk.toolSavingsPct.toFixed(1)}%` : undefined,
  ].filter((part): part is string => Boolean(part)).join(" · ");
}

function turnLine(run: RunSummary, width: number): string {
  const parts = [
    `turn ${run.index}`,
    `tokens ${run.actualTokens}/${run.withoutRtkTokens}`,
    run.cacheHit !== undefined ? `cache ${(run.cacheHit * 100).toFixed(1)}%` : undefined,
    run.rtk.rtk_commands > 0 ? `rtk ${run.rtk.saved_tokens}` : undefined,
    `tools ${run.toolCalls}`,
  ];
  return truncateToWidth(parts.filter((part): part is string => Boolean(part)).join(" · "), width);
}

function isRunEvent(event: SessionEvent): boolean {
  return event.type === "run.completed" || event.type === "run.stopped" || event.type === "run.failed";
}

function isTokenmaxxingActivityEvent(event: SessionEvent): boolean {
  return event.type === "endpoint.evidence.recorded" || event.type === "run.completed" || event.type === "run.stopped" || event.type === "run.failed";
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

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
