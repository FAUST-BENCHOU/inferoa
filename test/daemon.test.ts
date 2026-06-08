import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { attachDaemonJob, cancelDaemonJob, daemonStatus, detachDaemonJob, queueDaemonRun } from "../src/daemon/supervisor.js";

test("daemon queue, detach, status, and cancel persist job state", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-daemon-"));
  const workspace = path.join(dir, "workspace");
  const state = path.join(dir, "state");
  try {
    await mkdir(path.join(workspace, ".inferoa"), { recursive: true });
    await writeFile(path.join(workspace, ".inferoa", "config.yaml"), YAML.stringify(DEFAULT_CONFIG), "utf8");
    const job = await queueDaemonRun({ stateDir: state, workspaceRoot: workspace, prompt: "hello daemon" });
    assert.equal(job.status, "queued");
    const detached = await detachDaemonJob(state, job.job_id);
    assert.equal(detached.status, "detached");
    const attached = await attachDaemonJob(state, job.job_id);
    assert.equal(attached.job.status, "running");
    const detachedAgain = await detachDaemonJob(state, job.job_id);
    assert.equal(detachedAgain.status, "detached");
    const cancelled = await cancelDaemonJob(state, job.job_id);
    assert.equal(cancelled.status, "cancel_requested");
    const status = await daemonStatus(state);
    assert.equal(status.jobs.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("daemon cancel preserves terminal job states", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-daemon-terminal-"));
  const workspace = path.join(dir, "workspace");
  const state = path.join(dir, "state");
  try {
    await mkdir(path.join(workspace, ".inferoa"), { recursive: true });
    await writeFile(path.join(workspace, ".inferoa", "config.yaml"), YAML.stringify(DEFAULT_CONFIG), "utf8");
    const job = await queueDaemonRun({ stateDir: state, workspaceRoot: workspace, prompt: "cancel before run" });
    const cancelled = await cancelDaemonJob(state, job.job_id);
    assert.equal(cancelled.status, "cancelled");
    const observed = await cancelDaemonJob(state, job.job_id);
    assert.equal(observed.status, "cancelled");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
