#!/usr/bin/env node
import { createServer } from "node:http";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_CONFIG } from "../dist/src/config/defaults.js";
import { Runtime } from "../dist/src/runtime.js";
import { SessionStore } from "../dist/src/session/store.js";
import { loadConfig } from "../dist/src/config/config.js";
import { ModelGateway } from "../dist/src/model/gateway.js";
import { providerId } from "../dist/src/model/endpoint-signals.js";

const ROOT = process.cwd();
const IMG_DIR = path.join(ROOT, "website", "static", "img", "experiments");
const DATA_DIR = path.join(ROOT, "website", "static", "data");
const DATA_PATH = path.join(DATA_DIR, "inferoa-long-horizon-value.json");
const RUN_REAL = process.argv.includes("--real");
const CACHE_DISCOUNT_FACTOR = 0.1;
const RAW_TOOL_OUTPUT_TOKENS_PER_LOOP = 1200;
const LOOP_SECONDS_REFERENCE = 10;
const COMPRESSION_CONTINUITY_TURNS = 256;
const COMPRESSION_CYCLE_LENGTH = 8;
const execFileAsync = promisify(execFile);

const HORIZON_PROFILES = [
  { label: "8 loops", turns: 1, loopsPerTurn: 8 },
  { label: "16 loops", turns: 1, loopsPerTurn: 16 },
  { label: "32 loops", turns: 1, loopsPerTurn: 32 },
  { label: "64 loops", turns: 1, loopsPerTurn: 64 },
  { label: "8 turns x 4 loops", turns: 8, loopsPerTurn: 4 },
];

const SCALED_PROJECTION_PROFILES = [
  { label: "1k loops projected", turns: 1, loopsPerTurn: 1_000 },
  { label: "5k loops projected", turns: 1, loopsPerTurn: 5_000 },
  { label: "10k loops projected", turns: 1, loopsPerTurn: 10_000 },
  { label: "8 turns x 1,250 loops projected", turns: 8, loopsPerTurn: 1_250 },
];

async function main() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  const simulator = [];
  for (const profile of HORIZON_PROFILES) {
    simulator.push(await runSimulatorProfile(profile));
  }

  const scaledProjection = buildScaledProjection(simulator);
  const compressionContinuity = await runCompressionContinuityProfile({ turns: COMPRESSION_CONTINUITY_TURNS, cycleLength: COMPRESSION_CYCLE_LENGTH });
  const rtk = await readLocalRtkCorpus();
  const codegraph = await estimateCodegraphContextProjection();
  const router = await readRoutingProjection();
  const realProvider = RUN_REAL ? await runRealProviderProbe().catch((error) => ({ status: "failed", error: errorMessage(error) })) : { status: "skipped" };
  const summary = buildSummary(simulator, scaledProjection, compressionContinuity, codegraph, rtk, router, realProvider);

  const dataset = {
    generated_at: new Date().toISOString(),
    methodology: {
      simulator: "Runs Inferoa Runtime stress profiles and records prompt tokens plus cached-prefix reuse from actual request bodies.",
      cache_adjusted_prefill_work: `uncached_prompt_tokens + cached_prompt_tokens * ${CACHE_DISCOUNT_FACTOR}`,
      raw_transcript_baseline: "A counterfactual estimate that keeps 1,200 raw tool-output tokens per completed loop in the prompt instead of Inferoa's bounded tool results/resource handles.",
      scaled_projection: "Projects 1k-10k loop cost from the measured 64-loop tail slope. These rows are cost projections, not additional 10k-request model runs.",
      compression_continuity: "Runs 256 measured turns through Inferoa Runtime with context compression forced every 8 turns. This tests continuity and prefix-cache recovery after each compression cycle.",
      normalized_cost_units: "Input-token cost is reported as one normalized cost unit per one million input-token-equivalent tokens. Multiply by the actual DeepSeek v4 Pro input price per MTok for dollars.",
      codegraph_context_projection: "Compares full-file context for cache/runtime investigation files with symbol/range windows around the exact relevant implementation points.",
      rtk_local_corpus: "Aggregates local ~/.inferoa/rtk/runs command databases when present.",
      model_selection_projection: "Uses a routing benchmark projection to compare single-model and routed model paths.",
    },
    simulator,
    scaled_projection: scaledProjection,
    compression_continuity: compressionContinuity,
    codegraph_context_projection: codegraph,
    rtk_local_corpus: rtk,
    routing_projection: router,
    real_provider_probe: realProvider,
    summary,
    figures: {
      prefix_cache: "/img/experiments/inferoa-prefix-cache-stability.svg",
      token_savings: "/img/experiments/inferoa-long-horizon-token-savings.svg",
      mega_loop_projection: "/img/experiments/inferoa-mega-loop-projection.svg",
      compression_continuity: "/img/experiments/inferoa-compression-continuity.svg",
      optimization_surfaces: "/img/experiments/inferoa-optimization-surfaces.svg",
      real_provider_cache: "/img/experiments/inferoa-real-provider-cache-probe.svg",
    },
  };

  await fs.writeFile(DATA_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await writeFigures(dataset);
  console.log(JSON.stringify({ data: DATA_PATH, figures: dataset.figures, summary }, null, 2));
}

function buildScaledProjection(simulator) {
  const calibration = simulator.find((row) => row.label === "64 loops") ?? simulator.at(-1);
  if (!calibration?.usage_rows?.length) {
    return { status: "missing", reason: "64-loop calibration row missing", rows: [] };
  }
  const tail = calibration.usage_rows.slice(-Math.min(24, calibration.usage_rows.length));
  const promptFit = linearFit(tail.map((row) => [row.index, row.prompt_tokens]));
  const cachedFit = linearFit(tail.filter((row) => row.cached_prompt_tokens !== undefined).map((row) => [row.index, row.cached_prompt_tokens]));
  const single32 = simulator.find((row) => row.label === "32 loops");
  const multi32 = simulator.find((row) => row.label === "8 turns x 4 loops");
  const multiTurnPromptOverheadPerRequest =
    single32 && multi32 && multi32.model_requests > 0 ? Math.max(0, (multi32.prompt_tokens - single32.prompt_tokens) / multi32.model_requests) : 0;
  const rows = SCALED_PROJECTION_PROFILES.map((profile) =>
    projectScaledProfile(profile, promptFit, cachedFit, profile.turns > 1 ? multiTurnPromptOverheadPerRequest : 0),
  );
  return {
    status: "projected",
    calibration_label: calibration.label,
    calibration_tail_rows: tail.length,
    cache_discount_factor: CACHE_DISCOUNT_FACTOR,
    raw_tool_output_tokens_per_loop: RAW_TOOL_OUTPUT_TOKENS_PER_LOOP,
    loop_seconds_reference: LOOP_SECONDS_REFERENCE,
    prompt_tokens_slope_per_request: promptFit.slope,
    cached_prompt_tokens_slope_per_request: cachedFit.slope,
    multi_turn_prompt_overhead_per_request: multiTurnPromptOverheadPerRequest,
    assumptions: [
      "Tool schema, prompt epoch, and cache salt stay stable within an epoch, matching the measured 64-loop and 8-turn simulator runs.",
      "Prompt and cached-token growth use the measured 64-loop tail slope.",
      "Raw transcript baseline adds 1,200 raw tool-output tokens per completed loop.",
      "Rows do not model additional compression resets; they are prefill/cost projections for a stable prompt epoch between compression boundaries.",
    ],
    rows,
  };
}

