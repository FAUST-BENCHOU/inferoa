import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { createGoalState, writeGoalState } from "../src/goals/state.js";
import { readGoalLoopView } from "../src/loop/projection.js";
import { SkillRegistry } from "../src/skills/registry.js";
import { SessionStore } from "../src/session/store.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { VllmAgentConfig, WorkspaceIdentity } from "../src/types.js";

test("SkillRegistry discovers native and imported skills and tools read details on demand", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-skills-"));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const skillDir = path.join(dir, ".inferoa", "skills", "demo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: Demo Skill\ndescription: Demonstrates progressive skill loading.\n---\n\nUse this only when the task says demo.\n",
      "utf8",
    );
    await writeFile(path.join(dir, "AGENTS.md"), "Workspace instruction import.\n\nPrefer small patches.\n", "utf8");
    const workspace: WorkspaceIdentity = { id: "w_skills", root: dir, alias: "skills" };
    const config: VllmAgentConfig = structuredClone(DEFAULT_CONFIG);
    config.skills.enabled = ["demo-skill"];
    const registry = new SkillRegistry(workspace, config);
    const discovered = await registry.discover();
    assert.ok(discovered.some((skill) => skill.id === "demo-skill"));
    assert.ok(discovered.some((skill) => skill.id === "agents" && skill.trust === "imported"));

    const session = store.createSession(workspace, "skills");
    const goal = createGoalState({ objective: "Use the demo skill" });
    writeGoalState(store, session.session_id, goal, "run_goal");
    const tools = new ToolRegistry(config, workspace, store);
    const listed = await tools.call({ id: "tc1", name: "skill_list", arguments: { query: "demo" } }, { session_id: session.session_id });
    assert.equal(listed.ok, true);
    assert.match(JSON.stringify(listed.data), /demo-skill/);
    const read = await tools.call({ id: "tc2", name: "skill_read", arguments: { id: "demo-skill" } }, { session_id: session.session_id });
    assert.equal(read.ok, true);
    assert.match(JSON.stringify(read.data), /progressive skill loading/);
    const loadedEvents = store.listEvents(session.session_id).filter((event) => event.type === "skill.body.loaded");
    assert.equal(loadedEvents.length, 1);
    assert.equal(loadedEvents[0]?.data.skill_id, "demo-skill");
    assert.match(String(loadedEvents[0]?.data.body_hash), /^[a-f0-9]{64}$/);
    assert.equal(loadedEvents[0]?.data.path, path.join(skillDir, "SKILL.md"));
    assert.equal(loadedEvents[0]?.data.total_lines, 7);
    assert.equal(loadedEvents[0]?.data.goal_id, goal.goal.id);
    const view = readGoalLoopView(store, session.session_id);
    assert.equal(view.skill_body_loads.length, 1);
    assert.equal(view.skill_body_loads[0]?.skill_id, "demo-skill");
    assert.equal(view.skill_body_loads[0]?.body_hash, loadedEvents[0]?.data.body_hash);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
