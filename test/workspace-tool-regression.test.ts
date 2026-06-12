import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { SessionStore } from "../src/session/store.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { VllmAgentConfig, WorkspaceIdentity } from "../src/types.js";

const execFileAsync = promisify(execFile);

function config(): VllmAgentConfig {
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.rtk.enabled = false;
  return cfg;
}

test("git show with rev and path reads file content at that revision", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-git-show-path-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    await writeFile(path.join(dir, "package.json"), "{\n  \"name\": \"fixture\",\n  \"version\": \"1.2.3\"\n}\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: dir });
    await execFileAsync("git", ["add", "package.json"], { cwd: dir });
    await execFileAsync("git", ["-c", "user.name=Inferoa Test", "-c", "user.email=inferoa@example.test", "commit", "-m", "initial"], { cwd: dir });

    const workspace: WorkspaceIdentity = { id: "w_git_show_path", root: dir, alias: "git-show-path", gitRoot: dir };
    const session = store.createSession(workspace, "git-show-path");
    const registry = new ToolRegistry(config(), workspace, store);
    const result = await registry.call(
      { id: "git_show_path", name: "git", arguments: { op: "show", rev: "HEAD", path: "package.json" } },
      { session_id: session.session_id, run_id: "run_git_show_path" },
    );

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.match(String(result.data?.output ?? ""), /"version": "1\.2\.3"/);
    assert.doesNotMatch(String(result.data?.output ?? ""), /commit [0-9a-f]/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("apply_patch accepts Begin Patch wrapper format", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-begin-patch-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    await mkdir(path.join(dir, "src"));
    await writeFile(path.join(dir, "src", "sample.ts"), "export function add(a: number, b: number) {\n  return a - b;\n}\n", "utf8");
    const workspace: WorkspaceIdentity = { id: "w_begin_patch", root: dir, alias: "begin-patch" };
    const session = store.createSession(workspace, "begin-patch");
    const registry = new ToolRegistry(config(), workspace, store);
    const result = await registry.call(
      {
        id: "begin_patch",
        name: "apply_patch",
        arguments: {
          patch: [
            "*** Begin Patch",
            "*** Update File: src/sample.ts",
            "@@",
            " export function add(a: number, b: number) {",
            "-  return a - b;",
            "+  return a + b;",
            " }",
            "*** End Patch",
            "",
          ].join("\n"),
        },
      },
      { session_id: session.session_id, run_id: "run_begin_patch" },
    );

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.match(await readFile(path.join(dir, "src", "sample.ts"), "utf8"), /return a \+ b/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