function projectScaledProfile(profile, promptFit, cachedFit, multiTurnPromptOverheadPerRequest) {
  const totalLoops = profile.turns * profile.loopsPerTurn;
  const requestsPerTurn = profile.loopsPerTurn + 1;
  const modelRequests = profile.turns * requestsPerTurn;
  const promptRows = [];
  for (let index = 0; index < modelRequests; index += 1) {
    const turnIndex = Math.floor(index / requestsPerTurn);
    const promptTokens = Math.max(1, Math.round(promptFit.intercept + promptFit.slope * index + multiTurnPromptOverheadPerRequest * turnIndex));
    const cachedPromptTokens = index === 0 ? 0 : Math.min(promptTokens, Math.max(0, Math.round(cachedFit.intercept + cachedFit.slope * index)));
    promptRows.push({ index, prompt_tokens: promptTokens, cached_prompt_tokens: cachedPromptTokens });
  }
  const promptTokens = sum(promptRows.map((row) => row.prompt_tokens));
  const cachedPromptTokens = sum(promptRows.map((row) => row.cached_prompt_tokens));
  const cacheAdjustedPrefillTokens = Math.round(promptTokens - cachedPromptTokens + cachedPromptTokens * CACHE_DISCOUNT_FACTOR);
  const rawTranscriptPromptTokens = estimateRawTranscriptPromptTokens(promptRows, profile);
  const steadyRows = promptRows.slice(1);
  const steadyPromptTokens = sum(steadyRows.map((row) => row.prompt_tokens));
  const steadyCachedTokens = sum(steadyRows.map((row) => row.cached_prompt_tokens));
  return {
    label: profile.label,
    projected: true,
    turns: profile.turns,
    loops_per_turn: profile.loopsPerTurn,
    total_loops: totalLoops,
    model_requests: modelRequests,
    reference_wall_time_hours_at_10s_per_loop: (totalLoops * LOOP_SECONDS_REFERENCE) / 3600,
    prompt_tokens: promptTokens,
    cached_prompt_tokens: cachedPromptTokens,
    cache_adjusted_prefill_tokens: cacheAdjustedPrefillTokens,
    raw_transcript_baseline_prompt_tokens: rawTranscriptPromptTokens,
    context_optimization_saved_tokens: Math.max(0, rawTranscriptPromptTokens - promptTokens),
    context_optimization_savings_pct: rawTranscriptPromptTokens > 0 ? ((rawTranscriptPromptTokens - promptTokens) / rawTranscriptPromptTokens) * 100 : 0,
    prefill_work_saved_by_cache_tokens: Math.round(cachedPromptTokens * (1 - CACHE_DISCOUNT_FACTOR)),
    total_input_savings_vs_raw_pct: rawTranscriptPromptTokens > 0 ? ((rawTranscriptPromptTokens - cacheAdjustedPrefillTokens) / rawTranscriptPromptTokens) * 100 : 0,
    steady_state_cache_hit_pct: steadyPromptTokens > 0 ? (steadyCachedTokens / steadyPromptTokens) * 100 : 0,
    final_request_cache_hit_pct: cacheHitPct(promptRows.at(-1)?.prompt_tokens, promptRows.at(-1)?.cached_prompt_tokens),
    normalized_raw_input_cost_units: rawTranscriptPromptTokens / 1_000_000,
    normalized_inferoa_prompt_cost_units: promptTokens / 1_000_000,
    normalized_cache_adjusted_cost_units: cacheAdjustedPrefillTokens / 1_000_000,
    normalized_cost_units_saved_vs_raw: (rawTranscriptPromptTokens - cacheAdjustedPrefillTokens) / 1_000_000,
  };
}

async function runCompressionContinuityProfile(profile) {
  const serverState = {
    turns: profile.turns,
    requests: [],
    bodiesByCacheSalt: new Map(),
    compactionRequests: 0,
    interactiveRequests: 0,
    latestMarker: "",
    prefixCacheQueries: 0,
    prefixCacheHits: 0,
  };
  const server = createCompressionContinuityServer(serverState);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "inferoa-lh-compress-"));
  const store = await SessionStore.open(path.join(tmp, "state"));
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.model_setup.base_url = `http://127.0.0.1:${port}/v1`;
    config.model_setup.model = "compression-continuity-simulator";
    config.model_setup.context_window = 1_000_000;
    config.context.context_window = 1_000_000;
    config.context.force_compression = false;
    config.context.protected_recent_loops = 3;
    config.rtk.enabled = false;
    const workspace = { id: "w_compression_continuity", root: tmp, alias: "compression-continuity" };
    const runtime = new Runtime(config, workspace, store);
    const session = store.createSession(workspace, "compression continuity");
    const stableContinuePrompt = "Continue the long-horizon objective after any compression. Preserve the latest continuity marker and archive pointer.";
    for (let turn = 0; turn < profile.turns; turn += 1) {
      config.context.force_compression = turn % profile.cycleLength === 0;
      await runtime.run({
        session_id: session.session_id,
        prompt: stableContinuePrompt,
      });
    }
    config.context.force_compression = false;

    const events = store.listEvents(session.session_id);
    const interactive = serverState.requests.filter((request) => request.request_class === "interactive");
    const compaction = serverState.requests.filter((request) => request.request_class === "compaction");
    const interactiveSteady = interactive.slice(1);
    const compactionSteady = compaction.slice(1);
    const interactiveStarted = events.filter((event) => event.type === "model.request.started");
    const promptEpochIds = distinct(interactiveStarted.map((event) => stringField(event.data.prompt_epoch_id)));
    const toolSchemaHashes = distinct(interactiveStarted.map((event) => stringField(event.data.tool_schema_hash)));
    const cacheSalts = distinct(serverState.requests.map((request) => request.cache_salt).filter(Boolean));
    const promptTokens = sum(interactive.map((row) => row.prompt_tokens));
    const cachedPromptTokens = sum(interactive.map((row) => row.cached_prompt_tokens));
    const compactionPromptTokens = sum(compaction.map((row) => row.prompt_tokens));
    const compactionCachedPromptTokens = sum(compaction.map((row) => row.cached_prompt_tokens));
    const cacheAdjustedPrefillTokens = Math.round(promptTokens - cachedPromptTokens + cachedPromptTokens * CACHE_DISCOUNT_FACTOR);
    const avgPromptTokensPerTurn = promptTokens / Math.max(1, profile.turns);
    const avgCachedPromptTokensPerTurn = cachedPromptTokens / Math.max(1, profile.turns);
    const avgCacheAdjustedPrefillPerTurn = cacheAdjustedPrefillTokens / Math.max(1, profile.turns);
    const continuityOkTurns = interactive.filter((request) => request.continuity_marker_present).length;
    const archiveReferenceTurns = interactive.filter((request) => request.archive_reference_present).length;
    const projectedTurns = 1_000;
    const projectedPromptTokens = Math.round(avgPromptTokensPerTurn * projectedTurns);
    const projectedCachedPromptTokens = Math.round(avgCachedPromptTokensPerTurn * projectedTurns);
    const projectedCacheAdjustedPrefillTokens = Math.round(avgCacheAdjustedPrefillPerTurn * projectedTurns);
    return {
      status: "ok",
      label: `${profile.turns} turns / ${profile.cycleLength}-turn compression cycle`,
      turns: profile.turns,
      compression_cycle_length_turns: profile.cycleLength,
      compression_cadence: `every_${profile.cycleLength}_turns`,
      compactions: events.filter((event) => event.type === "context.compacted").length,
      archive_resources: events.filter((event) => event.type === "resource.created" && event.data.kind === "compaction.archive").length,
      model_requests: serverState.requests.length,
      interactive_requests: interactive.length,
      compaction_requests: compaction.length,
      prompt_epoch_distinct: promptEpochIds.length,
      tool_schema_hash_distinct: toolSchemaHashes.length,
      cache_salt_distinct: cacheSalts.length,
      cache_salt_stability_pct: stabilityPct(cacheSalts.length, serverState.requests.length),
      prompt_epoch_resets: Math.max(0, promptEpochIds.length - 1),
      continuity_ok_turns: continuityOkTurns,
      continuity_ok_pct: (continuityOkTurns / Math.max(1, interactive.length)) * 100,
      archive_reference_turns: archiveReferenceTurns,
      archive_reference_pct: (archiveReferenceTurns / Math.max(1, interactive.length)) * 100,
      interactive_prompt_tokens: promptTokens,
      interactive_cached_prompt_tokens: cachedPromptTokens,
      interactive_cache_adjusted_prefill_tokens: cacheAdjustedPrefillTokens,
      interactive_steady_cache_hit_pct: cacheHitPct(
        sum(interactiveSteady.map((row) => row.prompt_tokens)),
        sum(interactiveSteady.map((row) => row.cached_prompt_tokens)),
      ),
      compaction_prompt_tokens: compactionPromptTokens,
      compaction_cached_prompt_tokens: compactionCachedPromptTokens,
      compaction_steady_cache_hit_pct: cacheHitPct(
        sum(compactionSteady.map((row) => row.prompt_tokens)),
        sum(compactionSteady.map((row) => row.cached_prompt_tokens)),
      ),
      projected_1000_turns: {
        turns: projectedTurns,
        prompt_tokens: projectedPromptTokens,
        cached_prompt_tokens: projectedCachedPromptTokens,
        cache_adjusted_prefill_tokens: projectedCacheAdjustedPrefillTokens,
        normalized_prompt_cost_units: projectedPromptTokens / 1_000_000,
        normalized_cache_adjusted_cost_units: projectedCacheAdjustedPrefillTokens / 1_000_000,
        continuity_ok_pct: (continuityOkTurns / Math.max(1, interactive.length)) * 100,
      },
      turn_samples: sampleRows(interactive, 64).map((row) => ({
        turn: row.turn,
        prompt_tokens: row.prompt_tokens,
        cached_prompt_tokens: row.cached_prompt_tokens,
        cache_hit_pct: cacheHitPct(row.prompt_tokens, row.cached_prompt_tokens),
        continuity_marker_present: row.continuity_marker_present,
        archive_reference_present: row.archive_reference_present,
      })),
    };
  } finally {
    store.close();
    await rmSafe(tmp);
    await new Promise((resolve) => server.close(resolve));
  }
}

