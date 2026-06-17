import { promises as fs } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/config.js";
import { resolveWorkspace } from "../session/workspace.js";
import { SessionStore } from "../session/store.js";
import { Runtime } from "../runtime.js";
import { queueDaemonRun, startDaemon, attachDaemonJob, detachDaemonJob, cancelDaemonJob, daemonStatus } from "../daemon/supervisor.js";
import type { JsonObject, SessionEvent } from "../types.js";

export interface AcceptanceResult {
  ok: boolean;
  session_id?: string;
  failures: string[];
  evidence: Record<string, unknown>;
}

export async function runFinalAcceptance(options: {
  workspaceRoot: string;
  stateDir?: string;
  configPath?: string;
  daemon?: boolean;
}): Promise<AcceptanceResult> {
  const { config } = await loadConfig(options.workspaceRoot, options.configPath);
  const failures: string[] = [];
  if (!config.model_setup.base_url || !config.model_setup.model) {
    failures.push("model_setup.base_url and model_setup.model are required for real endpoint acceptance");
  }
  if (config.model_setup.provider === "external") {
    failures.push("final acceptance requires a direct vLLM or vLLM Semantic Router chat endpoint; external providers are compatibility validation, not the primary vLLM acceptance path");
  }
  for (const [name, endpoint] of Object.entries({
    vision: config.omni.endpoints.vision,
    image_generation: config.omni.endpoints.image_generation,
    video_generation: config.omni.endpoints.video_generation,
  })) {
    if (!config.omni.enabled || !endpoint?.base_url || !endpoint.model) {
      failures.push(`omni.${name} endpoint with base_url and model is required`);
    }
  }
  if (failures.length) {
    return { ok: false, failures, evidence: { config_checked: true } };
  }
  config.context.force_compression = true;
  const workspace = await resolveWorkspace(options.workspaceRoot, config, options.workspaceRoot);
  const store = await SessionStore.open(options.stateDir);
  try {
    const runtime = new Runtime(config, workspace, store);
    const fixture = await ensureImageFixture(workspace.root);
    const taskPrompt = [
      "Run the Inferoa final acceptance coding task in this repository.",
      "Use these direct tools explicitly: todo_write, file_search, read_file, apply_patch, run_command with one background process, read_process, stop_process, and git with op=status and op=diff.",
      "Use tool_search then capability_call for at least one code-intelligence capability such as lsp or ast_grep, and for any mode-only or Omni capability that is not directly visible.",
      "Make a small real repository change by writing docs/evidence/final-acceptance/agent-run.md with session evidence.",
      "Force context compression is enabled; continue after compression.",
      `Then use vision_understanding on ${fixture}, image_generation for a small diagram-like acceptance image, and video_generation for a short acceptance clip.`,
      "Finish only after recording evidence for each required tool category.",
    ].join("\n");
    const run = await runtime.run({ prompt: taskPrompt, title: "final-acceptance" });
    const resume = await runtime.run({
      prompt:
        "Resume validation for the same final acceptance task. Read recent session evidence if needed, run git op=status, and finish concisely.",
      session_id: run.session.session_id,
    });
    const events = store.listEvents(run.session.session_id);
    const toolCalls = expandedToolCallNames(events);
    const endpointEvidence = store.listEndpointEvidence(run.session.session_id);
    const promptHashEvents = events.filter((event) => event.type === "model.request.started" && event.data.prompt_hash && event.data.tool_schema_hash);
    const resources = events.filter((event) => event.type === "resource.created");
    const compressionIndex = events.findIndex((event) => event.type === "context.compacted");
    const continuedAfterCompression =
      compressionIndex >= 0 &&
      events.slice(compressionIndex + 1).some((event) => event.type === "model.request.started" || event.type === "tool.call");
    const cachedTokenEvidence = endpointEvidence
      .map((record) => cachedTokenEvidenceValue(record))
      .filter((value): value is number => typeof value === "number" && value > 0);
    const evidence: Record<string, unknown> = {
      session_id: run.session.session_id,
      run_id: run.run_id,
      resume_run_id: resume.run_id,
      tool_calls: toolCalls,
      compressed: compressionIndex >= 0,
      continued_after_compression: continuedAfterCompression,
      endpoint_evidence: endpointEvidence,
      prompt_hash_event_count: promptHashEvents.length,
      resource_count: resources.length,
      resume_event_count: events.filter((event) => event.type === "session.resumed").length,
      direct_cached_token_evidence: cachedTokenEvidence,
    };
    requireTool(failures, toolCalls, "file_search");
    requireAnyTool(failures, toolCalls, "read tool", ["read_file", "read_resource"]);
    requireAnyTool(failures, toolCalls, "edit tool", ["edit_file", "write_file", "apply_patch", "ast_edit"]);
    requireTool(failures, toolCalls, "run_command");
    requireTool(failures, toolCalls, "read_process");
    requireTool(failures, toolCalls, "stop_process");
    requireTool(failures, toolCalls, "git");
    requireTool(failures, toolCalls, "todo_write");
    requireAnyTool(failures, toolCalls, "code-intelligence tool", ["lsp", "ast_grep", "ast_edit"]);
    requireTool(failures, toolCalls, "vision_understanding");
    requireTool(failures, toolCalls, "image_generation");
    requireTool(failures, toolCalls, "video_generation");
    if (compressionIndex < 0) {
      failures.push("context compression did not occur");
    }
    if (!continuedAfterCompression) {
      failures.push("no persisted model/tool work occurred after context compression");
    }
    if (!endpointEvidence.length) {
      failures.push("endpoint evidence was not persisted");
    }
    if (endpointEvidence.some(endpointExposesCacheMetrics) && cachedTokenEvidence.length === 0) {
      failures.push("direct vLLM cached-token evidence was not recorded even though cache metrics were exposed");
    }
    if (!promptHashEvents.length) {
      failures.push("prompt hash and tool schema hash evidence was not persisted");
    }
    if (!resources.length) {
      failures.push("managed resources were not persisted");
    }
    if (events.filter((event) => event.type === "session.resumed").length < 2) {
      failures.push("resume evidence was not persisted for the same session");
    }
    if (!events.some((event) => event.type === "process.started")) {
      failures.push("background process start event was not persisted");
    }
    if (!events.some((event) => event.type === "process.stopped" || event.type === "process.stop_requested")) {
      failures.push("background process stop/cancel event was not persisted");
    }
    if (options.daemon) {
      const daemonEvidence = await validateDaemonAcceptance(options.stateDir, workspace.root, run.session.session_id, options.configPath);
      evidence["daemon"] = daemonEvidence;
      if (!daemonEvidence.ok) {
        failures.push(...daemonEvidence.failures);
      }
    }
    const reportPath = await writeAcceptanceReport(workspace.root, run.session.session_id, failures, evidence, events);
    evidence["report_path"] = reportPath;
    return {
      ok: failures.length === 0,
      session_id: run.session.session_id,
      failures,
      evidence,
    };
  } finally {
    store.close();
  }
}

