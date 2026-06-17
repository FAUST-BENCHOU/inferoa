import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { SessionStore } from "../src/session/store.js";
import { configuredAllToolDefinitions, configuredToolDefinitions } from "../src/tools/schemas.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { WorkspaceIdentity } from "../src/types.js";

test("configured direct tool list stays stable while Omni capabilities stay hidden", async () => {
  const config = structuredClone(DEFAULT_CONFIG);
  const directNames = configuredToolDefinitions(config).map((tool) => tool.name);
  const allNames = configuredAllToolDefinitions(config).map((tool) => tool.name);

  assert.doesNotMatch(directNames.join("\n"), /vision_understanding|image_generation|image_edit|video_generation|audio_generation|speech_generation|speech_voices|audio_understanding|video_understanding/);
  assert.doesNotMatch(allNames.join("\n"), /vision_understanding|image_generation|image_edit|video_generation|audio_generation|speech_generation|speech_voices|audio_understanding|video_understanding/);
  assert.ok(directNames.includes("clarify"));
  assert.ok(directNames.includes("read_file"));
  assert.ok(directNames.includes("tool_search"));
  assert.ok(directNames.includes("capability_call"));
  assert.equal(directNames.includes("export_resource"), false);

  config.omni.enabled = true;
  config.omni.endpoints.vision = { base_url: "http://localhost:8000/v1", model: "vision-model" };
  const configuredDirectNames = configuredToolDefinitions(config).map((tool) => tool.name);
  const configuredAllNames = configuredAllToolDefinitions(config).map((tool) => tool.name);
  assert.equal(configuredDirectNames.includes("vision_understanding"), false);
  assert.ok(configuredAllNames.includes("vision_understanding"));
  assert.doesNotMatch(configuredAllNames.join("\n"), /image_generation|image_edit|video_generation|audio_generation|speech_generation|speech_voices|audio_understanding|video_understanding/);
});

