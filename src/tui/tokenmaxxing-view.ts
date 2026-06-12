import type { JsonObject, ModelUsage, RtkSavingsSummary, SessionEvent } from "../types.js";
import { bgLine, center, fg256, padRight, terminalHeight, terminalWidth, truncateToWidth, visibleWidth } from "./ansi.js";
import { formatDuration, type PrefixCacheTurnKind } from "./cache-footer.js";

export interface TokenmaxxingRenderOptions {
  detailLimit?: number;
  includeActivity?: boolean;
  activityOnly?: boolean;
}

export type TokenmaxxingRowKind = "summary" | "section" | "epoch" | "turn-header" | "turn" | "compact" | "trend" | "signal";

export interface TokenmaxxingScreenRow {
  text: string;
  kind: TokenmaxxingRowKind;
}

type TokenmaxxingScreenInputRow = string | TokenmaxxingScreenRow;

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

interface CacheObservation {
  runId: string;
  stepId?: string;
  stepIndex?: number;
  callKey: string;
  kind: PrefixCacheTurnKind;
  promptEpochId?: string;
  promptTokens: number;
  cachedTokens?: number;
  actualHit?: number;
  oracleHit?: number;
  cacheDiff?: number;
}

interface CacheSource {
  runId: string;
  stepId?: string;
  stepIndex?: number;
  promptEpochId?: string;
  promptTokens: number;
  cachedTokens?: number;
  order: number;
}

interface CacheEvidenceSummary {
  observations: CacheObservation[];
  byRun: Map<string, CacheObservation>;
  byCall: Map<string, CacheObservation>;
}

interface RunSummary {
  kind: "run";
  event: SessionEvent;
  order: number;
  index: number;
  actualTokens: number;
  withoutRtkTokens: number;
  toolCalls: number;
  rtk: RtkSavingsSummary;
  cache?: CacheObservation;
  prefixCacheStatus?: string;
}

interface ModelCallSummary {
  kind: "model_call";
  event: SessionEvent;
  order: number;
  index: number;
  runOrdinal: number;
  runId: string;
  stepId?: string;
  stepIndex?: number;
  promptEpochId?: string;
  isRunStart: boolean;
  requestClass?: string;
  actualTokens: number;
  withoutRtkTokens: number;
  toolCalls: number;
  rtk: RtkSavingsSummary;
  cache?: CacheObservation;
  prefixCacheStatus?: string;
}

interface CompactionCallSummary {
  kind: "compaction";
  order: number;
  index: number;
  runOrdinal: number;
  runId: string;
  promptEpochId?: string;
  actualTokens: number;
  withoutRtkTokens: number;
  toolCalls: number;
  rtk: RtkSavingsSummary;
  cache?: CacheObservation;
  prefixCacheStatus?: string;
}

type TurnSummary = RunSummary | ModelCallSummary | CompactionCallSummary;

interface EpochSummary {
  promptEpochId: string;
  createdReason?: string;
  compactReason?: string;
  summaryStrategy?: string;
  archivedEvents?: number;
  compactTokensBefore?: number;
  compactTokensAfter?: number;
  promptMessagesBefore?: number;
  promptMessagesAfter?: number;
  compressedMessages?: number;
  protectedTailEvents?: number;
  preservedTailEvents?: number;
  preservedRounds?: number;
  preservedRunAnchorCount?: number;
  promptTurns: number;
  promptTokens: number;
  cachedTokens: number;
}

interface TokenmaxxingTrendPoint {
  label: string;
  event: string;
  promptEpochId?: string;
  actualTokens: number;
  withoutRtkTokens: number;
  promptTokens?: number;
  cachedTokens?: number;
  actualHit?: number;
  oracleHit?: number;
  cacheDiff?: number;
  prefixStatus?: string;
  toolCalls: number;
  rtkSaved: number;
}

interface TokenmaxxingTrendModel {
  points: TokenmaxxingTrendPoint[];
  cache: CacheTotals;
  rtk: RtkTotals;
  compactEvents: EpochSummary[];
}

interface TrendPanelDefinition {
  title: string;
  rows(model: TokenmaxxingTrendModel, width: number): TokenmaxxingScreenRow[];
}

export function renderTokenmaxxingLines(
  events: SessionEvent[],
  endpointEvidence: JsonObject[] = [],
  width = terminalWidth(),
  options: TokenmaxxingRenderOptions = {},
): string[] {
  return renderTokenmaxxingRows(events, endpointEvidence, width, options).map((row) => row.text);
}

export function renderTokenmaxxingRows(
  events: SessionEvent[],
  endpointEvidence: JsonObject[] = [],
  width = terminalWidth(),
  options: TokenmaxxingRenderOptions = {},
): TokenmaxxingScreenRow[] {
  const contentWidth = Math.max(20, width - 2);
  const cacheEvidence = buildCacheEvidence(endpointEvidence, events);
  const runs = runSummaries(events, cacheEvidence.byRun);
  const modelCalls = modelCallSummaries(events, cacheEvidence.byCall);
  const compactionCalls = compactionCallSummaries(endpointEvidence, events, cacheEvidence.byCall);
  const modelDetailTurns = [...modelCalls, ...compactionCalls].sort((left, right) => left.order - right.order);
  const detailTurns: TurnSummary[] = modelDetailTurns.length ? modelDetailTurns : runs;
  const cache = cacheTotals(cacheEvidence.observations);
  const rtk = rtkTotals(events, runs);
  const actualTokens = detailTurns.length
    ? detailTurns.reduce((sum, turn) => sum + turn.actualTokens, 0)
    : runs.reduce((sum, run) => sum + run.actualTokens, 0);
  const estimatedWithout = actualTokens + cache.cachedTokens + rtk.savedTokens;
  const totalSaved = cache.cachedTokens + rtk.savedTokens;
  const rows: TokenmaxxingScreenRow[] = [];
  if (!options.activityOnly) {
    rows.push(...summaryRows(cache, rtk, totalSaved, actualTokens, estimatedWithout, contentWidth));
  }

  if (!options.activityOnly && detailTurns.length) {
    const limit = options.detailLimit ?? 6;
    const recentTurns = Number.isFinite(limit) ? detailTurns.slice(-Math.max(0, limit)) : detailTurns;
    const epochs = epochSummaries(events, cacheEvidence.observations, endpointEvidence);
    rows.push(row(turnTableHeader(contentWidth), "turn-header"));
    let currentEpoch: string | undefined;
    for (const turn of recentTurns.slice().reverse()) {
      const epochId = turnEpochId(turn);
      if (epochId && epochId !== currentEpoch) {
        rows.push(row(epochLine(epochs.get(epochId) ?? emptyEpochSummary(epochId), contentWidth), "epoch"));
        currentEpoch = epochId;
      }
      rows.push(row(turnLine(turn, contentWidth), turn.kind === "compaction" ? "compact" : "turn"));
    }
  }

  const includeActivity = options.activityOnly || (options.includeActivity ?? false);
  const tokenmaxxingActivityEvents = includeActivity ? events.filter(isTokenmaxxingActivityEvent) : [];
  const activityEvents = options.activityOnly ? tokenmaxxingActivityEvents.slice(-80) : tokenmaxxingActivityEvents.slice(-4);
  if (activityEvents.length) {
    rows.push(...tokenmaxxingSignalRows(events, activityEvents, contentWidth));
  }

  if (options.activityOnly && !activityEvents.length) {
    rows.push(row(fg256(244, "No tokenmaxxing signals yet."), "signal"));
  }

  return rows.map((item) => ({ ...item, text: truncateToWidth(singleLine(item.text), contentWidth) }));
}

export function renderTokenmaxxingScreen(
  body: readonly TokenmaxxingScreenInputRow[],
  width = terminalWidth(),
  height = terminalHeight(),
  pageIndex = 0,
): string[] {
  const safeWidth = Math.max(32, Math.floor(width));
  const safeHeight = Math.max(6, Math.floor(height));
  const bodyRows = body.map(normalizeScreenRow);
  const sticky = leadingSummaryRows(bodyRows);
  const pagedRows = bodyRows.slice(sticky.length);
  const contentHeight = Math.max(1, safeHeight - 2 - sticky.length);
  const total = pagedRows.length;
  const pageCount = tokenmaxxingScreenPageCount(bodyRows, safeHeight);
  const page = Math.max(0, Math.min(Math.floor(pageIndex), pageCount - 1));
  const top = page * contentHeight;
  const visible = pagedRows.slice(top, top + contentHeight);
  const firstVisible = total ? top + 1 : 0;
  const lastVisible = total ? Math.min(total, top + contentHeight) : 0;
  const title = `${fg256(87, "Tokenmaxxing")} ${fg256(244, "run cache · RTK · session savings")}`;
  const range = total ? `${firstVisible}-${lastVisible} / ${total}` : "0 / 0";
  const pageLabel = `page ${page + 1}/${pageCount}`;
  const headerRight = `${pageLabel} · ${range}`;
  const rows = [
    bgLine(234, fitLeftRight(`  ${title}`, fg256(244, headerRight), safeWidth), safeWidth),
    ...sticky.map((item) => renderScreenRow(item, safeWidth)),
    ...visible.map((item) => renderScreenRow(item, safeWidth)),
  ];
  while (rows.length < safeHeight - 1) {
    rows.push(bgLine(234, "", safeWidth));
  }
  const footerLeft = `${fg256(252, "esc")} exit   ${fg256(252, "ctrl+c")} exit   ${fg256(252, "←/→")} page`;
  const footerRight = pageLabel;
  rows.push(bgLine(234, fitLeftRight(` ${footerLeft}`, fg256(244, footerRight), safeWidth), safeWidth));
  return rows.slice(0, safeHeight);
}