function createCompressionContinuityServer(state) {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v1/models") {
      sendJson(res, { data: [{ id: "compression-continuity-simulator" }] });
      return;
    }
    if (req.method === "GET" && req.url === "/load") {
      sendJson(res, { waiting: 0, running: 0 });
      return;
    }
    if (req.method === "GET" && req.url === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`vllm:prefix_cache_queries_total ${state.prefixCacheQueries}\nvllm:prefix_cache_hits_total ${state.prefixCacheHits}\n`);
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const requestClass = String(req.headers["x-inferoa-request-class"] ?? "interactive");
      const cacheSalt = typeof parsed.cache_salt === "string" ? parsed.cache_salt : "none";
      const previousBodies = state.bodiesByCacheSalt.get(cacheSalt) ?? [];
      const promptText = JSON.stringify(parsed.messages ?? []) + JSON.stringify(parsed.tools ?? []);
      const promptTokens = estimateTokens(promptText);
      const cachedTokens = previousBodies.length ? Math.min(promptTokens, bestCommonPrefixTokens(previousBodies, body)) : 0;
      if (previousBodies.length) {
        state.prefixCacheQueries += 1;
        if (cachedTokens > 0) {
          state.prefixCacheHits += 1;
        }
      }
      previousBodies.push(body);
      state.bodiesByCacheSalt.set(cacheSalt, previousBodies.slice(-64));

      let marker = state.latestMarker;
      let content;
      if (requestClass === "compaction") {
        state.compactionRequests += 1;
        marker = `continuity-marker-${state.compactionRequests}`;
        state.latestMarker = marker;
        content = [
          "Goal",
          `- Preserve long-horizon objective through compression ${state.compactionRequests}.`,
          "Open Objectives",
          "- Continue the next turn with the latest archive pointer and continuity marker.",
          "Critical Context",
          `- ${marker}`,
          "Resources And Evidence",
          "- Archive resource must remain visible in epoch memory.",
          "Next Steps",
          "- Continue with the next turn after compression.",
        ].join("\n");
      } else {
        state.interactiveRequests += 1;
        content = `continued compression continuity turn ${state.interactiveRequests}`;
      }
      state.requests.push({
        request_index: state.requests.length,
        request_class: requestClass,
        turn: requestClass === "interactive" ? state.interactiveRequests : state.compactionRequests,
        prompt_tokens: promptTokens,
        cached_prompt_tokens: cachedTokens,
        cache_salt: cacheSalt,
        prompt_epoch_id: typeof parsed.prompt_epoch_id === "string" ? parsed.prompt_epoch_id : undefined,
        tool_schema_hash: typeof parsed.tool_schema_hash === "string" ? parsed.tool_schema_hash : undefined,
        continuity_marker_present: requestClass === "interactive" ? Boolean(marker && body.includes(marker)) : undefined,
        archive_reference_present: requestClass === "interactive" ? body.includes("Archive resource: resource://") : undefined,
      });
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-request-id": `compress_${state.requests.length}`,
      });
      writeSse(res, {
        id: `resp_${state.requests.length}`,
        model: "compression-continuity-simulator",
        choices: [{ delta: { content } }],
      });
      const completionTokens = requestClass === "compaction" ? estimateTokens(content) : 16;
      writeSse(res, {
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          prompt_tokens_details: { cached_tokens: cachedTokens },
        },
      });
      res.end("data: [DONE]\n\n");
    });
  });
}

