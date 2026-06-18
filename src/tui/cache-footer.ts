import type { JsonObject, ModelUsage, SessionEvent } from "../types.js";
import { ansi, fg256 } from "./ansi.js";

export type PrefixCacheTurnKind = "warmup" | "hit";

export interface CacheFooterInput {
  usage?: ModelUsage;
  requestId?: string;
  model?: string;
  mode?: string;
  latencyMs?: number;
  route?: JsonObject;
  showCacheHit?: boolean;
  cacheKind?: PrefixCacheTurnKind;
  previousPromptTokens?: number;
  cacheGap?: number;
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

interface CacheObservation extends CacheSource {
  callKey: string;
  kind: PrefixCacheTurnKind;
  previousPromptTokens?: number;
  oracleTokens?: number;
}

export function cacheHitRate(usage?: ModelUsage): number | undefined {
  const prompt = usage?.prompt_tokens;
  const cached = usage?.cached_prompt_tokens;
  if (prompt === undefined || cached === undefined || prompt <= 0) {
    return undefined;
  }
  return Math.max(0, Math.min(1, cached / prompt));
}

export function renderCacheFooter(input: CacheFooterInput): string {
  const usage = input.usage;
  const signal = cacheSignal(usage, input.previousPromptTokens, input.cacheGap);
  const parts: string[] = [];
  if (input.mode !== "auto" && input.showCacheHit !== false && shouldShowCacheSignal(signal)) {
    parts.push(formatFooterCacheSignal(signal, input.cacheKind ?? "hit"));
  }
  if (input.latencyMs !== undefined) {
    const duration = formatDuration(input.latencyMs);
    parts.push(fg256(244, input.mode === "auto" ? duration : `worked for ${duration}`));
  }
  return parts.join(" · ");
}

export function cacheFooterSummaryForRun(events: readonly SessionEvent[], endpointEvidence: readonly JsonObject[], runId: string): CacheFooterInput {
  const observations = cacheObservations(endpointEvidence, events).filter((item) => item.runId === runId);
  return cacheFooterSummaryFromObservations(observations);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds).toString()}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

interface CacheSignal {
  hit?: number;
  gap?: number;
}

function cacheSignal(usage?: ModelUsage, previousPromptTokens?: number, cacheGap?: number): CacheSignal {
  const hit = cacheHitRate(usage);
  if (hit === undefined) {
    return {};
  }
  const prompt = usage?.prompt_tokens;
  const oracle = previousPromptTokens !== undefined && prompt !== undefined && prompt > 0
    ? Math.max(0, Math.min(1, Math.min(previousPromptTokens, prompt) / prompt))
    : undefined;
  return {
    hit,
    gap: cacheGap ?? (oracle === undefined ? undefined : Math.max(0, oracle - hit)),
  };
}

function shouldShowCacheSignal(signal: CacheSignal): boolean {
  if (signal.hit === undefined) {
    return false;
  }
  return signal.hit > 0 || signal.gap !== undefined;
}

function formatFooterCacheSignal(signal: CacheSignal, kind: PrefixCacheTurnKind): string {
  const hit = signal.hit ?? 0;
  if (kind === "warmup") {
    return fg256(244, `${ansi.bold}warm cache ${formatPercent(hit)}${ansi.reset}`);
  }
  const label = "cache reuse";
  const gap = signal.gap === undefined ? "gap -" : `gap ${formatPercent(signal.gap)}`;
  const color = signal.gap === undefined ? 244 : cacheGapColor(signal.gap);
  return fg256(color, `${ansi.bold}${label} ${formatPercent(hit)} · ${gap}${ansi.reset}`);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function cacheGapColor(value: number): number {
  if (value < 0.1) {
    return 48;
  }
  if (value < 0.25) {
    return 220;
  }
  return 203;
}

function cacheFooterSummaryFromObservations(observations: CacheObservation[]): CacheFooterInput {
  const steady = observations.filter((item) => item.kind === "hit" && item.cachedTokens !== undefined);
  if (steady.length) {
    return aggregateCacheObservations(steady, "hit");
  }
  const latest = observations.slice().reverse().find((item) => item.cachedTokens !== undefined) ?? observations.at(-1);
  if (!latest) {
    return {};
  }
  return {
    usage: { prompt_tokens: latest.promptTokens, cached_prompt_tokens: latest.cachedTokens },
    cacheKind: latest.kind,
    previousPromptTokens: latest.previousPromptTokens,
    cacheGap: latest.kind === "warmup" ? undefined : cacheGap(latest),
  };
}

function aggregateCacheObservations(observations: CacheObservation[], kind: PrefixCacheTurnKind): CacheFooterInput {
  let promptTokens = 0;
  let cachedTokens = 0;
  let oracleTokens = 0;
  let hasOracle = true;
  for (const item of observations) {
    promptTokens += item.promptTokens;
    cachedTokens += item.cachedTokens ?? 0;
    if (item.oracleTokens === undefined) {
      hasOracle = false;
    } else {
      oracleTokens += item.oracleTokens;
    }
  }
  return {
    usage: { prompt_tokens: promptTokens, cached_prompt_tokens: cachedTokens },
    cacheKind: kind,
    cacheGap: hasOracle && promptTokens > 0 ? Math.max(0, (oracleTokens - cachedTokens) / promptTokens) : undefined,
  };
}

function cacheObservations(endpointEvidence: readonly JsonObject[], events: readonly SessionEvent[]): CacheObservation[] {
  const observations: CacheObservation[] = [];
  const previousPromptByEpoch = new Map<string, number>();
  const sources = cacheSources(endpointEvidence, events);
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
    const previousPromptTokens = previousPromptByEpoch.get(epochKey) ?? previousPromptInSession;
    observations.push({
      ...source,
      callKey,
      kind: warmupCallKeys.has(callKey) ? "warmup" : "hit",
      previousPromptTokens,
      oracleTokens: previousPromptTokens === undefined ? undefined : Math.min(previousPromptTokens, source.promptTokens),
    });
    previousPromptByEpoch.set(epochKey, source.promptTokens);
    previousPromptInSession = source.promptTokens;
  }
  return observations;
}

function cacheSources(endpointEvidence: readonly JsonObject[], events: readonly SessionEvent[]): CacheSource[] {
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
    const usage = objectField(event.data.usage);
    const prompt = optionalNumberField(usage.prompt_tokens);
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
      cachedTokens: optionalNumberField(usage.cached_prompt_tokens),
      order: index,
    });
  });
  endpointEvidence.forEach((item, index) => {
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

function epochWarmupCallKeys(sources: readonly CacheSource[]): Set<string> {
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

function cacheGap(observation: CacheObservation): number | undefined {
  if (observation.cachedTokens === undefined || observation.oracleTokens === undefined || observation.promptTokens <= 0) {
    return undefined;
  }
  return Math.max(0, (observation.oracleTokens - observation.cachedTokens) / observation.promptTokens);
}

function cacheCallKey(runId: string, stepId?: string, stepIndex?: number): string {
  return `${runId}:${stepId ?? ""}:${stepIndex ?? ""}`;
}

function objectField(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function optionalNumberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