export function tokenmaxxingScreenPageCount(
  body: readonly TokenmaxxingScreenInputRow[],
  height = terminalHeight(),
): number {
  const safeHeight = Math.max(6, Math.floor(height));
  const bodyRows = body.map(normalizeScreenRow);
  const sticky = leadingSummaryRows(bodyRows);
  const contentHeight = Math.max(1, safeHeight - 2 - sticky.length);
  const total = Math.max(0, bodyRows.length - sticky.length);
  return Math.max(1, Math.ceil(total / contentHeight));
}

export function tokenmaxxingTrendPageCount(): number {
  return TREND_PANELS.length;
}

export function renderTokenmaxxingTrendScreen(
  events: SessionEvent[],
  endpointEvidence: JsonObject[] = [],
  width = terminalWidth(),
  height = terminalHeight(),
  pageIndex = 0,
): string[] {
  const safeWidth = Math.max(32, Math.floor(width));
  const safeHeight = Math.max(6, Math.floor(height));
  const contentWidth = Math.max(20, safeWidth - 2);
  const pageCount = tokenmaxxingTrendPageCount();
  const page = Math.max(0, Math.min(Math.floor(pageIndex), pageCount - 1));
  const panel = TREND_PANELS[page]!;
  const model = tokenmaxxingTrendModel(events, endpointEvidence);
  const bodyRows = panel.rows(model, contentWidth).map(normalizeScreenRow);
  const contentHeight = Math.max(1, safeHeight - 2);
  const visible = bodyRows.slice(0, contentHeight);
  const title = `${fg256(87, "Tokenmaxxing")} ${fg256(244, `trend · ${panel.title}`)}`;
  const headerRight = `metric ${page + 1}/${pageCount}`;
  const rows = [
    bgLine(234, fitLeftRight(`  ${title}`, fg256(244, headerRight), safeWidth), safeWidth),
    ...visible.map((item) => renderScreenRow(item, safeWidth)),
  ];
  while (rows.length < safeHeight - 1) {
    rows.push(bgLine(234, "", safeWidth));
  }
  const footerLeft = `${fg256(252, "esc")} exit   ${fg256(252, "ctrl+c")} exit   ${fg256(252, "←/→")} metric`;
  rows.push(bgLine(234, fitLeftRight(` ${footerLeft}`, fg256(244, headerRight), safeWidth), safeWidth));
  return rows.slice(0, safeHeight);
}

function row(text: string, kind: TokenmaxxingRowKind): TokenmaxxingScreenRow {
  return { text, kind };
}

function normalizeScreenRow(item: TokenmaxxingScreenInputRow): TokenmaxxingScreenRow {
  const normalized = typeof item === "string" ? row(item, "turn") : item;
  return { ...normalized, text: singleLine(normalized.text) };
}

function renderScreenRow(item: TokenmaxxingScreenRow, safeWidth: number): string {
  if (item.kind === "epoch") {
    return bgLine(rowBackground(item), center(item.text, safeWidth), safeWidth);
  }
  return bgLine(rowBackground(item), ` ${truncateToWidth(item.text, safeWidth - 2)}`, safeWidth);
}

function rowBackground(row: TokenmaxxingScreenRow): number {
  switch (row.kind) {
    case "epoch":
      return 24;
    case "compact":
      return 235;
    case "turn-header":
    case "section":
    case "trend":
      return 235;
    default:
      return 234;
  }
}

function leadingSummaryRows(rows: readonly TokenmaxxingScreenRow[]): TokenmaxxingScreenRow[] {
  const out: TokenmaxxingScreenRow[] = [];
  for (const item of rows) {
    if (item.kind !== "summary") {
      break;
    }
    out.push(item);
  }
  return out;
}

function singleLine(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").trimEnd();
}

function fitLeftRight(left: string, right: string, width: number): string {
  const gap = width - visibleWidth(left) - visibleWidth(right);
  if (gap > 0) {
    return `${left}${" ".repeat(gap)}${right}`;
  }
  const leftWidth = Math.max(0, width - visibleWidth(right) - 1);
  return `${truncateToWidth(left, leftWidth)} ${right}`;
}

function runSummaries(events: SessionEvent[], cacheByRun: Map<string, CacheObservation>): RunSummary[] {
  return events
    .filter(isRunEvent)
    .map((event, index) => {
      const rtk = rtkSummary(event.data.rtk);
      const actualTokens = numberField(event.data.tokens);
      return {
        kind: "run",
        event,
        order: events.indexOf(event),
        index: index + 1,
        actualTokens,
        withoutRtkTokens: rtk.estimated_without_rtk_tokens || actualTokens,
        toolCalls: numberField(event.data.tool_calls) || rtk.tool_calls,
        rtk,
        cache: event.run_id ? cacheByRun.get(event.run_id) : undefined,
      };
    });
}

function modelCallSummaries(events: SessionEvent[], cacheByCall: Map<string, CacheObservation>): ModelCallSummary[] {
  const runOrdinals = runOrdinalMap(events);
  const requestByCall = modelRequestByCall(events);
  const seenRuns = new Set<string>();
  return events
    .map((event, order) => ({ event, order }))
    .filter(({ event }) => event.type === "model.response.settled" && Boolean(event.run_id))
    .map(({ event, order }, index) => {
      const runId = event.run_id!;
      const stepId = stringField(event.data.step_id);
      const stepIndex = optionalNumberField(event.data.step_index);
      const actualTokens = modelUsageTokenCost(usageField(event.data.usage));
      const toolCalls = toolCallCount(event.data.tool_calls);
      const rtk = rtkSummaryForStep(events, runId, stepId, stepIndex, actualTokens, toolCalls);
      const callKey = cacheCallKey(runId, stepId, stepIndex);
      const request = requestByCall.get(callKey);
      const cache = cacheByCall.get(callKey);
      const isRunStart = !seenRuns.has(runId);
      seenRuns.add(runId);
      return {
        kind: "model_call",
        event,
        order,
        index: index + 1,
        runOrdinal: runOrdinals.get(runId) ?? index + 1,
        runId,
        stepId,
        stepIndex,
        promptEpochId: cache?.promptEpochId ?? stringField(event.data.prompt_epoch_id) ?? stringField(request?.prompt_epoch_id),
        isRunStart,
        requestClass: stringField(event.data.request_class) ?? stringField(request?.request_class),
        actualTokens,
        withoutRtkTokens: actualTokens + rtk.saved_tokens,
        toolCalls,
        rtk,
        cache,
        prefixCacheStatus: stringField(request?.prefix_cache_status),
      };
    });
}

function compactionCallSummaries(evidence: JsonObject[], events: SessionEvent[], cacheByCall: Map<string, CacheObservation>): CompactionCallSummary[] {
  const runOrdinals = runOrdinalMap(events);
  const eventOrder = endpointEvidenceEventOrder(events);
  return evidence
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => stringField(item.request_class) === "compaction" && Boolean(stringField(item.run_id)))
    .map(({ item, index }) => {
      const runId = String(item.run_id);
      const stepId = stringField(item.step_id);
      const stepIndex = optionalNumberField(item.step_index);
      const usage = usageField(item.usage);
      const actualTokens = modelUsageTokenCost(usage);
      const callKey = cacheCallKey(runId, stepId, stepIndex);
      const cache = cacheByCall.get(callKey);
      return {
        kind: "compaction" as const,
        order: eventOrder.get(endpointEvidenceKey(item)) ?? 1_000_000 + index,
        index: index + 1,
        runOrdinal: runOrdinals.get(runId) ?? runOrdinals.size + index + 1,
        runId,
        promptEpochId: cache?.promptEpochId ?? stringField(item.prompt_epoch_id),
        actualTokens,
        withoutRtkTokens: actualTokens,
        toolCalls: 0,
        rtk: rtkSummary(undefined),
        cache,
        prefixCacheStatus: stringField(item.prefix_cache_status),
      };
    });
}

function endpointEvidenceEventOrder(events: SessionEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  events.forEach((event, index) => {
    if (!event.run_id || event.type !== "endpoint.evidence.recorded") {
      return;
    }
    out.set(endpointEvidenceKey(event.data, event.run_id), index);
  });
  return out;
}

function endpointEvidenceKey(data: JsonObject, fallbackRunId?: string): string {
  return [stringField(data.run_id) ?? fallbackRunId ?? "", stringField(data.request_id) ?? "", stringField(data.prompt_hash) ?? ""].join(":");
}

function modelRequestByCall(events: SessionEvent[]): Map<string, JsonObject> {
  const out = new Map<string, JsonObject>();
  for (const event of events) {
    if (!event.run_id || event.type !== "model.request.started") {
      continue;
    }
    out.set(cacheCallKey(event.run_id, stringField(event.data.step_id), optionalNumberField(event.data.step_index)), event.data);
  }
  return out;
}

