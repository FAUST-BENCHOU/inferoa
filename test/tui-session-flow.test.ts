import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { SessionStore } from "../src/session/store.js";
import { TuiApp } from "../src/tui/app.js";
import { buildGoalWorkPrompt } from "../src/goals/supervisor-prompts.js";
import { stripAnsi } from "../src/tui/ansi.js";

test("clear starts a clean default session without prompting or rendering creation details", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-clear-session-"));
  const originalStdoutWrite = process.stdout.write;
  const store = await SessionStore.open(stateDir);
  try {
    const workspace = { id: "w_clear_session", root: stateDir, alias: "clear-session" };
    const tui = new TuiApp(
      {
        config: structuredClone(DEFAULT_CONFIG),
        configFiles: [],
        workspace,
        store,
        runtime: {},
      } as never,
    );
    const view = tui as unknown as {
      startFreshSessionFromClear: () => Promise<void>;
      ask: () => Promise<string>;
      renderPanel: (title: string, body: string[]) => void;
      writeHomeFrame: () => void;
      optionalSession: () => { session_id: string } | undefined;
    };
    let asked = false;
    const panels: string[] = [];
    let homeFrames = 0;

    view.ask = async () => {
      asked = true;
      return "custom title";
    };
    view.renderPanel = (title) => {
      panels.push(title);
    };
    view.writeHomeFrame = () => {
      homeFrames += 1;
    };

    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await view.startFreshSessionFromClear();
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    const sessions = store.listSessions(workspace.id, { includeArchived: true });
    assert.equal(asked, false);
    assert.deepEqual(panels, []);
    assert.equal(homeFrames, 1);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.title, "New session");
    assert.equal(view.optionalSession()?.session_id, sessions[0]?.session_id);
  } finally {
    process.stdout.write = originalStdoutWrite;
    store.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("access command saves a workspace-specific permission override", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-access-session-"));
  const previousStateDir = process.env.INFEROA_STATE_DIR;
  const store = await SessionStore.open(path.join(stateDir, "store"));
  process.env.INFEROA_STATE_DIR = stateDir;
  try {
    const workspace = { id: "w_access_session", root: stateDir, alias: "access-session" };
    const config = structuredClone(DEFAULT_CONFIG);
    const tui = new TuiApp(
      {
        config,
        configFiles: [],
        workspace,
        store,
        runtime: {},
      } as never,
    );
    const view = tui as unknown as {
      renderAccessView: (args: string) => Promise<void>;
      renderPanel: (title: string, body: string[]) => void;
    };
    const panels: Array<{ title: string; body: string[] }> = [];
    view.renderPanel = (title, body) => {
      panels.push({ title, body });
    };

    await view.renderAccessView("ask");

    assert.equal(config.permissions.workspaces?.[workspace.id]?.mode, "ask");
    assert.equal(panels.at(-1)?.title, "Access");
    assert.ok(panels.at(-1)?.body.some((line) => line.includes("Request approval")));
    const text = await readFile(path.join(stateDir, "config.yaml"), "utf8");
    assert.match(text, /workspaces:/);
    assert.match(text, /w_access_session:/);
    assert.match(text, /mode: ask/);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.INFEROA_STATE_DIR;
    } else {
      process.env.INFEROA_STATE_DIR = previousStateDir;
    }
    store.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("goal continuation queues a hidden foreground prompt instead of a daemon job panel", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-goal-foreground-"));
  const store = await SessionStore.open(stateDir);
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.model_setup.base_url = "http://127.0.0.1:9999/v1";
    config.model_setup.model = "foreground-goal-test";
    const workspace = { id: "w_goal_foreground", root: stateDir, alias: "goal-foreground" };
    const tui = new TuiApp(
      {
        config,
        configFiles: [],
        workspace,
        store,
        runtime: {},
      } as never,
    );
    const view = tui as unknown as {
      enqueueGoalContinuation: (objective: string) => Promise<void>;
      optionalSession: () => { session_id: string } | undefined;
      enqueuePrompt: (prompt: string, options?: { renderPrompt?: boolean }) => void;
      renderPanel: (title: string, body: string[]) => void;
    };
    const session = store.createSession(workspace, "goal foreground");
    const queued: Array<{ prompt: string; renderPrompt?: boolean }> = [];
    const panels: string[] = [];

    view.optionalSession = () => session;
    view.enqueuePrompt = (prompt, options = {}) => {
      queued.push({ prompt, renderPrompt: options.renderPrompt });
    };
    view.renderPanel = (title) => {
      panels.push(title);
    };

    await view.enqueueGoalContinuation("deep research on this repo");

    assert.deepEqual(queued, [{ prompt: buildGoalWorkPrompt("deep research on this repo"), renderPrompt: false }]);
    assert.deepEqual(panels, []);
  } finally {
    store.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("inline panels sanitize embedded newlines before writing background rows", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-inline-panel-"));
  const originalStdoutWrite = process.stdout.write;
  try {
    const tui = new TuiApp(
      {
        config: structuredClone(DEFAULT_CONFIG),
        configFiles: [],
        workspace: { id: "w_inline_panel", root: stateDir, alias: "inline-panel" },
        store: { close() {} },
        runtime: {},
      } as never,
    );
    const view = tui as unknown as {
      renderInlinePanel: (title: string, body: string[]) => void;
    };
    let output = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    }) as typeof process.stdout.write;

    view.renderInlinePanel("Goal Supervisor", ["queued goal\nGoal objective: deep research"]);

    const plainLines = stripAnsi(output).split("\n");
    assert.equal(plainLines.length, 5);
    assert.match(plainLines[2] ?? "", /queued goal Goal objective: deep research/);
  } finally {
    process.stdout.write = originalStdoutWrite;
    await rm(stateDir, { recursive: true, force: true });
  }
});
