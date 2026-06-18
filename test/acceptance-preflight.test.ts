import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runFinalAcceptance } from "../src/validation/acceptance.js";

const PRODUCT_SOURCE_ALLOWING_EXPLICIT_TOOL_CAP = new Set([
  "src/runtime.ts",
  // Debug harnesses may expose explicit caps for deterministic release probes.
  "src/debug/run-session.ts",
  // Self-improve optimizer is a bounded proposal job, not a user-facing long-horizon loop.
  "src/opt/agentic-propose.ts",
]);

test("final acceptance rejects external-only chat providers", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-acceptance-preflight-"));
  try {
    await mkdir(path.join(dir, ".inferoa"), { recursive: true });
    await writeFile(
      path.join(dir, ".inferoa", "config.yaml"),
      [
        "model_setup:",
        "  mode: direct",
        "  provider: external",
        "  profile: openai_compatible",
        "  base_url: https://example.invalid/v1",
        "  model: external/test",
        "omni:",
        "  enabled: true",
        "  endpoints:",
        "    vision:",
        "      base_url: https://example.invalid/v1",
        "      model: omni/vision",
        "    image_generation:",
        "      base_url: https://example.invalid/v1",
        "      model: omni/image",
        "    video_generation:",
        "      base_url: https://example.invalid/v1",
        "      model: omni/video",
        "permissions:",
        "  mode: full_access",
        "context:",
        "  compression_threshold: 0.75",
        "  context_window: 256000",
        "skills:",
        "  enabled: []",
        "  managed_installs: ask",
        "web_search:",
        "  provider: off",
        "daemon:",
        "  poll_ms: 1000",
        "workspace: {}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runFinalAcceptance({ workspaceRoot: dir, configPath: path.join(dir, ".inferoa", "config.yaml") });
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /direct vLLM or vLLM Semantic Router chat endpoint/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("product entrypoints do not cap real tool loops by default", async () => {
  const sourceFiles = await listSourceFiles("src");
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    if (PRODUCT_SOURCE_ALLOWING_EXPLICIT_TOOL_CAP.has(file)) {
      continue;
    }
    const body = await readFile(file, "utf8");
    if (body.includes("max_tool_rounds")) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, []);
});

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(target);
      }
      return entry.isFile() && target.endsWith(".ts") ? [target] : [];
    }),
  );
  return files.flat();
}