function buildCacheEvidence(evidence: JsonObject[], events: readonly SessionEvent[]): CacheEvidenceSummary {
  const observations: CacheObservation[] = [];
  const byRun = new Map<string, CacheObservation>();
  const byCall = new Map<string, CacheObservation>();
  const previousPromptByEpoch = new Map<string, number>();
  const sources = cacheSources(evidence, events);
  const warmupCallKeys = epochWarmupCallKeys(sources);
  const seen = new Set<string>();
  let previousPromptInSession: number | undefined;
  for (const source of sources) {
    const callKey = cacheCallKey(source.runId, source.stepId, source.stepIndex);
    if (seen.has(callKey)) {
      continue;
    }
    seen.add(callKey);
    const epochKey = source.promptEpochId ?? "__session__";
    const previousPrompt = previousPromptByEpoch.get(epochKey) ?? previousPromptInSession;
    const kind: PrefixCacheTurnKind = warmupCallKeys.has(callKey) ? "warmup" : "hit";
    const actualHit = source.cachedTokens === undefined ? undefined : ratio(source.cachedTokens, source.promptTokens);
    const oracleHit = previousPrompt !== undefined ? ratio(Math.min(previousPrompt, source.promptTokens), source.promptTokens) : undefined;
    const cacheDiff = actualHit === undefined || oracleHit === undefined ? undefined : Math.max(0, oracleHit - actualHit);
    const observation: CacheObservation = {
      runId: source.runId,
      stepId: source.stepId,
      stepIndex: source.stepIndex,
      callKey,
      kind,
      promptEpochId: source.promptEpochId,
      promptTokens: source.promptTokens,
      cachedTokens: source.cachedTokens,
      actualHit,
      oracleHit,
      cacheDiff,
    };
    observations.push(observation);
    byRun.set(source.runId, observation);
    byCall.set(callKey, observation);
    previousPromptByEpoch.set(epochKey, source.promptTokens);
    previousPromptInSession = source.promptTokens;
  }
  return { observations, byRun, byCall };
}

function cacheSources(evidence: JsonObject[], events: readonly SessionEvent[]): CacheSource[] {
  const sources: CacheSource[] = [];
  const requestByCall = new Map<string, JsonObject>();
  events.forEach((event, index) => {
    if (!event.run_id || event.type !== "model.request.started") {
      return;
    }
    requestByCall.set(cacheCallKey(event.run_id, stringField(event.data.step_id), optionalNumberField(event.data.step_index)), event.data);
  });
  events.forEach((event, index) => {
    if (!event.run_id || event.type !== "model.response.settled") {
      return;
    }
    const usage = usageField(event.data.usage);
    const prompt = optionalNumberField(usage?.prompt_tokens);
    if (prompt === undefined || prompt <= 0) {
      return;
    }
    const stepId = stringField(event.data.step_id);
    const stepIndex = optionalNumberField(event.data.step_index);
    const request = requestByCall.get(cacheCallKey(event.run_id, stepId, stepIndex)) ?? {};
    sources.push({
      runId: event.run_id,
      stepId,
      stepIndex,
      promptEpochId: stringField(event.data.prompt_epoch_id) ?? stringField(request.prompt_epoch_id),
      promptTokens: prompt,
      cachedTokens: optionalNumberField(usage?.cached_prompt_tokens),
      order: index,
    });
  });
  evidence.forEach((item, index) => {
    const runId = stringField(item.run_id);
    const usage = objectField(item.usage);
    const prompt = optionalNumberField(usage.prompt_tokens) ?? optionalNumberField(item.prompt_tokens);
    if (!runId || prompt === undefined || prompt <= 0) {
      return;
    }
    sources.push({
      runId,
      stepId: stringField(item.step_id),
      stepIndex: optionalNumberField(item.step_index),
      promptEpochId: stringField(item.prompt_epoch_id),
      promptTokens: prompt,
      cachedTokens: optionalNumberField(usage.cached_prompt_tokens) ?? optionalNumberField(item.cached_prompt_tokens),
      order: 1_000_000 + index,
    });
  });
  return sources.sort((left, right) => left.order - right.order);
}

function epochWarmupCallKeys(sources: CacheSource[]): Set<string> {
  const out = new Set<string>();
  const seenEpochs = new Set<string>();
  for (const source of sources) {
    const epochKey = source.promptEpochId ?? "__session__";
    if (seenEpochs.has(epochKey)) {
      continue;
    }
    seenEpochs.add(epochKey);
    out.add(cacheCallKey(source.runId, source.stepId, source.stepIndex));
  }
  return out;
}

function cacheTotals(observations: CacheObservation[]): CacheTotals {
  const totals: CacheTotals = { promptTokens: 0, cachedTokens: 0, turns: 0, promptTurns: 0, warmupTurns: 0 };
  for (const item of observations) {
    totals.turns += 1;
    if (item.kind === "warmup") {
      totals.warmupTurns += 1;
      continue;
    }
    if (item.cachedTokens !== undefined) {
      totals.promptTurns += 1;
      totals.promptTokens += item.promptTokens;
      totals.cachedTokens += item.cachedTokens;
    }
  }
  return totals;
}

function epochSummaries(events: SessionEvent[], observations: CacheObservation[], evidence: JsonObject[]): Map<string, EpochSummary> {
  const out = new Map<string, EpochSummary>();
  const compactTokenDeltas = compactTokenDeltasByEpoch(events, evidence, observations);
  for (const observation of observations) {
    if (!observation.promptEpochId) {
      continue;
    }
    const summary = ensureEpochSummary(out, observation.promptEpochId);
    if (observation.kind !== "warmup" && observation.cachedTokens !== undefined) {
      summary.promptTurns += 1;
      summary.promptTokens += observation.promptTokens;
      summary.cachedTokens += observation.cachedTokens;
    }
  }
  for (const event of events) {
    if (event.type === "prompt.epoch.created") {
      const epochId = stringField(event.data.prompt_epoch_id);
      if (!epochId) {
        continue;
      }
      const summary = ensureEpochSummary(out, epochId);
      summary.createdReason = stringField(event.data.reason);
    } else if (event.type === "evidence.context_compression") {
      const epochId = stringField(event.data.epoch_id) ?? stringField(event.data.prompt_epoch_id);
      if (!epochId) {
        continue;
      }
      const summary = ensureEpochSummary(out, epochId);
      summary.compactReason = stringField(event.data.reason);
      summary.summaryStrategy = stringField(event.data.summary_strategy);
      summary.archivedEvents = optionalNumberField(event.data.archived_events);
      const tokenDelta = compactTokenDeltas.get(epochId);
      summary.compactTokensBefore = tokenDelta?.before;
      summary.compactTokensAfter = tokenDelta?.after;
      summary.promptMessagesBefore = optionalNumberField(event.data.prompt_messages_before);
      summary.promptMessagesAfter = optionalNumberField(event.data.prompt_messages_after);
      summary.compressedMessages = optionalNumberField(event.data.compressed_messages);
      summary.protectedTailEvents = optionalNumberField(event.data.protected_tail_events);
      summary.preservedTailEvents = optionalNumberField(event.data.preserved_tail_events);
      summary.preservedRounds = optionalNumberField(event.data.preserved_rounds);
      summary.preservedRunAnchorCount = optionalNumberField(event.data.preserved_run_anchor_count);
    }
  }
  return out;
}

function compactTokenDeltasByEpoch(
  events: SessionEvent[],
  evidence: JsonObject[],
  observations: CacheObservation[],
): Map<string, { before?: number; after?: number }> {
  const firstPromptByEpoch = firstPromptTokensByEpoch(observations);
  const fallbackCompactionPrompts = compactionPromptTokensFromEvidence(evidence);
  const out = new Map<string, { before?: number; after?: number }>();
  let latestCompactionPrompt: number | undefined;
  let fallbackIndex = 0;
  for (const event of events) {
    if (event.type === "endpoint.evidence.recorded" && stringField(event.data.request_class) === "compaction") {
      latestCompactionPrompt = promptTokensFromEvidenceData(event.data);
      continue;
    }
    if (event.type !== "evidence.context_compression") {
      continue;
    }
    const epochId = stringField(event.data.epoch_id) ?? stringField(event.data.prompt_epoch_id);
    if (!epochId) {
      continue;
    }
    const before = latestCompactionPrompt ?? fallbackCompactionPrompts[fallbackIndex];
    if (latestCompactionPrompt === undefined && before !== undefined) {
      fallbackIndex += 1;
    }
    latestCompactionPrompt = undefined;
    out.set(epochId, {
      before,
      after: firstPromptByEpoch.get(epochId),
    });
  }
  return out;
}

function firstPromptTokensByEpoch(observations: CacheObservation[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const observation of observations) {
    if (!observation.promptEpochId || out.has(observation.promptEpochId)) {
      continue;
    }
    out.set(observation.promptEpochId, observation.promptTokens);
  }
  return out;
}

function compactionPromptTokensFromEvidence(evidence: JsonObject[]): number[] {
  const out: number[] = [];
  for (const item of evidence) {
    if (stringField(item.request_class) !== "compaction") {
      continue;
    }
    const prompt = promptTokensFromEvidenceData(item);
    if (prompt !== undefined) {
      out.push(prompt);
    }
  }
  return out;
}

function promptTokensFromEvidenceData(data: JsonObject): number | undefined {
  const usage = objectField(data.usage);
  return optionalNumberField(usage.prompt_tokens) ?? optionalNumberField(data.prompt_tokens);
}