test("ToolRegistry list exposes only direct tools and discovers configured hidden capabilities", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-tool-filtering-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    const workspace: WorkspaceIdentity = { id: "w_tool_filtering", root: dir, alias: "tool-filtering" };
    const registry = new ToolRegistry(config, workspace, store);

    assert.equal(registry.list().some((tool) => tool.name === "image_generation"), false);

    config.omni.enabled = true;
    config.omni.endpoints.image_generation = { base_url: "http://localhost:8000/v1", model: "image-model" };
    const configuredRegistry = new ToolRegistry(config, workspace, store);
    assert.equal(configuredRegistry.list().some((tool) => tool.name === "image_generation"), false);

    config.omni.endpoints.speech = { base_url: "http://localhost:8000/v1", model: "speech-model" };
    const speechTools = new ToolRegistry(config, workspace, store).list().map((tool) => tool.name);
    assert.equal(speechTools.includes("speech_generation"), false);
    assert.equal(speechTools.includes("speech_voices"), false);
    assert.equal(speechTools.includes("tool_search"), true);
    assert.equal(speechTools.includes("capability_call"), true);

    const session = store.createSession(workspace, "tool-filtering-search");
    const search = await new ToolRegistry(config, workspace, store).call(
      { id: "search_image", name: "tool_search", arguments: { query: "image generation" } },
      { session_id: session.session_id, run_id: "run_search" },
    );
    assert.equal(search.ok, true);
    assert.match(JSON.stringify(search.data), /image_generation/);

    const noMatchConfig = structuredClone(DEFAULT_CONFIG);
    const noMatch = await new ToolRegistry(noMatchConfig, workspace, store).call(
      { id: "search_absent_specialized", name: "tool_search", arguments: { query: "omni browser screenshot computer use mcp" } },
      { session_id: session.session_id, run_id: "run_search" },
    );
    assert.equal(noMatch.ok, true);
    assert.equal(noMatch.data?.no_match, true);
    assert.deepEqual(noMatch.data?.tools, []);
    assert.match(String(noMatch.data?.hint ?? ""), /No configured hidden capability matched specialized query token/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("configured Omni tool schemas do not expose model arguments", () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.omni.enabled = true;
  config.omni.endpoints.vision = { base_url: "http://localhost:8000/v1", model: "vision-model" };
  config.omni.endpoints.image_generation = { base_url: "http://localhost:8001/v1", model: "image-model" };
  config.omni.endpoints.image_edit = { base_url: "http://localhost:8002/v1", model: "image-edit-model" };
  config.omni.endpoints.video_generation = { base_url: "http://localhost:8003/v1", model: "video-model" };
  config.omni.endpoints.video_understanding = { base_url: "http://localhost:8004/v1", model: "video-understanding-model" };
  config.omni.endpoints.audio_generation = { base_url: "http://localhost:8005/v1", model: "audio-model" };
  config.omni.endpoints.audio_understanding = { base_url: "http://localhost:8006/v1", model: "audio-understanding-model" };
  config.omni.endpoints.speech = { base_url: "http://localhost:8007/v1", model: "speech-model" };

  const omniToolNames = new Set([
    "audio_generation",
    "audio_understanding",
    "image_edit",
    "image_generation",
    "speech_generation",
    "speech_voices",
    "video_generation",
    "video_understanding",
    "vision_understanding",
  ]);
  const omniTools = configuredAllToolDefinitions(config).filter((tool) => omniToolNames.has(tool.name));

  assert.equal(omniTools.length, omniToolNames.size);
  for (const tool of omniTools) {
    assert.equal(((tool.parameters.properties as Record<string, unknown> | undefined) ?? {}).model, undefined, tool.name);
  }
});

test("registered tool schemas use enums and omit legacy aliases", () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.omni.enabled = true;
  config.omni.endpoints.vision = { base_url: "http://localhost:8000/v1", model: "vision-model" };
  config.omni.endpoints.image_generation = { base_url: "http://localhost:8001/v1", model: "image-model" };
  config.omni.endpoints.image_edit = { base_url: "http://localhost:8002/v1", model: "image-edit-model" };
  config.omni.endpoints.video_generation = { base_url: "http://localhost:8003/v1", model: "video-model" };
  config.omni.endpoints.audio_generation = { base_url: "http://localhost:8005/v1", model: "audio-model" };
  config.omni.endpoints.speech = { base_url: "http://localhost:8007/v1", model: "speech-model" };

  const directTools = configuredToolDefinitions(config);
  const tools = configuredAllToolDefinitions(config);
  const directByName = new Map(directTools.map((tool) => [tool.name, tool]));
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const prop = (toolName: string, propName: string): Record<string, unknown> | undefined =>
    ((byName.get(toolName)?.parameters.properties as Record<string, Record<string, unknown>> | undefined) ?? {})[propName];

  for (const tool of tools) {
    assert.equal(tool.parameters.type, "object", tool.name);
    for (const forbidden of ["oneOf", "anyOf", "allOf", "enum", "const", "not"]) {
      assert.equal(tool.parameters[forbidden], undefined, `${tool.name}.${forbidden}`);
    }
  }

  assert.equal(directByName.has("web_fetch"), false);
  assert.equal(directByName.has("web_open"), false);
  assert.equal(directByName.has("skill"), false);
  assert.equal(directByName.has("goal"), false);
  assert.equal(directByName.has("plan"), false);
  assert.equal(directByName.has("lsp"), false);
  assert.equal(directByName.has("tool_search"), true);
  assert.equal(directByName.has("capability_call"), true);
  assert.equal(byName.has("web_fetch"), false);
  assert.equal(byName.has("web_open"), true);
  assert.deepEqual(prop("web_open", "format")?.enum, ["text", "html"]);

  assert.equal(byName.get("git")?.parameters.type, "object");
  assert.equal(byName.get("git")?.parameters.oneOf, undefined);
  assert.deepEqual(prop("git", "op")?.enum, ["status", "diff", "show"]);
  assert.match(String(prop("git", "rev")?.description ?? ""), /op=show/);

  assert.equal(byName.get("skill")?.parameters.type, "object");
  assert.equal(byName.get("skill")?.parameters.oneOf, undefined);
  assert.deepEqual(prop("skill", "op")?.enum, ["list", "read", "enable", "disable"]);
  assert.match(String(prop("skill", "id")?.description ?? ""), /op=read/);
  assert.match(String((prop("skill", "ids")?.items as { description?: string } | undefined)?.description ?? ""), /Required/);

  assert.deepEqual(prop("goal", "op")?.enum, ["get", "update", "reflect", "verify"]);
  assert.doesNotMatch(JSON.stringify(prop("goal", "op")?.enum), /create|review_decision|resume|complete|drop|update_step|update_ledger|add_candidate/);
  assert.deepEqual(prop("goal", "action")?.enum, ["plan", "step", "frontier", "coverage", "evidence", "residual_risk", "contract", "verifier_policy", "owner", "review_owner"]);
  assert.deepEqual(prop("goal", "frontier_status")?.enum, ["open", "done", "rejected"]);
  assert.deepEqual(prop("goal", "decision")?.enum, ["expand", "done", "blocked"]);
  assert.equal(prop("goal", "open_candidates"), undefined);
  assert.equal(prop("goal", "done_candidates"), undefined);
  assert.equal(prop("goal", "rejected_candidates"), undefined);
  assert.equal(prop("goal", "candidate_id"), undefined);
  assert.equal(prop("goal", "preference"), undefined);
  assert.equal(prop("goal", "force"), undefined);
  assert.ok((byName.get("goal")?.description.length ?? 999) < 240);

  assert.deepEqual(prop("plan", "op")?.enum, ["create", "get", "update", "approve", "pause", "resume", "drop"]);
  assert.deepEqual(prop("log_experiment", "status")?.enum, ["keep", "discard", "crash", "checks_failed"]);
  assert.deepEqual(prop("init_experiment", "direction")?.enum, ["lower", "higher"]);
  assert.deepEqual(prop("lsp", "action")?.enum, ["status", "diagnostics", "definition", "references", "hover", "symbols", "code_actions"]);
  assert.equal(prop("lsp", "apply"), undefined);
  assert.equal(byName.get("lsp_rename")?.permission, "write");

  assert.equal(prop("audio_generation", "prompt"), undefined);
  assert.equal(prop("audio_generation", "duration"), undefined);
  assert.equal(prop("audio_generation", "audio_length")?.type, "number");
  assert.equal(prop("video_generation", "sync"), undefined);
  assert.equal(prop("video_generation", "seconds"), undefined);
  assert.equal(prop("video_generation", "duration")?.type, "number");
  assert.deepEqual(prop("video_generation", "mode")?.enum, ["async", "sync"]);
  assert.equal(prop("run_experiment", "timeout_seconds"), undefined);
});

