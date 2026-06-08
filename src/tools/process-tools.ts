import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { JsonObject, ToolResult } from "../types.js";
import { resolveInside } from "../util/fs.js";
import { fail, ok, truncateText } from "../util/limit.js";
import { randomId } from "../util/hash.js";
import type { ToolExecutionContext } from "./context.js";

interface LiveProcess {
  child: ChildProcessWithoutNullStreams;
  session_id: string;
  process_id: string;
}

const liveProcesses = new Map<string, LiveProcess>();

function key(sessionId: string, processId: string): string {
  return `${sessionId}:${processId}`;
}

export async function runCommand(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  const command = String(args.command);
  const cwd = resolveInside(context.workspace.root, String(args.cwd ?? "."));
  const env = {
    ...process.env,
    ...(typeof args.env === "object" && args.env ? stringEnv(args.env as Record<string, unknown>) : {}),
  };
  if (args.background) {
    const processId = randomId("p");
    const child = spawn(command, {
      cwd,
      env,
      shell: true,
      detached: false,
    });
    context.store.upsertProcess({
      session_id: context.session_id,
      process_id: processId,
      pid: child.pid,
      command,
      cwd,
      status: "running",
    });
    context.store.appendEvent({
      session_id: context.session_id,
      run_id: context.run_id,
      type: "process.started",
      data: { process_id: processId, pid: child.pid, command, cwd },
    });
    liveProcesses.set(key(context.session_id, processId), { child, session_id: context.session_id, process_id: processId });
    child.stdout.on("data", (chunk) => {
      context.store.appendProcessOutput(context.session_id, processId, "stdout", String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      context.store.appendProcessOutput(context.session_id, processId, "stderr", String(chunk));
    });
    child.on("close", (code) => {
      context.store.upsertProcess({
        session_id: context.session_id,
        process_id: processId,
        pid: child.pid,
        command,
        cwd,
        status: "stopped",
        exit_code: code,
      });
      context.store.appendEvent({
        session_id: context.session_id,
        run_id: context.run_id,
        type: "process.stopped",
        data: { process_id: processId, code },
      });
      liveProcesses.delete(key(context.session_id, processId));
    });
    return ok(`Started background process ${processId}`, { process_id: processId, pid: child.pid ?? null, command, cwd });
  }

  const timeoutMs = typeof args.timeout_ms === "number" ? Math.max(100, Math.min(args.timeout_ms, 600_000)) : 120_000;
  return await new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      env,
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 2000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      const truncated = truncateText(combined);
      const resource =
        truncated.truncated || combined.length > 24_000
          ? context.store.putResource(context.session_id, "command.output", combined, { command, cwd, code, timed_out: timedOut }).uri
          : undefined;
      context.store.appendEvent({
        session_id: context.session_id,
        run_id: context.run_id,
        type: "tool.shell.completed",
        data: { command, cwd, code, timed_out: timedOut, resource_uri: resource },
      });
      resolve({
        ok: code === 0 && !timedOut,
        summary: `Command exited ${code}${timedOut ? " after timeout" : ""}`,
        data: {
          command,
          cwd,
          code,
          timed_out: timedOut,
          output: truncated.text,
        },
        resource_uri: resource,
        error: code === 0 && !timedOut ? undefined : { code: timedOut ? "command_timeout" : "command_failed", message: stderr || stdout },
      });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve(fail("command_spawn_failed", error.message));
    });
  });
}

export async function readProcess(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  const processId = String(args.process_id);
  const sinceSeq = typeof args.since_seq === "number" ? args.since_seq : 0;
  const maxBytes = typeof args.max_bytes === "number" ? Math.max(1, Math.min(args.max_bytes, 100_000)) : 24_000;
  const output = context.store.readProcessOutput(context.session_id, processId, sinceSeq, maxBytes);
  return ok(`Read process ${processId} through seq ${output.seq}`, {
    process_id: processId,
    since_seq: sinceSeq,
    next_seq: output.seq,
    output: output.text,
    live: liveProcesses.has(key(context.session_id, processId)),
  });
}

export async function writeProcess(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  const processId = String(args.process_id);
  const live = liveProcesses.get(key(context.session_id, processId));
  if (!live) {
    return fail("process_not_live", `Process is not live in this runtime: ${processId}`);
  }
  live.child.stdin.write(String(args.input));
  if (args.close_stdin) {
    live.child.stdin.end();
  }
  context.store.appendEvent({
    session_id: context.session_id,
    run_id: context.run_id,
    type: "process.stdin",
    data: { process_id: processId, bytes: Buffer.byteLength(String(args.input)), close_stdin: Boolean(args.close_stdin) },
  });
  return ok(`Wrote stdin to ${processId}`, { process_id: processId });
}

export async function stopProcess(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  const processId = String(args.process_id);
  const live = liveProcesses.get(key(context.session_id, processId));
  if (!live) {
    return fail("process_not_live", `Process is not live in this runtime: ${processId}`);
  }
  const signal = String(args.signal ?? "SIGTERM") as NodeJS.Signals;
  live.child.kill(signal);
  context.store.appendEvent({
    session_id: context.session_id,
    run_id: context.run_id,
    type: "process.stop_requested",
    data: { process_id: processId, signal },
  });
  return ok(`Sent ${signal} to ${processId}`, { process_id: processId, signal });
}

function stringEnv(env: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([name, value]) => [name, String(value)]));
}
