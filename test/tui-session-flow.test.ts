import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { SessionStore } from "../src/session/store.js";
import { TuiApp } from "../src/tui/app.js";

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