function ensureEpochSummary(map: Map<string, EpochSummary>, epochId: string): EpochSummary {
  let summary = map.get(epochId);
  if (!summary) {
    summary = emptyEpochSummary(epochId);
    map.set(epochId, summary);
  }
  return summary;
}

function emptyEpochSummary(epochId: string): EpochSummary {
  return {
    promptEpochId: epochId,
    promptTurns: 0,
    promptTokens: 0,
    cachedTokens: 0,
  };
}

function rtkTotals(events: SessionEvent[], runs: RunSummary[]): RtkTotals {
  const rtkEvents = events.filter((event) => event.type === "rtk.tool_savings");
  if (rtkEvents.length) {
    return rtkTotalsFromSummaries(rtkEvents.map((event) => rtkSummary(event.data)));
  }
  return rtkTotalsFromSummaries(runs.map((run) => run.rtk));
}

function rtkTotalsFromSummaries(summaries: RtkSavingsSummary[]): RtkTotals {
  const totals: RtkTotals = { commands: 0, inputTokens: 0, outputTokens: 0, savedTokens: 0, toolSavingsPct: 0 };
  for (const rtk of summaries) {
    totals.commands += rtk.rtk_commands;
    totals.inputTokens += rtk.input_tokens;
    totals.outputTokens += rtk.output_tokens;
    totals.savedTokens += rtk.saved_tokens;
  }
  totals.toolSavingsPct = totals.inputTokens > 0 ? (totals.savedTokens / totals.inputTokens) * 100 : 0;
  return totals;
}

const TREND_PANELS: TrendPanelDefinition[] = [
  {
    title: "overview",
    rows: (model, width) => trendOverviewRows(model, width),
  },
  {
    title: "cache",
    rows: (model, width) => trendCacheRows(model, width),
  },
  {
    title: "prefix",
    rows: (model, width) => trendPrefixRows(model, width),
  },
  {
    title: "context",
    rows: (model, width) => trendContextRows(model, width),
  },
  {
    title: "rtk-tools",
    rows: (model, width) => trendRtkRows(model, width),
  },
  {
    title: "compact",
    rows: (model, width) => trendCompactRows(model, width),
  },
];

function tokenmaxxingTrendModel(events: SessionEvent[], endpointEvidence: JsonObject[]): TokenmaxxingTrendModel {
  const cacheEvidence = buildCacheEvidence(endpointEvidence, events);
  const modelCalls = modelCallSummaries(events, cacheEvidence.byCall);
  const compactionCalls = compactionCallSummaries(endpointEvidence, events, cacheEvidence.byCall);
  const turns = [...modelCalls, ...compactionCalls].sort((left, right) => left.order - right.order);
  const runFallback = runSummaries(events, cacheEvidence.byRun);
  const detailTurns: TurnSummary[] = turns.length ? turns : runFallback;
  const points = detailTurns.map((turn) => {
    const cache = turn.cache;
    return {
      label: trendTurnLabel(turn),
      event: turn.kind === "compaction" ? "compact" : turn.kind === "model_call" ? modelCallEventName(turn) : "run",
      promptEpochId: turnEpochId(turn),
      actualTokens: turn.actualTokens,
      withoutRtkTokens: turn.withoutRtkTokens,
      promptTokens: cache?.promptTokens,
      cachedTokens: cache?.cachedTokens,
      actualHit: cache?.actualHit,
      oracleHit: cache?.oracleHit,
      cacheDiff: cache?.cacheDiff,
      prefixStatus: turn.kind === "run" ? undefined : turn.prefixCacheStatus,
      toolCalls: turn.toolCalls,
      rtkSaved: turn.rtk.saved_tokens,
    };
  });
  const compactEvents = Array.from(epochSummaries(events, cacheEvidence.observations, endpointEvidence).values())
    .filter((epoch) => epoch.compactReason || epoch.compactTokensBefore !== undefined || epoch.promptMessagesBefore !== undefined)
    .sort((left, right) => compactEpochSortKey(left) - compactEpochSortKey(right));
  return {
    points,
    cache: cacheTotals(cacheEvidence.observations),
    rtk: rtkTotals(events, runFallback),
    compactEvents,
  };
}

function compactEpochSortKey(epoch: EpochSummary): number {
  return Number(epoch.promptEpochId.replace(/\D/g, "").slice(0, 8)) || 0;
}

function trendOverviewRows(model: TokenmaxxingTrendModel, width: number): TokenmaxxingScreenRow[] {
  const points = model.points;
  const latest = points.at(-1);
  const actualHit = average(points.map((point) => point.actualHit));
  const cacheGap = average(points.map((point) => point.cacheDiff));
  const breakCount = points.filter((point) => point.prefixStatus === "changed").length;
  return [
    trendTitle("Overview", "session token, cache, and tool-savings shape"),
    trendKpis([
      ["calls", String(points.length)],
      ["latest tokens", latest ? formatInteger(latest.actualTokens) : "-"],
      ["avg cache", actualHit === undefined ? "-" : formatPlainPct(actualHit)],
      ["avg gap", cacheGap === undefined ? "-" : formatPlainPct(cacheGap)],
      ["prefix break", String(breakCount)],
      ["rtk saved", formatInteger(model.rtk.savedTokens)],
    ], width),
    trendChart("prompt tokens", points.map((point) => point.promptTokens), width, formatInteger),
    trendChart("total tokens", points.map((point) => point.actualTokens), width, formatInteger),
    trendChart("cache hit", points.map((point) => point.actualHit), width, formatPlainPct),
    trendRecentTable(points, width),
  ].flat();
}

function trendCacheRows(model: TokenmaxxingTrendModel, width: number): TokenmaxxingScreenRow[] {
  const points = model.points;
  return [
    trendTitle("Cache", "actual hit, oracle hit, and provider cache gap"),
    trendKpis([
      ["steady turns", `${model.cache.promptTurns}/${Math.max(model.cache.promptTurns, model.cache.turns - model.cache.warmupTurns)}`],
      ["cached", formatInteger(model.cache.cachedTokens)],
      ["prompt", formatInteger(model.cache.promptTokens)],
      ["hit", model.cache.promptTokens ? `${((model.cache.cachedTokens / model.cache.promptTokens) * 100).toFixed(1)}%` : "-"],
      ["warmup", String(model.cache.warmupTurns)],
    ], width),
    trendChart("actual hit", points.map((point) => point.actualHit), width, formatPlainPct),
    trendChart("oracle hit", points.map((point) => point.oracleHit), width, formatPlainPct),
    trendChart("cache gap", points.map((point) => point.cacheDiff), width, formatPlainPct),
    trendChart("cached tokens", points.map((point) => point.cachedTokens), width, formatInteger),
    trendRecentTable(points, width),
  ].flat();
}

function trendPrefixRows(model: TokenmaxxingTrendModel, width: number): TokenmaxxingScreenRow[] {
  const points = model.points;
  const safe = points.filter((point) => point.prefixStatus === "safe").length;
  const breaks = points.filter((point) => point.prefixStatus === "changed").length;
  const newEpoch = points.filter((point) => point.prefixStatus === "new_epoch").length;
  const unknown = points.filter((point) => point.prefixStatus === "unknown").length;
  const legacy = points.filter((point) => !point.prefixStatus).length;
  return [
    trendTitle("Prefix", "structural prefix safety, separate from provider cache gap"),
    trendKpis([
      ["safe", String(safe)],
      ["break", String(breaks)],
      ["new", String(newEpoch)],
      ["unknown", String(unknown)],
      ["legacy", String(legacy)],
    ], width),
    row(`${fg256(244, "sequence")} ${prefixSequence(points, Math.max(12, width - 12))}`, "trend"),
    trendChart("break rate", rollingRate(points.map((point) => point.prefixStatus === "changed" ? 1 : 0), 8), width, formatPlainPct),
    trendChart("cache gap", points.map((point) => point.cacheDiff), width, formatPlainPct),
    trendRecentTable(points, width),
  ].flat();
}

function trendContextRows(model: TokenmaxxingTrendModel, width: number): TokenmaxxingScreenRow[] {
  const points = model.points;
  const epochs = new Set(points.map((point) => point.promptEpochId).filter(Boolean)).size;
  return [
    trendTitle("Context", "prompt-token pressure and epoch boundaries"),
    trendKpis([
      ["epochs", String(epochs)],
      ["max prompt", formatInteger(maxDefined(points.map((point) => point.promptTokens)) ?? 0)],
      ["latest prompt", formatInteger(points.at(-1)?.promptTokens ?? 0)],
      ["compacts", String(model.compactEvents.length)],
    ], width),
    trendChart("prompt tokens", points.map((point) => point.promptTokens), width, formatInteger),
    trendChart("total tokens", points.map((point) => point.actualTokens), width, formatInteger),
    trendChart("cache gap", points.map((point) => point.cacheDiff), width, formatPlainPct),
    ...trendEpochRows(model.compactEvents, width),
  ].flat();
}