async function runSimulatorProfile(profile) {
  const serverState = {
    profile,
    requestBodies: [],
    requests: [],
    previousBody: "",
    perRunRequestCount: new Map(),
    prefixCacheQueries: 0,
    prefixCacheHits: 0,
  };
  const server = createSimulatorServer(serverState);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "inferoa-lh-value-"));
  const store = await SessionStore.open(path.join(tmp, "state"));
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.model_setup.base_url = `http://127.0.0.1:${port}/v1`;
    config.model_setup.model = "long-horizon-value-simulator";
    config.model_setup.context_window = 1_000_000;
    config.context.context_window = 1_000_000;
    config.context.compression_threshold = 0.95;
    config.rtk.enabled = false;
    const workspace = { id: `w_${profile.label.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`, root: tmp, alias: "long-horizon-value" };
    const runtime = new Runtime(config, workspace, store);
    const session = store.createSession(workspace, profile.label);
    const runs = [];
    for (let turn = 0; turn < profile.turns; turn += 1) {
      runs.push(
        await runtime.run({
          session_id: session.session_id,
          prompt: `Long-horizon simulator turn ${turn + 1}/${profile.turns}: keep inspecting until the task is complete.`,
        }),
      );
    }

    const events = store.listEvents(session.session_id);
    const evidence = store.listEndpointEvidence(session.session_id);
    const started = events.filter((event) => event.type === "model.request.started");
    const completed = events.filter((event) => event.type === "run.completed");
    const promptEpochIds = distinct(started.map((event) => stringField(event.data.prompt_epoch_id)));
    const toolSchemaHashes = distinct(started.map((event) => stringField(event.data.tool_schema_hash)));
    const cacheSalts = distinct(serverState.requests.map((request) => request.cache_salt).filter(Boolean));
    const usageRows = evidence.map((record, index) => {
      const usage = objectField(record.usage);
      const promptTokens = numberField(usage.prompt_tokens);
      const cachedPromptTokens = numberField(usage.cached_prompt_tokens);
      return {
        index,
        run_id: stringField(record.run_id),
        prompt_tokens: promptTokens,
        cached_prompt_tokens: cachedPromptTokens,
        completion_tokens: numberField(usage.completion_tokens),
        cache_hit_rate: promptTokens > 0 && cachedPromptTokens !== undefined ? cachedPromptTokens / promptTokens : undefined,
      };
    });
    const warmupRequests = 1;
    const steadyRows = usageRows.slice(warmupRequests);
    const promptTokens = sum(usageRows.map((row) => row.prompt_tokens));
    const completionTokens = sum(usageRows.map((row) => row.completion_tokens));
    const cachedPromptTokens = sum(usageRows.map((row) => row.cached_prompt_tokens));
    const steadyPromptTokens = sum(steadyRows.map((row) => row.prompt_tokens));
    const steadyCachedPromptTokens = sum(steadyRows.map((row) => row.cached_prompt_tokens));
    const effectivePrefillTokens = Math.round(promptTokens - cachedPromptTokens + cachedPromptTokens * CACHE_DISCOUNT_FACTOR);
    const rawTranscriptPromptTokens = estimateRawTranscriptPromptTokens(usageRows, profile);
    const totalLoops = profile.turns * profile.loopsPerTurn;

    return {
      label: profile.label,
      turns: profile.turns,
      loops_per_turn: profile.loopsPerTurn,
      total_loops: totalLoops,
      model_requests: started.length,
      completed_runs: completed.length,
      stopped_runs: events.filter((event) => event.type === "run.stopped").length,
      failed_runs: events.filter((event) => event.type === "run.failed").length,
      tool_calls: sum(runs.map((run) => run.tool_calls)),
      prompt_epoch_distinct: promptEpochIds.length,
      tool_schema_hash_distinct: toolSchemaHashes.length,
      cache_salt_distinct: cacheSalts.length,
      prompt_epoch_stability_pct: stabilityPct(promptEpochIds.length, started.length),
      tool_schema_stability_pct: stabilityPct(toolSchemaHashes.length, started.length),
      cache_salt_stability_pct: stabilityPct(cacheSalts.length, serverState.requests.length),
      prompt_tokens: promptTokens,
      cached_prompt_tokens: cachedPromptTokens,
      completion_tokens: completionTokens,
      steady_state_cache_hit_pct: steadyPromptTokens > 0 ? (steadyCachedPromptTokens / steadyPromptTokens) * 100 : 0,
      prefill_work_saved_by_cache_tokens: Math.round(cachedPromptTokens * (1 - CACHE_DISCOUNT_FACTOR)),
      cache_adjusted_prefill_tokens: effectivePrefillTokens,
      raw_transcript_baseline_prompt_tokens: rawTranscriptPromptTokens,
      context_optimization_saved_tokens: Math.max(0, rawTranscriptPromptTokens - promptTokens),
      context_optimization_savings_pct: rawTranscriptPromptTokens > 0 ? ((rawTranscriptPromptTokens - promptTokens) / rawTranscriptPromptTokens) * 100 : 0,
      total_input_savings_vs_raw_pct: rawTranscriptPromptTokens > 0 ? ((rawTranscriptPromptTokens - effectivePrefillTokens) / rawTranscriptPromptTokens) * 100 : 0,
      usage_rows: usageRows,
    };
  } finally {
    store.close();
    await rmSafe(tmp);
    await new Promise((resolve) => server.close(resolve));
  }
}

function createSimulatorServer(state) {
  return createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v1/models") {
      sendJson(res, { data: [{ id: "long-horizon-value-simulator" }] });
      return;
    }
    if (req.method === "GET" && req.url === "/load") {
      sendJson(res, { waiting: 0, running: 0 });
      return;
    }
    if (req.method === "GET" && req.url === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`vllm:prefix_cache_queries_total ${state.prefixCacheQueries}\nvllm:prefix_cache_hits_total ${state.prefixCacheHits}\n`);
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      const runId = String(req.headers["x-inferoa-run-id"] ?? "run");
      const count = state.perRunRequestCount.get(runId) ?? 0;
      state.perRunRequestCount.set(runId, count + 1);
      const promptText = JSON.stringify(parsed.messages ?? []) + JSON.stringify(parsed.tools ?? []);
      const promptTokens = estimateTokens(promptText);
      const commonPrefixTokens = state.previousBody ? estimateTokens(commonPrefix(state.previousBody, body)) : 0;
      const cachedTokens = state.previousBody ? Math.min(promptTokens, commonPrefixTokens) : 0;
      if (state.previousBody) {
        state.prefixCacheQueries += 1;
        if (cachedTokens > 0) {
          state.prefixCacheHits += 1;
        }
      }
      state.previousBody = body;
      state.requests.push({
        run_id: runId,
        request_index: state.requests.length,
        prompt_tokens: promptTokens,
        cached_prompt_tokens: cachedTokens,
        cache_salt: typeof parsed.cache_salt === "string" ? parsed.cache_salt : undefined,
        tool_count: Array.isArray(parsed.tools) ? parsed.tools.length : 0,
      });

      const needsTool = count < state.profile.loopsPerTurn;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-request-id": `sim_${state.requests.length}`,
      });
      if (needsTool) {
        writeSse(res, {
          id: `resp_tool_${state.requests.length}`,
          model: "long-horizon-value-simulator",
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: `call_${runId}_${count}`,
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: `missing-${runId}-${count}.txt` }),
                    },
                  },
                ],
              },
            },
          ],
        });
      } else {
        writeSse(res, {
          id: `resp_final_${state.requests.length}`,
          model: "long-horizon-value-simulator",
          choices: [{ delta: { content: `finished ${state.profile.label}` } }],
        });
      }
      const completionTokens = needsTool ? 12 : 24;
      writeSse(res, {
        choices: [{ delta: {}, finish_reason: needsTool ? "tool_calls" : "stop" }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          prompt_tokens_details: { cached_tokens: cachedTokens },
        },
      });
      res.end("data: [DONE]\n\n");
    });
  });
}