function expandedToolCallNames(events: SessionEvent[]): string[] {
  const calls: string[] = [];
  for (const event of events) {
    if (event.type !== "tool.call") {
      continue;
    }
    const name = typeof event.data.tool_name === "string" ? event.data.tool_name : undefined;
    if (name) {
      calls.push(name);
    }
    if (name === "capability_call") {
      const args = event.data.arguments as JsonObject | undefined;
      const target = typeof args?.name === "string" ? args.name : undefined;
      if (target) {
        calls.push(target);
      }
    }
  }
  return calls;
}

function cachedTokenEvidenceValue(record: JsonObject): number | undefined {
  const usageCached = numericField((record.usage as JsonObject | undefined)?.cached_prompt_tokens);
  if (usageCached !== undefined && usageCached > 0) {
    return usageCached;
  }
  const metrics = record.cache_metrics as JsonObject | undefined;
  if (!metrics) {
    return undefined;
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (!isCacheMetricKey(key)) {
      continue;
    }
    const metric = numericField(value);
    if (metric !== undefined && metric > 0) {
      return metric;
    }
  }
  return undefined;
}

function endpointExposesCacheMetrics(record: JsonObject): boolean {
  const metrics = record.cache_metrics as JsonObject | undefined;
  return Boolean(metrics && Object.keys(metrics).some(isCacheMetricKey));
}

