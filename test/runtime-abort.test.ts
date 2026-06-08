import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { Runtime } from "../src/runtime.js";
import { SessionStore } from "../src/session/store.js";
import { isAbortError } from "../src/util/abort.js";
import type { WorkspaceIdentity } from "../src/types.js";

test("runtime honors an already aborted signal before starting a loop", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-runtime-abort-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.model_setup.base_url = "http://127.0.0.1:1/v1";
    config.model_setup.model = "abort-test";
    const workspace: WorkspaceIdentity = { id: "w_abort", root: dir, alias: "abort" };
    const runtime = new Runtime(config, workspace, store);
    const controller = new AbortController();
    controller.abort("User interrupted current loop");

    await assert.rejects(
      runtime.run({ prompt: "stop before network", signal: controller.signal }),
      (error) => isAbortError(error) && error instanceof Error && error.message === "User interrupted current loop",
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