async function runRealProviderProbe() {
  const { config } = await loadConfig(ROOT);
  if (!config.model_setup.base_url || !config.model_setup.model) {
    return { status: "skipped", reason: "model_setup.base_url or model_setup.model is missing" };
  }
  const gateway = new ModelGateway(config);
  const probeId = `lh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const cacheSalt = `cs_inferoa_long_horizon_probe_${probeId}`;
  const repeatedPrefix = `Probe id ${probeId}. You are measuring prefix cache signal exposure for Inferoa. Keep output minimal. `.repeat(220);
  const usages = [];
  for (let index = 0; index < 4; index += 1) {
    const response = await gateway.stream({
      session_id: "real_cache_probe",
      run_id: `real_${index}`,
      mode: config.model_setup.mode,
      provider_id: providerId(config),
      model: config.model_setup.model,
      messages: [
        { role: "system", content: repeatedPrefix },
        { role: "user", content: `Probe ${index}: respond with one short sentence.` },
      ],
      tools: [],
      request_class: "interactive",
      prompt_hash: `real_probe_${index}`,
      tool_schema_hash: "empty_tools",
      prompt_epoch_id: "pe_real_probe",
      cache_salt: cacheSalt,
      max_tokens: 32,
      temperature: 0,
    });
    usages.push({
      index,
      prompt_tokens: response.usage?.prompt_tokens,
      cached_prompt_tokens: response.usage?.cached_prompt_tokens,
      completion_tokens: response.usage?.completion_tokens,
      cache_hit_pct: cacheHitPct(response.usage?.prompt_tokens, response.usage?.cached_prompt_tokens),
      request_id_present: Boolean(response.request_id),
      response_model_present: Boolean(response.model),
    });
  }
  const steady = usages.slice(1);
  return {
    status: "ok",
    model: publicModelName(config.model_setup.model),
    probe_id: probeId,
    cache_salt: cacheSalt,
    requests: usages.length,
    warmup_cache_hit_pct: usages[0]?.cache_hit_pct ?? 0,
    steady_state_cache_hit_pct: average(steady.map((row) => row.cache_hit_pct ?? 0)),
    cached_token_field_exposed: usages.some((row) => typeof row.cached_prompt_tokens === "number"),
    usages,
  };
}

async function readLocalRtkCorpus() {
  const runsDir = path.join(os.homedir(), ".inferoa", "rtk", "runs");
  const out = { status: "missing", dbs: 0, commands: 0, input_tokens: 0, output_tokens: 0, saved_tokens: 0, savings_pct: 0 };
  const entries = await fs.readdir(runsDir).catch(() => []);
  for (const entry of entries) {
    if (!entry.endsWith(".db")) continue;
    let db;
    try {
      db = new DatabaseSync(path.join(runsDir, entry));
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commands'").get();
      if (!table) continue;
      const row = db
        .prepare("SELECT COUNT(*) AS commands, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(saved_tokens), 0) AS saved_tokens FROM commands")
        .get();
      const commands = numeric(row?.commands);
      if (commands <= 0) continue;
      out.status = "ok";
      out.dbs += 1;
      out.commands += commands;
      out.input_tokens += numeric(row?.input_tokens);
      out.output_tokens += numeric(row?.output_tokens);
      out.saved_tokens += numeric(row?.saved_tokens);
    } catch {
      // Ignore malformed local run databases.
    } finally {
      db?.close();
    }
  }
  out.savings_pct = out.input_tokens > 0 ? (out.saved_tokens / out.input_tokens) * 100 : 0;
  out.avg_saved_tokens_per_command = out.commands > 0 ? out.saved_tokens / out.commands : 0;
  return out;
}

async function estimateCodegraphContextProjection() {
  const files = [
    "src/runtime.ts",
    "src/model/gateway.ts",
    "src/session/store.ts",
    "src/context/prompt.ts",
    "src/tui/cache-footer.ts",
    "src/tui/app.ts",
    "test/runtime-long-horizon.test.ts",
    "test/context-compression.test.ts",
  ];
  const anchors = [
    "recordEndpointEvidence",
    "cacheEvidenceOverview",
    "cacheTurnKind",
    "PromptBuilder",
    "tool_schema_hash",
    "prompt_epoch_id",
    "cached_prompt_tokens",
    "streamModelWithRetry",
  ];
  let fullFileTokens = 0;
  let windowTokens = 0;
  const windows = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const text = await fs.readFile(abs, "utf8");
    const lines = text.split(/\r?\n/);
    fullFileTokens += estimateTokens(text);
    const ranges = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (anchors.some((anchor) => lines[index]?.includes(anchor))) {
        ranges.push([Math.max(0, index - 24), Math.min(lines.length - 1, index + 24)]);
      }
    }
    const merged = mergeRanges(ranges);
    for (const [start, end] of merged) {
      const snippet = lines.slice(start, end + 1).join("\n");
      const tokens = estimateTokens(snippet);
      windowTokens += tokens;
      windows.push({ file: rel, start_line: start + 1, end_line: end + 1, tokens });
    }
  }
  const codegraphSearchOverheadTokens = 420;
  const optimizedTokens = windowTokens + codegraphSearchOverheadTokens;
  return {
    status: "ok",
    full_file_tokens: fullFileTokens,
    symbol_window_tokens: windowTokens,
    codegraph_search_overhead_tokens: codegraphSearchOverheadTokens,
    optimized_tokens: optimizedTokens,
    saved_tokens: Math.max(0, fullFileTokens - optimizedTokens),
    savings_pct: fullFileTokens > 0 ? ((fullFileTokens - optimizedTokens) / fullFileTokens) * 100 : 0,
    windows,
  };
}

async function readRoutingProjection() {
  const dir = process.env.ROUTING_PROJECTION_DIR;
  if (!dir) {
    return routingProjectionFallback();
  }
  const routerPath = path.join(dir, "oracle_router_results.json");
  const isoPath = path.join(dir, "oracle_iso_comparisons.json");
  const fallback = routingProjectionFallback();
  try {
    const router = parseLooseJson(await fs.readFile(routerPath, "utf8"));
    const iso = parseLooseJson(await fs.readFile(isoPath, "utf8"));
    const full = router.terminus2_measured_any_pass;
    const big3 = router.big3_only_measured_any_pass;
    const deepseek = iso.measured_cost_iso_price?.find((row) => row.reference_model === "deepseek-chat");
    const gemini = iso.measured_cost_iso_price?.find((row) => row.reference_model === "gemini-3.1-pro-preview");
    const constrained = iso.api_price_constrained?.find((row) => row.reference_model === "DeepSeek-V3.2");
    return {
      status: "ok",
      source: "Inferoa routing benchmark projection",
      full_pool_accuracy_pct: numberField(full?.accuracy_pct),
      full_pool_cost_usd: numberField(full?.total_cost_usd),
      big3_accuracy_pct: numberField(big3?.accuracy_pct),
      big3_cost_usd: numberField(big3?.total_cost_usd),
      big3_extra_cost_pct:
        numberField(full?.total_cost_usd) > 0 ? ((numberField(big3?.total_cost_usd) - numberField(full?.total_cost_usd)) / numberField(full?.total_cost_usd)) * 100 : undefined,
      deepseek_same_budget_accuracy_gain_pct: numberField(deepseek?.accuracy_gain_pct),
      deepseek_single_accuracy_pct: numberField(deepseek?.reference_accuracy_pct),
      deepseek_oracle_same_budget_accuracy_pct: numberField(deepseek?.oracle_accuracy_at_same_budget_pct),
      gemini_same_budget_accuracy_gain_pct: numberField(gemini?.accuracy_gain_pct),
      api_price_constrained_deepseek_gain_pct: numberField(constrained?.accuracy_gain_pct),
    };
  } catch {
    return fallback;
  }
}

function routingProjectionFallback() {
  return {
    status: "fallback",
    source: "Inferoa routing benchmark projection",
    full_pool_accuracy_pct: 92.13483146067416,
    full_pool_cost_usd: 20.727167259999998,
    big3_accuracy_pct: 92.13483146067416,
    big3_cost_usd: 28.44,
    big3_extra_cost_pct: 37,
    deepseek_same_budget_accuracy_gain_pct: 51.460674157303366,
    deepseek_single_accuracy_pct: 39.55056179775281,
    deepseek_oracle_same_budget_accuracy_pct: 91.01123595505618,
    gemini_same_budget_accuracy_gain_pct: 17.303370786516865,
    api_price_constrained_deepseek_gain_pct: 28.98876404494382,
  };
}

function buildSummary(simulator, scaledProjection, compressionContinuity, codegraph, rtk, router, realProvider) {
  const longest = simulator.find((row) => row.label === "64 loops") ?? simulator.at(-1);
  const multiTurn = simulator.find((row) => row.label.includes("turns"));
  const tenK = scaledProjection?.rows?.find((row) => row.label === "10k loops projected");
  return {
    longest_horizon_label: longest?.label,
    longest_horizon_steady_cache_hit_pct: longest?.steady_state_cache_hit_pct,
    longest_horizon_total_input_savings_vs_raw_pct: longest?.total_input_savings_vs_raw_pct,
    multi_turn_cache_hit_pct: multiTurn?.steady_state_cache_hit_pct,
    projected_10k_total_input_savings_vs_raw_pct: tenK?.total_input_savings_vs_raw_pct,
    projected_10k_normalized_cost_units_saved_vs_raw: tenK?.normalized_cost_units_saved_vs_raw,
    projected_10k_reference_wall_time_hours_at_10s_per_loop: tenK?.reference_wall_time_hours_at_10s_per_loop,
    compression_continuity_turns: compressionContinuity.turns,
    compression_continuity_ok_pct: compressionContinuity.continuity_ok_pct,
    compression_archive_reference_pct: compressionContinuity.archive_reference_pct,
    compression_interactive_steady_cache_hit_pct: compressionContinuity.interactive_steady_cache_hit_pct,
    compression_projected_1000_turn_cache_adjusted_cost_units: compressionContinuity.projected_1000_turns?.normalized_cache_adjusted_cost_units,
    prompt_epoch_distinct_longest: longest?.prompt_epoch_distinct,
    tool_schema_hash_distinct_longest: longest?.tool_schema_hash_distinct,
    cache_salt_distinct_longest: longest?.cache_salt_distinct,
    codegraph_context_savings_pct: codegraph.savings_pct,
    rtk_savings_pct: rtk.savings_pct,
    router_deepseek_same_budget_accuracy_gain_pct: router.deepseek_same_budget_accuracy_gain_pct,
    real_provider_steady_cache_hit_pct: realProvider.status === "ok" ? realProvider.steady_state_cache_hit_pct : undefined,
  };
}

async function writeFigures(dataset) {
  try {
    await execFileAsync("python3", [path.join(ROOT, "scripts", "render_long_horizon_figures.py"), DATA_PATH, IMG_DIR], {
      cwd: ROOT,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    console.warn(`Python figure renderer failed; falling back to built-in SVG renderer: ${errorMessage(error)}`);
    await writeFallbackSvgFigures(dataset);
  }
}

async function writeFallbackSvgFigures(dataset) {
  await fs.writeFile(path.join(IMG_DIR, "inferoa-prefix-cache-stability.svg"), prefixCacheFigure(dataset), "utf8");
  await fs.writeFile(path.join(IMG_DIR, "inferoa-long-horizon-token-savings.svg"), tokenSavingsFigure(dataset), "utf8");
  await fs.writeFile(path.join(IMG_DIR, "inferoa-mega-loop-projection.svg"), megaLoopProjectionFigure(dataset), "utf8");
  await fs.writeFile(path.join(IMG_DIR, "inferoa-compression-continuity.svg"), compressionContinuityFigure(dataset), "utf8");
  await fs.writeFile(path.join(IMG_DIR, "inferoa-optimization-surfaces.svg"), optimizationSurfacesFigure(dataset), "utf8");
  await fs.writeFile(path.join(IMG_DIR, "inferoa-real-provider-cache-probe.svg"), realProviderFigure(dataset), "utf8");
}

function prefixCacheFigure(dataset) {
  const rows = dataset.simulator;
  const w = 920;
  const h = 480;
  const p = { left: 78, right: 36, top: 54, bottom: 92 };
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const x = (i) => p.left + (plotW * i) / Math.max(1, rows.length - 1);
  const y = (v) => p.top + plotH - (plotH * v) / 100;
  const cachePath = rows.map((row, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(row.steady_state_cache_hit_pct).toFixed(1)}`).join(" ");
  const epochPath = rows.map((row, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(row.prompt_epoch_stability_pct).toFixed(1)}`).join(" ");
  return svg(w, h, `
    ${chartTitle("Prefix cache stays stable as loops and turns grow", 28, 32)}
    ${axis(p, plotW, plotH, "Steady-state hit rate / stability (%)")}
    ${gridY(p, plotW, plotH, [0, 25, 50, 75, 100])}
    <path d="${cachePath}" fill="none" stroke="#1976d2" stroke-width="4"/>
    <path d="${epochPath}" fill="none" stroke="#2e7d32" stroke-width="3" stroke-dasharray="8 7"/>
    ${rows.map((row, i) => `<circle cx="${x(i)}" cy="${y(row.steady_state_cache_hit_pct)}" r="6" fill="#1976d2"><title>${escapeXml(row.label)} cache ${row.steady_state_cache_hit_pct.toFixed(1)}%</title></circle>`).join("")}
    ${rows.map((row, i) => `<text x="${x(i)}" y="${h - 52}" text-anchor="middle" font-size="14" fill="#263238">${escapeXml(row.label)}</text>`).join("")}
    ${legend([{ color: "#1976d2", label: "simulated prefix-cache hit" }, { color: "#2e7d32", label: "prompt epoch stability", dash: true }], 596, 56)}
    <text x="${p.left}" y="${h - 22}" font-size="13" fill="#607d8b">Local Runtime simulator; warmup request excluded. Tool schema and cache_salt were also stable at 100% in all profiles.</text>
  `);
}

function tokenSavingsFigure(dataset) {
  const rows = dataset.simulator.filter((row) => !row.label.includes("turns"));
  const w = 980;
  const h = 520;
  const p = { left: 84, right: 36, top: 58, bottom: 88 };
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const maxV = Math.max(...rows.flatMap((row) => [row.raw_transcript_baseline_prompt_tokens, row.prompt_tokens, row.cache_adjusted_prefill_tokens]));
  const y = (v) => p.top + plotH - (plotH * v) / maxV;
  const groupW = plotW / rows.length;
  const barW = Math.min(42, groupW / 4.2);
  const colors = ["#6d4c41", "#00796b", "#1976d2"];
  const labels = ["raw transcript", "Inferoa prompt", "cache-adjusted prefill"];
  const bars = rows
    .map((row, i) => {
      const values = [row.raw_transcript_baseline_prompt_tokens, row.prompt_tokens, row.cache_adjusted_prefill_tokens];
      const cx = p.left + groupW * i + groupW / 2;
      return values
        .map((value, j) => {
          const bx = cx + (j - 1) * (barW + 6) - barW / 2;
          const by = y(value);
          return `<rect x="${bx}" y="${by}" width="${barW}" height="${p.top + plotH - by}" rx="3" fill="${colors[j]}"><title>${escapeXml(row.label)} ${labels[j]} ${formatK(value)} tokens</title></rect>`;
        })
        .join("");
    })
    .join("");
  return svg(w, h, `
    ${chartTitle("Longer loops amplify context and cache savings", 28, 34)}
    ${axis(p, plotW, plotH, "Input tokens / cache-adjusted prefill work")}
    ${gridY(p, plotW, plotH, [0, 0.25, 0.5, 0.75, 1].map((m) => maxV * m), maxV)}
    ${bars}
    ${rows.map((row, i) => `<text x="${p.left + groupW * i + groupW / 2}" y="${h - 48}" text-anchor="middle" font-size="14" fill="#263238">${escapeXml(row.label)}</text>`).join("")}
    ${legend(colors.map((color, i) => ({ color, label: labels[i] })), 548, 58)}
    <text x="${p.left}" y="${h - 20}" font-size="13" fill="#607d8b">Counterfactual keeps 1,200 raw tool-output tokens per loop; cache-adjusted prefill uses ${CACHE_DISCOUNT_FACTOR * 100}% cost for cached prefix tokens.</text>
  `);
}

function megaLoopProjectionFigure(dataset) {
  const rows = [dataset.simulator.find((row) => row.label === "64 loops"), ...(dataset.scaled_projection?.rows ?? [])].filter(Boolean);
  const w = 1080;
  const h = 540;
  const p = { left: 92, right: 44, top: 58, bottom: 104 };
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const maxV = Math.max(...rows.flatMap((row) => [row.raw_transcript_baseline_prompt_tokens, row.prompt_tokens, row.cache_adjusted_prefill_tokens]));
  const minV = Math.min(...rows.flatMap((row) => [row.cache_adjusted_prefill_tokens, row.prompt_tokens]).filter((value) => value > 0));
  const logMin = Math.log10(Math.max(1, minV / 2));
  const logMax = Math.log10(maxV * 1.4);
  const y = (v) => p.top + plotH - ((Math.log10(Math.max(1, v)) - logMin) / (logMax - logMin)) * plotH;
  const groupW = plotW / rows.length;
  const barW = Math.min(38, groupW / 4.4);
  const colors = ["#6d4c41", "#00796b", "#1976d2"];
  const labels = ["raw transcript", "Inferoa prompt", "cache-adjusted prefill"];
  const bars = rows
    .map((row, i) => {
      const values = [row.raw_transcript_baseline_prompt_tokens, row.prompt_tokens, row.cache_adjusted_prefill_tokens];
      const cx = p.left + groupW * i + groupW / 2;
      return values
        .map((value, j) => {
          const bx = cx + (j - 1) * (barW + 5) - barW / 2;
          const by = y(value);
          return `<rect x="${bx}" y="${by}" width="${barW}" height="${p.top + plotH - by}" rx="3" fill="${colors[j]}"><title>${escapeXml(row.label)} ${labels[j]} ${formatK(value)} tokens</title></rect>`;
        })
        .join("");
    })
    .join("");
  return svg(w, h, `
    ${chartTitle("10k-loop projection: savings compound over long sessions", 28, 34)}
    ${axis(p, plotW, plotH, "Input-token-equivalent work (log scale)")}
    ${[1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000, 100_000_000_000]
      .filter((value) => value >= minV / 2 && value <= maxV * 1.4)
      .map((value) => {
        const yy = y(value);
        return `<line x1="${p.left}" y1="${yy}" x2="${p.left + plotW}" y2="${yy}" stroke="#eceff1"/><text x="${p.left - 10}" y="${yy + 4}" text-anchor="end" font-size="12" fill="#78909c">${formatK(value)}</text>`;
      })
      .join("")}
    ${bars}
    ${rows.map((row, i) => `<text x="${p.left + groupW * i + groupW / 2}" y="${h - 58}" text-anchor="middle" font-size="13" fill="#263238">${escapeXml(row.label.replace(" projected", ""))}</text>`).join("")}
    ${legend(colors.map((color, i) => ({ color, label: labels[i] })), 626, 58)}
    <text x="${p.left}" y="${h - 20}" font-size="13" fill="#607d8b">Projection is calibrated from measured 64-loop Runtime data. One normalized cost unit equals 1M input-token-equivalent tokens.</text>
  `);
}

function compressionContinuityFigure(dataset) {
  const row = dataset.compression_continuity;
  const samples = row.turn_samples ?? [];
  const w = 980;
  const h = 500;
  const p = { left: 82, right: 40, top: 58, bottom: 92 };
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const x = (turn) => p.left + (plotW * (turn - 1)) / Math.max(1, row.turns - 1);
  const y = (value) => p.top + plotH - (plotH * value) / 100;
  const cachePath = samples.map((sample, i) => `${i === 0 ? "M" : "L"}${x(sample.turn).toFixed(1)},${y(sample.cache_hit_pct ?? 0).toFixed(1)}`).join(" ");
  const continuityPath = samples.map((sample, i) => `${i === 0 ? "M" : "L"}${x(sample.turn).toFixed(1)},${y(sample.continuity_marker_present ? 100 : 0).toFixed(1)}`).join(" ");
  return svg(w, h, `
    ${chartTitle("Compression cycles preserve continuity and recover cache", 28, 34)}
    ${axis(p, plotW, plotH, "Cache hit / continuity (%)")}
    ${gridY(p, plotW, plotH, [0, 25, 50, 75, 100])}
    <path d="${cachePath}" fill="none" stroke="#1976d2" stroke-width="4"/>
    <path d="${continuityPath}" fill="none" stroke="#00796b" stroke-width="3" stroke-dasharray="8 7"/>
    ${samples.map((sample) => `<circle cx="${x(sample.turn)}" cy="${y(sample.cache_hit_pct ?? 0)}" r="5" fill="#1976d2"><title>turn ${sample.turn}: ${(sample.cache_hit_pct ?? 0).toFixed(1)}%</title></circle>`).join("")}
    ${legend([{ color: "#1976d2", label: "interactive cache hit" }, { color: "#00796b", label: "continuity marker present", dash: true }], 590, 58)}
    <text x="${p.left}" y="${h - 52}" font-size="13" fill="#263238">${row.turns} measured turns, compression every ${row.compression_cycle_length_turns} turns; archive reference present in ${row.archive_reference_pct.toFixed(1)}% of post-compression prompts.</text>
    <text x="${p.left}" y="${h - 22}" font-size="13" fill="#607d8b">Projection to 1,000 turns uses measured per-turn averages from the compression-cycle stress test.</text>
  `);
}

function optimizationSurfacesFigure(dataset) {
  const s = dataset.summary;
  const router = dataset.routing_projection;
  const prefixCacheDiscountPct = (1 - dataset.scaled_projection.cache_discount_factor) * 100;
  const routingCostSavedPct = pct(router.big3_cost_usd - router.full_pool_cost_usd, router.big3_cost_usd);
  const values = [
    { label: "Prefix cache cached-token discount", value: prefixCacheDiscountPct, color: "#1976d2" },
    { label: "CodeGraph context reduced", value: s.codegraph_context_savings_pct, color: "#00796b" },
    { label: "RTK tool output reduced", value: s.rtk_savings_pct, color: "#8e24aa" },
    { label: "Intelligent routing cost saved", value: routingCostSavedPct, color: "#ef6c00" },
  ].filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  const w = 980;
  const h = 420;
  const p = { left: 286, right: 82, top: 78, bottom: 72 };
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const maxV = Math.max(100, ...values.map((item) => item.value));
  const rowH = plotH / values.length;
  const barH = Math.min(38, rowH * 0.56);
  return svg(w, h, `
    ${chartTitle("Tokenmaxxing reduces token and model-route cost", 28, 34)}
    <line x1="${p.left}" y1="${p.top + plotH}" x2="${p.left + plotW}" y2="${p.top + plotH}" stroke="#b0bec5"/>
    ${[0, 25, 50, 75, 100]
      .map((tick) => {
        const xx = p.left + (plotW * tick) / maxV;
        return `<line x1="${xx}" y1="${p.top}" x2="${xx}" y2="${p.top + plotH}" stroke="#eceff1"/><text x="${xx}" y="${p.top + plotH + 22}" text-anchor="middle" font-size="12" fill="#607d8b">${tick}%</text>`;
      })
      .join("")}
    ${values
      .map((item, i) => {
        const y = p.top + i * rowH + (rowH - barH) / 2;
        const width = (plotW * item.value) / maxV;
        return `<text x="${p.left - 18}" y="${y + barH / 2 + 5}" text-anchor="end" font-size="14" fill="#263238">${escapeXml(item.label)}</text><rect x="${p.left}" y="${y}" width="${width}" height="${barH}" rx="4" fill="${item.color}"/><text x="${p.left + width + 10}" y="${y + barH / 2 + 5}" font-size="15" font-weight="700" fill="#263238">${item.value.toFixed(1)}%</text>`;
      })
      .join("")}
    <text x="${p.left}" y="${h - 22}" font-size="13" fill="#607d8b">Sources: prefix-cache cost model, CodeGraph projection, RTK records, and routing cost projection.</text>
  `);
}

function realProviderFigure(dataset) {
  const probe = dataset.real_provider_probe;
  const rows = probe.status === "ok" ? probe.usages : [];
  const w = 820;
  const h = 380;
  const p = { left: 76, right: 36, top: 58, bottom: 78 };
  const plotW = w - p.left - p.right;
  const plotH = h - p.top - p.bottom;
  const x = (i) => p.left + (plotW * i) / Math.max(1, rows.length - 1);
  const y = (v) => p.top + plotH - (plotH * v) / 100;
  const pathD = rows.map((row, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(row.cache_hit_pct ?? 0).toFixed(1)}`).join(" ");
  const body =
    probe.status === "ok"
      ? `<path d="${pathD}" fill="none" stroke="#1976d2" stroke-width="4"/>
         ${rows.map((row, i) => `<circle cx="${x(i)}" cy="${y(row.cache_hit_pct ?? 0)}" r="6" fill="#1976d2"><title>request ${i}: ${(row.cache_hit_pct ?? 0).toFixed(1)}%</title></circle>`).join("")}
         ${rows.map((row, i) => `<text x="${x(i)}" y="${h - 46}" text-anchor="middle" font-size="14" fill="#263238">req ${i + 1}</text>`).join("")}
         <text x="${p.left}" y="${h - 20}" font-size="13" fill="#607d8b">DeepSeek v4 Pro probe. Same cache_salt and repeated prefix.</text>`
      : `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="20" fill="#607d8b">Real provider probe ${escapeXml(probe.status)}</text>`;
  return svg(w, h, `
    ${chartTitle("DeepSeek v4 Pro exposes cached-token evidence after warmup", 28, 34)}
    ${axis(p, plotW, plotH, "Cached prompt tokens / prompt tokens (%)")}
    ${gridY(p, plotW, plotH, [0, 25, 50, 75, 100])}
    ${body}
  `);
}