function trendRtkRows(model: TokenmaxxingTrendModel, width: number): TokenmaxxingScreenRow[] {
  const points = model.points;
  return [
    trendTitle("RTK + Tools", "tool compression and command savings over time"),
    trendKpis([
      ["rtk cmds", String(model.rtk.commands)],
      ["io", `${formatInteger(model.rtk.inputTokens)}->${formatInteger(model.rtk.outputTokens)}`],
      ["saved", formatInteger(model.rtk.savedTokens)],
      ["tool", `${model.rtk.toolSavingsPct.toFixed(1)}%`],
      ["latest tools", String(points.at(-1)?.toolCalls ?? 0)],
    ], width),
    trendChart("rtk saved", points.map((point) => point.rtkSaved), width, formatInteger),
    trendChart("tool calls", points.map((point) => point.toolCalls), width, formatInteger),
    trendChart("without rtk", points.map((point) => point.withoutRtkTokens), width, formatInteger),
    trendRecentTable(points, width),
  ].flat();
}

function trendCompactRows(model: TokenmaxxingTrendModel, width: number): TokenmaxxingScreenRow[] {
  const compacts = model.compactEvents;
  const rows: TokenmaxxingScreenRow[] = [
    trendTitle("Compact", "observed post-compact token and message retention"),
    trendKpis([
      ["events", String(compacts.length)],
      ["latest", compacts.at(-1)?.summaryStrategy ?? "-"],
      ["archived", formatInteger(sumDefined(compacts.map((item) => item.archivedEvents)))],
    ], width),
    trendChart("tokens before", compacts.map((item) => item.compactTokensBefore), width, formatInteger),
    trendChart("tokens after", compacts.map((item) => item.compactTokensAfter), width, formatInteger),
    trendChart("messages saved", compacts.map((item) => item.compressedMessages), width, formatInteger),
  ].flat();
  if (!compacts.length) {
    rows.push(row(fg256(244, "No compact events yet."), "trend"));
    return rows;
  }
  rows.push(row(trendTableHeader(["epoch", "reason", "tokens", "messages", "archive"], width), "trend"));
  for (const compact of compacts.slice(-8).reverse()) {
    rows.push(row(trendTableRow([
      shortEpochId(compact.promptEpochId),
      compact.compactReason ?? "-",
      compact.compactTokensBefore === undefined ? "-" : `${formatInteger(compact.compactTokensBefore)}->${compact.compactTokensAfter === undefined ? "pending" : formatInteger(compact.compactTokensAfter)}`,
      compactMessageDelta(compact.promptMessagesBefore, compact.promptMessagesAfter, compact.compressedMessages) ?? "-",
      compact.archivedEvents === undefined ? "-" : formatInteger(compact.archivedEvents),
    ], width), "trend"));
  }
  return rows;
}

function trendTitle(title: string, subtitle: string): TokenmaxxingScreenRow[] {
  return [
    row(`${fg256(39, title)} ${fg256(244, subtitle)}`, "section"),
  ];
}

function trendKpis(items: Array<[string, string]>, width: number): TokenmaxxingScreenRow[] {
  const rendered = items.map(([label, value]) => `${fg256(244, label)} ${fg256(252, value)}`);
  const rows: TokenmaxxingScreenRow[] = [];
  let current = "";
  for (const item of rendered) {
    const next = current ? `${current}   ${item}` : item;
    if (visibleWidth(next) > width && current) {
      rows.push(row(current, "trend"));
      current = item;
    } else {
      current = next;
    }
  }
  if (current) {
    rows.push(row(current, "trend"));
  }
  return rows;
}

function trendChart(label: string, rawValues: Array<number | undefined>, width: number, formatValue: (value: number) => string): TokenmaxxingScreenRow[] {
  const values = rawValues.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) {
    return [row(leftCell(label, 16) + fg256(244, "no data"), "trend")];
  }
  const chartWidth = Math.max(12, width - 44);
  const latest = values.at(-1) ?? 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const stats = `${fg256(244, "now")} ${formatValue(latest)}  ${fg256(244, "min")} ${formatValue(min)}  ${fg256(244, "max")} ${formatValue(max)}`;
  return [row(`${leftCell(label, 16)}${sparkline(values, chartWidth)}  ${stats}`, "trend")];
}

function sparkline(values: number[], width: number): string {
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const safeWidth = Math.max(1, Math.floor(width));
  const sampled = sampleValues(values, safeWidth);
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = max - min;
  const chars = sampled.map((value) => {
    const index = span <= 0 ? blocks.length - 1 : Math.max(0, Math.min(blocks.length - 1, Math.round(((value - min) / span) * (blocks.length - 1))));
    return blocks[index]!;
  }).join("");
  return fg256(39, chars);
}

function sampleValues(values: number[], width: number): number[] {
  if (values.length <= width) {
    return values;
  }
  const out: number[] = [];
  for (let index = 0; index < width; index += 1) {
    const source = Math.floor((index / Math.max(1, width - 1)) * (values.length - 1));
    out.push(values[source]!);
  }
  return out;
}

function trendRecentTable(points: TokenmaxxingTrendPoint[], width: number): TokenmaxxingScreenRow[] {
  if (!points.length) {
    return [row(fg256(244, "No model calls yet."), "trend")];
  }
  const rows = [row(trendTableHeader(["turn", "event", "cache", "gap", "prefix", "tokens"], width), "trend")];
  for (const point of points.slice(-8).reverse()) {
    rows.push(row(trendTableRow([
      point.label,
      point.event,
      point.actualHit === undefined || point.oracleHit === undefined ? "-" : `${formatPlainPct(point.actualHit)}/${formatPlainPct(point.oracleHit)}`,
      point.cacheDiff === undefined ? "-" : formatPlainPct(point.cacheDiff),
      prefixTrendBadge(point.prefixStatus),
      formatInteger(point.actualTokens),
    ], width), "trend"));
  }
  return rows;
}

function trendEpochRows(compacts: EpochSummary[], width: number): TokenmaxxingScreenRow[] {
  if (!compacts.length) {
    return [row(fg256(244, "No epoch compaction boundaries yet."), "trend")];
  }
  const rows = [row(trendTableHeader(["epoch", "reason", "observed tokens", "messages", "archived"], width), "trend")];
  for (const compact of compacts.slice(-6).reverse()) {
    rows.push(row(trendTableRow([
      shortEpochId(compact.promptEpochId),
      compact.compactReason ?? "-",
      compact.compactTokensBefore === undefined ? "-" : `${formatInteger(compact.compactTokensBefore)}->${compact.compactTokensAfter === undefined ? "pending" : formatInteger(compact.compactTokensAfter)}`,
      compactMessageDelta(compact.promptMessagesBefore, compact.promptMessagesAfter, compact.compressedMessages) ?? "-",
      compact.archivedEvents === undefined ? "-" : formatInteger(compact.archivedEvents),
    ], width), "trend"));
  }
  return rows;
}

function compactMessageDelta(before?: number, after?: number, saved?: number): string | undefined {
  if (before === undefined || after === undefined) {
    return undefined;
  }
  return `${before}->${after} saved ${saved ?? Math.max(0, before - after)}`;
}

function trendTableHeader(cells: string[], width: number): string {
  return fg256(244, trendTableRow(cells, width));
}

function trendTableRow(cells: string[], width: number): string {
  const base = [14, 12, 20, 18, 10, 16, 16];
  const separator = "  ";
  const widths = base.slice(0, cells.length);
  const rendered = cells.map((cell, index) => leftCell(cell, widths[index] ?? 12)).join(separator).trimEnd();
  return truncateToWidth(rendered, width);
}

function prefixSequence(points: TokenmaxxingTrendPoint[], width: number): string {
  const recent = points.slice(-Math.max(1, width));
  return recent.map((point) => {
    switch (point.prefixStatus) {
      case "safe":
        return fg256(48, "S");
      case "changed":
        return fg256(203, "B");
      case "new_epoch":
        return fg256(244, "N");
      case "unknown":
        return fg256(244, "?");
      default:
        return fg256(244, "L");
    }
  }).join("");
}

function prefixTrendBadge(status?: string): string {
  switch (status) {
    case "safe":
      return "safe";
    case "changed":
      return "break";
    case "new_epoch":
      return "new";
    case "unknown":
      return "?";
    default:
      return "legacy";
  }
}

function rollingRate(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
  });
}

function average(values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : undefined;
}

function maxDefined(values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length ? Math.max(...finite) : undefined;
}