test("ToolRegistry rejects arguments outside fixed tool schemas before execution", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-tool-schema-validation-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.omni.enabled = true;
    config.omni.endpoints.image_generation = { base_url: "http://127.0.0.1:9/v1", model: "image-model" };
    const workspace: WorkspaceIdentity = { id: "w_tool_schema_validation", root: dir, alias: "tool-schema-validation" };
    const session = store.createSession(workspace, "tool-schema-validation");
    const registry = new ToolRegistry(config, workspace, store);

    const result = await registry.call(
      { id: "bad_image_args", name: "image_generation", arguments: { prompt: "test", model: "override-model" } },
      { session_id: session.session_id, run_id: "run_bad_image_args" },
    );

    assert.equal(result.ok, false);
    assert.equal(result.error?.code, "invalid_tool_arguments");
    assert.match(result.error?.message ?? "", /arguments\.model/);

    assert.equal(store.listEvents(session.session_id).some((event) => event.type === "permission.resolved"), false);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("merged tool handlers report op-specific missing arguments", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-merged-tool-missing-args-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: "w_merged_tool_missing_args", root: dir, alias: "merged-tool-missing-args" };
    const session = store.createSession(workspace, "merged-tool-missing-args");
    const registry = new ToolRegistry(structuredClone(DEFAULT_CONFIG), workspace, store);

    const missingGitRev = await registry.call(
      { id: "bad_git_show", name: "git", arguments: { op: "show" } },
      { session_id: session.session_id, run_id: "run_bad_git_show" },
    );
    assert.equal(missingGitRev.ok, false);
    assert.equal(missingGitRev.error?.code, "git_rev_required");
    assert.match(missingGitRev.error?.message ?? "", /op=show requires rev/);

    const missingSkillId = await registry.call(
      { id: "bad_skill_read", name: "skill", arguments: { op: "read" } },
      { session_id: session.session_id, run_id: "run_bad_skill_read" },
    );
    assert.equal(missingSkillId.ok, false);
    assert.equal(missingSkillId.error?.code, "skill_id_required");
    assert.match(missingSkillId.error?.message ?? "", /op=read requires id/);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