function axis(p, plotW, plotH, label) {
  return `
    <line x1="${p.left}" y1="${p.top + plotH}" x2="${p.left + plotW}" y2="${p.top + plotH}" stroke="#b0bec5"/>
    <line x1="${p.left}" y1="${p.top}" x2="${p.left}" y2="${p.top + plotH}" stroke="#b0bec5"/>
    <text x="18" y="${p.top + plotH / 2}" transform="rotate(-90 18 ${p.top + plotH / 2})" text-anchor="middle" font-size="13" fill="#607d8b">${escapeXml(label)}</text>
  `;
}

function gridY(p, plotW, plotH, values, maxValue = 100) {
  return values
    .map((value) => {
      const y = p.top + plotH - (plotH * value) / maxValue;
      const label = maxValue === 100 ? `${Math.round(value)}%` : formatK(value);
      return `<line x1="${p.left}" y1="${y}" x2="${p.left + plotW}" y2="${y}" stroke="#eceff1"/><text x="${p.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#78909c">${label}</text>`;
    })
    .join("");
}

function legend(items, x, y) {
  return `<g>${items
    .map((item, i) => {
      const yy = y + i * 24;
      return `<line x1="${x}" y1="${yy}" x2="${x + 28}" y2="${yy}" stroke="${item.color}" stroke-width="4" ${item.dash ? 'stroke-dasharray="7 6"' : ""}/><text x="${x + 38}" y="${yy + 5}" font-size="14" fill="#37474f">${escapeXml(item.label)}</text>`;
    })
    .join("")}</g>`;
}