function sumDefined(values: Array<number | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function trendTurnLabel(turn: TurnSummary): string {
  if (turn.kind === "compaction") {
    return "compact";
  }
  if (turn.kind === "model_call") {
    return `${turn.runOrdinal}.${turn.stepIndex ?? turn.index}`;
  }
  return String(turn.index);
}

function rtkSummaryForStep(
  events: SessionEvent[],
  runId: string,
  stepId: string | undefined,
  stepIndex: number | undefined,
  modelTokens: number,
  toolCalls: number,
): RtkSavingsSummary {
  const stepEvents = events.filter((event) => {
    if (event.type !== "rtk.tool_savings" || event.run_id !== runId) {
      return false;
    }
    if (stepId) {
      return stringField(event.data.step_id) === stepId;
    }
    if (stepIndex !== undefined) {
      return optionalNumberField(event.data.step_index) === stepIndex;
    }
    return false;
  });
  const summary = rtkSummaryFromEvents(stepEvents, modelTokens, toolCalls);
  return { ...summary, estimated_without_rtk_tokens: modelTokens + summary.saved_tokens };
}

function rtkSummaryFromEvents(events: SessionEvent[], modelTokens: number, toolCalls: number): RtkSavingsSummary {
  let rtkToolCalls = 0;
  let rtkCommands = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let savedTokens = 0;
  let okEvents = 0;
  let unavailableEvents = 0;
  let nonOkEvents = 0;
  for (const event of events) {
    const rtk = rtkSummary(event.data);
    rtkToolCalls += 1;
    rtkCommands += rtk.rtk_commands;
    inputTokens += rtk.input_tokens;
    outputTokens += rtk.output_tokens;
    savedTokens += rtk.saved_tokens;
    if (rtk.status === "ok") {
      okEvents += 1;
    } else if (rtk.status === "unavailable") {
      unavailableEvents += 1;
      nonOkEvents += 1;
    } else if (rtk.status !== "disabled") {
      nonOkEvents += 1;
    }
  }
  const status = nonOkEvents > 0 && okEvents === 0 && unavailableEvents > 0 ? "unavailable" : nonOkEvents > 0 ? "partial" : "ok";
  return {
    tool_calls: toolCalls,
    rtk_tool_calls: rtkToolCalls,
    rtk_commands: rtkCommands,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    saved_tokens: savedTokens,
    savings_pct: inputTokens > 0 ? (savedTokens / inputTokens) * 100 : 0,
    estimated_without_rtk_tokens: modelTokens + savedTokens,
    status,
  };
}

function cacheLine(cache: CacheTotals): string {
  if (!cache.promptTurns || !cache.promptTokens) {
    return fg256(244, cache.warmupTurns ? "prefix cache warming · no steady turns yet" : "prefix cache unavailable");
  }
  const hit = (cache.cachedTokens / cache.promptTokens) * 100;
  return [
    `${fg256(39, "prefix cache")} ${hit.toFixed(1)}%`,
    `${cache.cachedTokens}/${cache.promptTokens}`,
    `${cache.promptTurns}/${Math.max(cache.promptTurns, cache.turns - cache.warmupTurns)} turns`,
    cache.warmupTurns ? `warmup ${cache.warmupTurns}` : undefined,
  ].filter((part): part is string => Boolean(part)).join(" · ");
}

function rtkLine(rtk: RtkTotals): string {
  return [
    `${fg256(39, "rtk")} ${rtk.commands} cmds`,
    `io ${rtk.inputTokens}->${rtk.outputTokens}`,
    `saved ${rtk.savedTokens}`,
    rtk.toolSavingsPct > 0 ? `tool ${rtk.toolSavingsPct.toFixed(1)}%` : undefined,
  ].filter((part): part is string => Boolean(part)).join(" · ");
}

function tokenmaxxingSignalRows(allEvents: SessionEvent[], events: SessionEvent[], width: number): TokenmaxxingScreenRow[] {
  const runOrdinals = runOrdinalMap(allEvents);
  const rows: TokenmaxxingScreenRow[] = [
    row(fg256(39, "Recent signals"), "section"),
    row(formatSignalRow([fg256(244, "time"), fg256(244, "signal"), fg256(244, "turn"), fg256(244, "tokens"), fg256(244, "cache"), fg256(244, "status"), fg256(244, "detail")], width), "signal"),
  ];
  rows.push(...events.map((event) => row(formatSignalRow(signalCells(event, runOrdinals), width), "signal")));
  return rows;
}

function signalCells(event: SessionEvent, runOrdinals: Map<string, number>): string[] {
  const data = event.data;
  switch (event.type) {
    case "model.response.settled": {
      const usage = usageField(data.usage);
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, "model response"),
        signalTurnLabel(event, runOrdinals),
        usageTokensLabel(usage),
        usageCacheLabel(usage),
        httpStatusLabel(data.http_status),
        signalTextDetail(data),
      ];
    }
    case "endpoint.evidence.recorded":
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, "cache evidence"),
        signalTurnLabel(event, runOrdinals),
        promptTokenSignalLabel(data.prompt_tokens),
        evidenceCacheLabel(data),
        compactInlineString(data.model ?? data.provider_id ?? data.request_class, 80),
        compactInlineString(data.prompt_hash ?? data.prompt_epoch_id, 120),
      ];
    case "prompt.epoch.created":
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, "epoch"),
        "",
        "",
        stringField(data.prompt_epoch_id) ? `epoch ${shortEpochId(String(data.prompt_epoch_id))}` : "",
        compactInlineString(data.reason, 32),
        compactInlineString(data.tool_schema_hash ?? data.prompt_layout_hash, 140),
      ];
    case "context.compacted":
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, "compact memory"),
        signalRunLabel(event, runOrdinals),
        optionalNumberField(data.archived_events) === undefined ? "" : `archived ${optionalNumberField(data.archived_events)}`,
        "",
        compactInlineString(data.reason, 32),
        compactSignalDetail(data),
      ];
    case "evidence.context_compression":
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, "compact"),
        signalRunLabel(event, runOrdinals),
        compressionTokenLabel(data),
        stringField(data.epoch_id) ? `epoch ${shortEpochId(String(data.epoch_id))}` : "",
        compactInlineString(data.reason, 32),
        compactSignalDetail(data),
      ];
    case "context.compaction.failed":
      return [
        signalTime(event.created_at ?? ""),
        fg256(203, "compact fail"),
        signalRunLabel(event, runOrdinals),
        "",
        stringField(data.prompt_epoch_id) ? `epoch ${shortEpochId(String(data.prompt_epoch_id))}` : "",
        compactInlineString(data.reason, 32),
        compactInlineString(compactFailureDetail(data), 180),
      ];
    case "context.compaction.auto_paused":
      return [
        signalTime(event.created_at ?? ""),
        fg256(203, "compact paused"),
        signalRunLabel(event, runOrdinals),
        "",
        "",
        "breaker",
        compactInlineString(`failures ${data.consecutive_failures}/${data.failure_limit} · manual /compact allowed`, 180),
      ];
    case "context.compaction.skipped":
      return [
        signalTime(event.created_at ?? ""),
        fg256(214, "compact skipped"),
        signalRunLabel(event, runOrdinals),
        compressionTokenLabel(data),
        stringField(data.prompt_epoch_id) ? `epoch ${shortEpochId(String(data.prompt_epoch_id))}` : "",
        compactInlineString(data.skipped_reason, 40),
        compactInlineString(data.provider_error ?? data.reason, 180),
      ];
    case "rtk.tool_savings": {
      const rtk = rtkSummary(data);
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, "rtk saving"),
        signalTurnLabel(event, runOrdinals),
        rtk.input_tokens || rtk.output_tokens ? `${rtk.input_tokens}->${rtk.output_tokens}` : "",
        rtk.saved_tokens ? `saved ${rtk.saved_tokens}` : "",
        rtk.status,
        compactInlineString(data.rewritten_command ?? data.original_command ?? data.tool_name ?? data.tool_call_id, 140),
      ];
    }
    case "run.completed":
    case "run.stopped":
    case "run.failed":
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, runSignalName(event.type)),
        signalRunLabel(event, runOrdinals),
        numberField(data.tokens) ? `tokens ${numberField(data.tokens)}` : "",
        "",
        runStatusLabel(event.type, data),
        runDetailLabel(data),
      ];
    default:
      return [
        signalTime(event.created_at ?? ""),
        fg256(39, event.type),
        signalRunLabel(event, runOrdinals),
        "",
        "",
        "",
        compactInlineString(signalKeyValueSummary(data, 4), 180),
      ];
  }
}

function formatSignalRow(cells: string[], width: number): string {
  const widths = signalColumnWidths(width);
  const detailWidth = widths.at(-1) ?? 20;
  const rendered = [
    leftCell(cells[0] ?? "", widths[0] ?? 8),
    leftCell(cells[1] ?? "", widths[1] ?? 14),
    leftCell(cells[2] ?? "", widths[2] ?? 10),
    leftCell(cells[3] ?? "", widths[3] ?? 18),
    leftCell(cells[4] ?? "", widths[4] ?? 14),
    leftCell(cells[5] ?? "", widths[5] ?? 10),
    truncateToWidth(cells[6] ?? "", detailWidth),
  ].join("  ");
  return truncateToWidth(rendered, width);
}

function signalColumnWidths(width: number): number[] {
  const fixed = [8, 16, 12, 22, 16, 10];
  const separatorWidth = 2 * fixed.length;
  const detail = Math.max(20, width - fixed.reduce((sum, item) => sum + item, separatorWidth));
  return [...fixed, detail];
}

function leftCell(text: string, width: number): string {
  return padRight(truncateToWidth(text, width), width);
}

function summaryRows(cache: CacheTotals, rtk: RtkTotals, totalSaved: number, actualTokens: number, estimatedWithout: number, width: number): TokenmaxxingScreenRow[] {
  const left = [
    `${fg256(39, "saved")} ${totalSaved}`,
    `${fg256(39, "cache")} ${cache.cachedTokens}`,
    `${fg256(39, "rtk")} ${rtk.savedTokens}`,
    `${fg256(39, "tokens")} ${actualTokens}/${estimatedWithout}`,
  ].join(" · ");
  const cacheSummary = cacheLine(cache);
  const rtkSummary = rtk.commands > 0 ? rtkLine(rtk) : undefined;
  const right = rtkSummary ? `${cacheSummary} · ${rtkSummary}` : cacheSummary;
  const safeWidth = Math.max(20, width);

  if (visibleWidth(left) + visibleWidth(right) + 4 <= safeWidth) {
    return [row(fitLeftRight(left, right, safeWidth), "summary")];
  }
  if (!rtkSummary) {
    return [row(fitLeftRight(left, cacheSummary, safeWidth), "summary")];
  }
  return [
    row(fitLeftRight(left, cacheSummary, safeWidth), "summary"),
    row(fitLeftRight(rtkSummary, "", safeWidth), "summary"),
  ];
}