function isCacheMetricKey(key: string): boolean {
  return /prefix_cache_hits|prompt_tokens_cached|local_cache_hit|cache_hit|cached_prompt/i.test(key);
}

function numericField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function validateDaemonAcceptance(
  stateDir: string | undefined,
  workspaceRoot: string,
  sessionId: string,
  configPath?: string,
): Promise<{ ok: boolean; failures: string[]; evidence: Record<string, unknown> }> {
  const failures: string[] = [];
  const status = await startDaemon({ stateDir });
  if (!status.alive) {
    failures.push("daemon did not start");
  }
  const job = await queueDaemonRun({
    stateDir,
    workspaceRoot,
    sessionId,
    configPath,
    prompt:
      "Daemon validation for the same final acceptance task: run git op=status, start a short background process with run_command, read_process, stop_process, then report daemon evidence.",
  });
  await waitForJobVisible(stateDir, job.job_id, 5_000);
  const detached = await detachDaemonJob(stateDir, job.job_id);
  const attached = await attachDaemonJob(stateDir, job.job_id, { follow: false });
  const cancelledJob = await queueDaemonRun({
    stateDir,
    workspaceRoot,
    sessionId,
    configPath,
    prompt: "Daemon cancellation validation: this job should be cancelled before execution.",
  });
  const cancelled = await cancelDaemonJob(stateDir, cancelledJob.job_id);
  const finalStatus = await daemonStatus(stateDir);
  if (detached.status !== "detached" && detached.status !== "running" && detached.status !== "complete") {
    failures.push(`daemon detach did not produce a detachable job state: ${detached.status}`);
  }
  if (attached.job.status === "failed") {
    failures.push("attached daemon job failed");
  }
  if (cancelled.status !== "cancel_requested" && cancelled.status !== "cancelled") {
    failures.push(`daemon cancel did not persist cancellation state: ${cancelled.status}`);
  }
  return {
    ok: failures.length === 0,
    failures,
    evidence: {
      start_status: status,
      queued_job: job,
      detached,
      attached_job: attached.job,
      cancelled,
      final_status: finalStatus,
    },
  };
}

function requireTool(failures: string[], toolCalls: unknown[], name: string): void {
  if (!toolCalls.includes(name)) {
    failures.push(`missing required tool call: ${name}`);
  }
}

function requireAnyTool(failures: string[], toolCalls: unknown[], category: string, names: string[]): void {
  if (!names.some((name) => toolCalls.includes(name))) {
    failures.push(`missing required ${category}: expected one of ${names.join(", ")}`);
  }
}

async function waitForJobVisible(stateDir: string | undefined, jobId: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await daemonStatus(stateDir);
    if (status.jobs.some((job) => job.job_id === jobId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function writeAcceptanceReport(
  workspaceRoot: string,
  sessionId: string,
  failures: string[],
  evidence: Record<string, unknown>,
  events: SessionEvent[],
): Promise<string> {
  const dir = path.join(workspaceRoot, "docs", "evidence", "final-acceptance");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `report-${sessionId}.json`);
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        ok: failures.length === 0,
        failures,
        evidence,
        event_counts: events.reduce<Record<string, number>>((counts, event) => {
          counts[event.type] = (counts[event.type] ?? 0) + 1;
          return counts;
        }, {}),
      },
      null,
      2,
    ),
    "utf8",
  );
  return path.relative(workspaceRoot, file);
}

async function ensureImageFixture(workspaceRoot: string): Promise<string> {
  const dir = path.join(workspaceRoot, "docs", "evidence", "final-acceptance");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "acceptance-fixture.png");
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0yP7wAAAABJRU5ErkJggg==";
  await fs.writeFile(file, Buffer.from(pngBase64, "base64"));
  return path.relative(workspaceRoot, file);
}