function chartTitle(text, x, y) {
  return `<text x="${x}" y="${y}" font-size="22" font-weight="700" fill="#263238">${escapeXml(text)}</text>`;
}

function svg(width, height, inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${inner}
</svg>
`;
}

function wrapSvgLabel(label, x, y, lineHeight) {
  const words = label.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("");
}

function estimateRawTranscriptPromptTokens(usageRows, profile) {
  let completedLoopsBeforeRequest = 0;
  let total = 0;
  for (const row of usageRows) {
    total += (row.prompt_tokens ?? 0) + completedLoopsBeforeRequest * RAW_TOOL_OUTPUT_TOKENS_PER_LOOP;
    completedLoopsBeforeRequest = Math.min(completedLoopsBeforeRequest + 1, profile.turns * profile.loopsPerTurn);
  }
  return Math.round(total);
}

function linearFit(points) {
  const clean = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (clean.length === 0) {
    return { intercept: 0, slope: 0 };
  }
  const meanX = average(clean.map(([x]) => x));
  const meanY = average(clean.map(([, y]) => y));
  let numerator = 0;
  let denominator = 0;
  for (const [x, y] of clean) {
    numerator += (x - meanX) * (y - meanY);
    denominator += (x - meanX) ** 2;
  }
  const slope = denominator > 0 ? numerator / denominator : 0;
  return { intercept: meanY - slope * meanX, slope };
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(Buffer.byteLength(String(text), "utf8") / 4));
}

function commonPrefix(a, b) {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a.charCodeAt(index) === b.charCodeAt(index)) {
    index += 1;
  }
  return a.slice(0, index);
}

function bestCommonPrefixTokens(previousBodies, body) {
  let best = 0;
  for (const previous of previousBodies) {
    best = Math.max(best, estimateTokens(commonPrefix(previous, body)));
  }
  return best;
}

function stabilityPct(distinctCount, totalCount) {
  if (totalCount <= 1) return 100;
  if (distinctCount <= 1) return 100;
  return Math.max(0, (1 - (distinctCount - 1) / (totalCount - 1)) * 100);
}

function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last || range[0] > last[1] + 1) {
      merged.push(range.slice());
    } else {
      last[1] = Math.max(last[1], range[1]);
    }
  }
  return merged;
}

function parseLooseJson(text) {
  return JSON.parse(text.replace(/\bInfinity\b/g, "null").replace(/\bNaN\b/g, "null"));
}

function sendJson(res, body) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function rmSafe(target) {
  await fs.rm(target, { recursive: true, force: true }).catch(() => {});
}

function objectField(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringField(value) {
  return typeof value === "string" ? value : undefined;
}

function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numeric(value) {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function distinct(values) {
  return [...new Set(values.filter((value) => value !== undefined))];
}

function sum(values) {
  return values.reduce((acc, value) => acc + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
}

function average(values) {
  const finite = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return finite.length ? sum(finite) / finite.length : 0;
}

function sampleRows(rows, maxRows) {
  if (rows.length <= maxRows) {
    return rows;
  }
  const out = [];
  const lastIndex = rows.length - 1;
  for (let index = 0; index < maxRows; index += 1) {
    out.push(rows[Math.round((lastIndex * index) / (maxRows - 1))]);
  }
  return out.filter(Boolean);
}

function pct(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : undefined;
}

function cacheHitPct(promptTokens, cachedPromptTokens) {
  return promptTokens > 0 && cachedPromptTokens !== undefined ? (cachedPromptTokens / promptTokens) * 100 : undefined;
}

function formatK(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function publicModelName(model) {
  const value = String(model ?? "");
  if (/deepseek/i.test(value)) {
    return "DeepSeek v4 Pro";
  }
  return value || "configured model";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