function turnTableHeader(width: number): string {
  return formatTurnTableRow([
    fg256(244, "turn"),
    fg256(244, "event"),
    fg256(244, "tokens"),
    fg256(244, "cache A/O"),
    fg256(244, "cache gap"),
    fg256(244, "prefix"),
    fg256(244, "tools"),
    fg256(244, "rtk"),
  ], width);
}

function turnLine(turn: TurnSummary, width: number): string {
  const cache = turnCacheCells(turn.cache);
  return formatTurnTableRow([
    turnLabel(turn),
    turnEventLabel(turn),
    `tokens ${turn.actualTokens}/${turn.withoutRtkTokens}`,
    cache.cache,
    cache.diff,
    prefixSafetyCell(turn),
    `tools ${turn.toolCalls}`,
    turn.rtk.rtk_commands > 0 ? `rtk ${turn.rtk.saved_tokens}` : fg256(244, "-"),
  ], width);
}

function epochLine(epoch: EpochSummary, width: number): string {
  const parts = epoch.compactReason
    ? [
        fg256(231, "compact"),
        fg256(159, compactReasonLabel(epoch.compactReason)),
        ...epochCompactTokenParts(epoch),
        epoch.archivedEvents === undefined ? undefined : fg256(195, `archived ${formatInteger(epoch.archivedEvents)}`),
      ]
    : [
        fg256(231, "new epoch"),
        fg256(159, createdEpochReasonLabel(epoch.createdReason)),
      ];
  return truncateToWidth(parts.filter((part): part is string => Boolean(part)).join(fg256(67, " · ")), width);
}

function epochCompactTokenParts(epoch: EpochSummary): string[] {
  if (epoch.compactTokensBefore === undefined) {
    return [];
  }
  if (epoch.compactTokensAfter === undefined) {
    return [fg256(195, `${formatInteger(epoch.compactTokensBefore)} -> pending`)];
  }
  const saved = Math.max(0, epoch.compactTokensBefore - epoch.compactTokensAfter);
  return [
    fg256(195, `${formatInteger(epoch.compactTokensBefore)} -> ${formatInteger(epoch.compactTokensAfter)}`),
    fg256(195, `saved ${formatInteger(saved)}`),
  ];
}

function compactReasonLabel(reason?: string): string {
  switch (reason) {
    case "provider-context-limit":
      return "context limit";
    case "threshold":
      return "threshold";
    case "manual":
      return "manual";
    default:
      return readableReason(reason ?? "compact");
  }
}

function createdEpochReasonLabel(reason?: string): string {
  switch (reason) {
    case "session-created":
      return "session start";
    case "session-or-layout":
      return "prompt layout changed";
    default:
      return readableReason(reason ?? "session");
  }
}

function readableReason(value: string): string {
  return value.replace(/[-_]+/g, " ");
}

function turnEpochId(turn: TurnSummary): string | undefined {
  if (turn.kind === "model_call") {
    return turn.promptEpochId ?? turn.cache?.promptEpochId;
  }
  return turn.cache?.promptEpochId;
}

function formatTurnTableRow(cells: Array<string | undefined>, width: number): string {
  const separator = "  ";
  const widths = turnTableWidths(width);
  const rendered = widths
    .map((cellWidth, index) => leftCell(cells[index] ?? "", cellWidth))
    .join(separator)
    .trimEnd();
  return truncateToWidth(rendered, width);
}

function turnTableWidths(width: number): number[] {
  const minimums = [10, 8, 15, 13, 9, 7, 7, 8];
  const maximums = [18, 18, 36, 34, 24, 18, 18, 24];
  const weights = [1.1, 1, 2, 2, 1.25, 1, 0.85, 0.85];
  const separatorWidth = 2 * (minimums.length - 1);
  const minimumSum = minimums.reduce((sum, value) => sum + value, 0);
  const maximumSum = maximums.reduce((sum, value) => sum + value, 0);
  const target = Math.max(minimumSum, Math.min(maximumSum, Math.max(1, width - separatorWidth)));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const widths = minimums.map((minimum, index) => {
    const proportional = Math.floor((target * (weights[index] ?? 1)) / weightSum);
    return Math.max(minimum, Math.min(maximums[index] ?? minimum, proportional));
  });
  rebalanceWidths(widths, minimums, maximums, target);
  return widths;
}

function rebalanceWidths(widths: number[], minimums: number[], maximums: number[], target: number): void {
  let current = widths.reduce((sum, value) => sum + value, 0);
  while (current < target) {
    const index = widestGrowthColumn(widths, maximums);
    if (index === -1) {
      break;
    }
    widths[index] = (widths[index] ?? 0) + 1;
    current += 1;
  }
  while (current > target) {
    const index = widestShrinkColumn(widths, minimums);
    if (index === -1) {
      break;
    }
    widths[index] = Math.max(0, (widths[index] ?? 0) - 1);
    current -= 1;
  }
}

function widestGrowthColumn(widths: number[], maximums: number[]): number {
  let candidate = -1;
  for (let index = 0; index < widths.length; index += 1) {
    if (widths[index]! >= maximums[index]!) {
      continue;
    }
    if (candidate === -1 || maximums[index]! - widths[index]! > maximums[candidate]! - widths[candidate]!) {
      candidate = index;
    }
  }
  return candidate;
}

function widestShrinkColumn(widths: number[], minimums: number[]): number {
  let candidate = -1;
  for (let index = 0; index < widths.length; index += 1) {
    if (widths[index]! <= minimums[index]!) {
      continue;
    }
    if (candidate === -1 || widths[index]! - minimums[index]! > widths[candidate]! - minimums[candidate]!) {
      candidate = index;
    }
  }
  return candidate;
}

function turnLabel(turn: TurnSummary): string {
  if (turn.kind === "compaction") {
    return fg256(87, "compact");
  }
  if (turn.kind === "model_call") {
    return `turn ${turn.runOrdinal}.${turn.stepIndex ?? turn.index}`;
  }
  return `turn ${turn.index}`;
}

function turnEventLabel(turn: TurnSummary): string {
  if (turn.kind === "compaction") {
    return fg256(87, "compact");
  }
  if (turn.kind === "model_call") {
    const name = modelCallEventName(turn);
    if (name === "user") {
      return fg256(87, name);
    }
    if (name === "reflect" || name === "verify") {
      return fg256(111, name);
    }
    return name;
  }
  return "run";
}

function modelCallEventName(turn: ModelCallSummary): string {
  switch (turn.requestClass) {
    case "reflection":
      return "reflect";
    case "verification":
      return "verify";
    case "background":
      return "bg";
    default:
      return turn.isRunStart ? "user" : "tool-loop";
  }
}

function turnCacheCells(cache?: CacheObservation): { cache: string; diff: string } {
  if (!cache) {
    return { cache: fg256(244, "-"), diff: fg256(244, "-") };
  }
  if (cache.kind === "warmup") {
    if (cache.actualHit !== undefined && cache.oracleHit !== undefined) {
      return {
        cache: fg256(244, `warm ${formatPlainPct(cache.actualHit)}/${formatPlainPct(cache.oracleHit)}`),
        diff: fg256(244, formatPlainPct(cache.cacheDiff ?? 0)),
      };
    }
    if (cache.actualHit !== undefined) {
      return { cache: fg256(244, `warm ${formatPlainPct(cache.actualHit)}`), diff: fg256(244, "-") };
    }
    return { cache: fg256(244, "warm -"), diff: fg256(244, "-") };
  }
  if (cache.actualHit !== undefined && cache.oracleHit !== undefined) {
    return {
      cache: `${formatCacheHit(cache.actualHit)}/${formatCacheHit(cache.oracleHit)}`,
      diff: formatCacheDiff(cache.cacheDiff ?? 0),
    };
  }
  if (cache.actualHit !== undefined) {
    return { cache: formatCacheHit(cache.actualHit), diff: fg256(244, "-") };
  }
  if (cache.oracleHit !== undefined) {
    return { cache: `oracle ${formatCacheHit(cache.oracleHit)}`, diff: fg256(244, "-") };
  }
  return { cache: fg256(244, "-"), diff: fg256(244, "-") };
}

function prefixSafetyCell(turn: TurnSummary): string {
  if (turn.kind !== "run") {
    const status = prefixSafetyStatusLabel(turn.prefixCacheStatus);
    if (status) {
      return status;
    }
    return fg256(244, "legacy");
  }
  return fg256(244, "legacy");
}

function prefixSafetyStatusLabel(status?: string): string | undefined {
  switch (status) {
    case "new_epoch":
      return fg256(244, "new");
    case "safe":
      return fg256(48, "safe");
    case "changed":
      return fg256(203, "break");
    case "unknown":
      return fg256(244, "?");
    default:
      return undefined;
  }
}

function formatPlainPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function isRunEvent(event: SessionEvent): boolean {
  return event.type === "run.completed" || event.type === "run.stopped" || event.type === "run.failed";
}

function isTokenmaxxingActivityEvent(event: SessionEvent): boolean {
  return (
    event.type === "endpoint.evidence.recorded" ||
    event.type === "prompt.epoch.created" ||
    event.type === "context.compacted" ||
    event.type === "evidence.context_compression" ||
    event.type === "context.compaction.failed" ||
    event.type === "context.compaction.auto_paused" ||
    event.type === "context.compaction.skipped" ||
    event.type === "model.response.settled" ||
    event.type === "rtk.tool_savings" ||
    event.type === "run.completed" ||
    event.type === "run.stopped" ||
    event.type === "run.failed"
  );
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

function runOrdinalMap(events: SessionEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const event of events) {
    if (!event.run_id || out.has(event.run_id)) {
      continue;
    }
    out.set(event.run_id, out.size + 1);
  }
  return out;
}

function signalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return truncateToWidth(value, 8);
  }
  return date.toISOString().slice(11, 19);
}

function signalTurnLabel(event: SessionEvent, runOrdinals: Map<string, number>): string {
  if (!event.run_id) {
    return "";
  }
  const run = runOrdinals.get(event.run_id) ?? 0;
  const step = optionalNumberField(event.data.step_index);
  return step === undefined ? `run ${run}` : `turn ${run}.${step}`;
}

function signalRunLabel(event: SessionEvent, runOrdinals: Map<string, number>): string {
  if (!event.run_id) {
    return "";
  }
  return `run ${runOrdinals.get(event.run_id) ?? 0}`;
}

function usageTokensLabel(usage?: ModelUsage): string {
  if (!usage) {
    return "";
  }
  const prompt = optionalNumberField(usage.prompt_tokens);
  const completion = optionalNumberField(usage.completion_tokens);
  const total = optionalNumberField(usage.total_tokens);
  const parts = [
    prompt === undefined ? undefined : `p ${prompt}`,
    completion === undefined ? undefined : `c ${completion}`,
    total === undefined ? undefined : `t ${total}`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ");
}

function usageCacheLabel(usage?: ModelUsage): string {
  const prompt = optionalNumberField(usage?.prompt_tokens);
  const cached = optionalNumberField(usage?.cached_prompt_tokens);
  if (prompt === undefined || cached === undefined || prompt <= 0) {
    return "";
  }
  return `cache ${formatCacheHit(ratio(cached, prompt))}`;
}

function promptTokenSignalLabel(value: unknown): string {
  const tokens = optionalNumberField(value);
  return tokens === undefined ? "" : `prompt ${tokens}`;
}

function evidenceCacheLabel(data: JsonObject): string {
  const hit = optionalNumberField(data.cache_hit_rate);
  if (hit !== undefined) {
    return `cache ${formatCacheHit(hit)}`;
  }
  const prompt = optionalNumberField(data.prompt_tokens);
  const cached = optionalNumberField(data.cached_prompt_tokens);
  if (prompt !== undefined && cached !== undefined && prompt > 0) {
    return `cache ${formatCacheHit(ratio(cached, prompt))}`;
  }
  return "";
}

function httpStatusLabel(value: unknown): string {
  const status = optionalNumberField(value);
  return status === undefined ? "ok" : `http ${status}`;
}

function signalTextDetail(data: JsonObject): string {
  return compactInlineString(
    data.output ?? data.text ?? data.message ?? data.response ?? data.model ?? data.request_id ?? data.provider_id,
    180,
  );
}

function runSignalName(type: string): string {
  switch (type) {
    case "run.completed":
      return "run complete";
    case "run.stopped":
      return "run stopped";
    case "run.failed":
      return "run failed";
    default:
      return type;
  }
}

function runStatusLabel(type: string, data: JsonObject): string {
  if (type === "run.failed") {
    return "failed";
  }
  if (type === "run.stopped") {
    return compactInlineString(data.reason, 32) || "stopped";
  }
  return "ok";
}

function runDetailLabel(data: JsonObject): string {
  const parts = [
    optionalNumberField(data.tool_rounds) === undefined ? undefined : `loops ${optionalNumberField(data.tool_rounds)}`,
    optionalNumberField(data.tool_calls) === undefined ? undefined : `tools ${optionalNumberField(data.tool_calls)}`,
    optionalNumberField(data.duration_ms) === undefined ? undefined : `time ${formatDuration(optionalNumberField(data.duration_ms)!)}`,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

function compressionTokenLabel(data: JsonObject): string {
  const estimated = optionalNumberField(data.estimated_tokens);
  const threshold = optionalNumberField(data.threshold_tokens);
  if (estimated === undefined) {
    return "";
  }
  return threshold === undefined ? `est ${estimated}` : `est ${estimated}/${threshold}`;
}

function compactSignalDetail(data: JsonObject): string {
  const parts = [
    stringField(data.summary_strategy) ? `strategy ${stringField(data.summary_strategy)}` : undefined,
    Array.isArray(data.attempted_summary_strategies) ? `attempts ${data.attempted_summary_strategies.join("->")}` : undefined,
    data.model_summary_failed === true ? "fallback deterministic" : undefined,
    stringField(data.threshold_source) ? `trigger ${stringField(data.threshold_source)}` : undefined,
    compressionMessageDelta(
      optionalNumberField(data.prompt_messages_before),
      optionalNumberField(data.prompt_messages_after),
      optionalNumberField(data.compressed_messages),
    ),
    optionalNumberField(data.archived_events) === undefined ? undefined : `archived ${optionalNumberField(data.archived_events)}`,
    optionalNumberField(data.protected_tail_events) === undefined ? undefined : `protected ${optionalNumberField(data.protected_tail_events)}`,
    optionalNumberField(data.preserved_tail_events) === undefined ? undefined : `preserved ${optionalNumberField(data.preserved_tail_events)}`,
    optionalNumberField(data.preserved_rounds) === undefined ? undefined : `rounds ${optionalNumberField(data.preserved_rounds)}`,
    optionalNumberField(data.preserved_run_anchor_count) === undefined ? undefined : `anchors ${optionalNumberField(data.preserved_run_anchor_count)}`,
    stringField(data.archive_resource_uri),
  ].filter((part): part is string => Boolean(part));
  return compactInlineString(parts.join(" · "), 180);
}

function compactFailureDetail(data: JsonObject): string {
  const parts = [
    data.soft === true ? "model fallback" : "failed",
    optionalNumberField(data.consecutive_failures) === undefined || optionalNumberField(data.failure_limit) === undefined
      ? undefined
      : `${optionalNumberField(data.consecutive_failures)}/${optionalNumberField(data.failure_limit)}`,
    Array.isArray(data.failed_summary_strategies) ? `failed ${data.failed_summary_strategies.join("->")}` : undefined,
    stringField(data.error),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

function compressionTokenDelta(before?: number, after?: number): string | undefined {
  if (before === undefined) {
    return undefined;
  }
  if (after === undefined) {
    return `observed tokens ${before}->pending`;
  }
  return `observed tokens ${before}->${after} saved ${Math.max(0, before - after)}`;
}

function compressionMessageDelta(before?: number, after?: number, saved?: number): string | undefined {
  if (before === undefined || after === undefined) {
    return undefined;
  }
  const compressed = saved ?? Math.max(0, before - after);
  return `messages ${before}->${after} saved ${compressed}`;
}

function shortEpochId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 5)}...${value.slice(-4)}` : value;
}

function signalKeyValueSummary(data: JsonObject, limit: number): string {
  return Object.entries(data)
    .slice(0, limit)
    .map(([key, value]) => {
      const rendered = compactInlineString(value, 80);
      return rendered ? `${key} ${rendered}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function cacheCallKey(runId: string, stepId?: string, stepIndex?: number): string {
  if (stepId) {
    return `${runId}:step:${stepId}`;
  }
  if (stepIndex !== undefined) {
    return `${runId}:index:${stepIndex}`;
  }
  return `${runId}:run`;
}

function usageField(value: unknown): ModelUsage | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ModelUsage) : undefined;
}

function modelUsageTokenCost(usage?: ModelUsage): number {
  if (!usage) {
    return 0;
  }
  if (typeof usage.total_tokens === "number" && Number.isFinite(usage.total_tokens)) {
    return usage.total_tokens;
  }
  return numberField(usage.prompt_tokens) + numberField(usage.completion_tokens);
}

function toolCallCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function objectField(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compactInlineString(value: unknown, maxWidth: number): string {
  if (value === null || value === undefined) {
    return "";
  }
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value);
  } else if (Array.isArray(value)) {
    text = value.map((item) => compactInlineString(item, maxWidth)).filter(Boolean).slice(0, 6).join(", ");
  } else if (typeof value === "object") {
    text = Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, item]) => {
        const rendered = compactInlineString(item, maxWidth);
        return rendered ? `${key}=${rendered}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  } else {
    text = String(value);
  }
  return truncateToWidth(singleLine(text).replace(/ {2,}/g, " ").trim(), maxWidth);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCacheHit(value: number): string {
  return fg256(cacheHitColor(value), formatPercent(value));
}

function formatCacheDiff(value: number): string {
  return fg256(cacheDiffColor(value), formatPercent(value));
}

function cacheHitColor(value: number): number {
  if (value >= 0.8) {
    return 48;
  }
  if (value >= 0.5) {
    return 220;
  }
  return 203;
}

function cacheDiffColor(value: number): number {
  if (value < 0.1) {
    return 48;
  }
  if (value < 0.25) {
    return 220;
  }
  return 203;
}
