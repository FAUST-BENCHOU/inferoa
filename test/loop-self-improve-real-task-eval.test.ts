import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { createGoalState, replaceGoalPlanning, writeGoalState, type GoalState } from "../src/goals/state.js";
import { readGoalLoopView } from "../src/loop/projection.js";
import { optLiteAdopt, optLitePropose, optLiteReplay } from "../src/opt/opt-lite.js";
import { SessionStore } from "../src/session/store.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { VllmAgentConfig, WorkspaceIdentity } from "../src/types.js";

const execFileAsync = promisify(execFile);

function recursiveReflectionPacket() {
  return {
    objective_decomposition: "Real task eval fixture covers the current workspace change.",
    coverage_review: "Command evaluation covers the fixture acceptance surface.",
    executed_evidence: "npm test passed for the fixture.",
    residual_risk: "No material residual risk for this fixture.",
    why_no_expand: "This fixture is exercising self-improve learning gates.",
  };
}

function structurallyCoveredGoal(state: GoalState, evidence: Record<string, unknown>): GoalState {
  const timestamp = new Date().toISOString();
  state.goal.coverage = {
    surfaces: [{ id: "real-task-eval", title: "Real task eval acceptance surface", status: "covered", evidence: evidence as never, updated_at: timestamp }],
    updated_at: timestamp,
  };
  state.goal.frontier = [{ id: "real-task-frontier", title: "Real task eval frontier audit", value: "low", status: "done", evidence: evidence as never, updated_at: timestamp }];
  return state;
}

test("self-improve real task eval learns from real command verification and gates a later workspace task", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "inferoa-loop-real-task-eval-"));
  const previousStateDir = process.env.INFEROA_STATE_DIR;
  process.env.INFEROA_STATE_DIR = path.join(dir, "user-state");
  const workspaceRoot = path.join(dir, "workspace");
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    await writeSlugWorkspace(workspaceRoot, { fixed: false });
    const workspace: WorkspaceIdentity = { id: "w_loop_real_task_eval", root: workspaceRoot, alias: "loop-real-task-eval" };

    const initialEval = await runNpmTest(workspaceRoot);
    assert.equal(initialEval.status, "fail", `${initialEval.stdout}\n${initialEval.stderr}`);

    await writeFile(path.join(workspaceRoot, "src", "slug.mjs"), fixedSlugModule(), "utf8");
    const fixedEval = await runNpmTest(workspaceRoot);
    assert.equal(fixedEval.status, "pass");
    await recordVerifiedRealTask(store, workspace, {
      objective: "Fix duplicate markdown anchor slug generation in code",
      result: fixedEval,
      feedback: "The real evaluator for this workspace is npm test; do not claim done from reflection alone.",
    });

    await writeFile(path.join(workspaceRoot, "README.md"), "# Slug fixture\n\nDuplicate headings receive numeric suffixes.\n", "utf8");
    const docsEval = await runNpmTest(workspaceRoot);
    assert.equal(docsEval.status, "pass");
    await recordVerifiedRealTask(store, workspace, {
      objective: "Update README docs for slug behavior",
      result: docsEval,
    });

    await writeFile(path.join(workspaceRoot, "CHANGELOG.md"), "## Next\n\n- Documented duplicate heading slug behavior.\n", "utf8");
    const changelogEval = await runNpmTest(workspaceRoot);
    assert.equal(changelogEval.status, "pass");
    await recordVerifiedRealTask(store, workspace, {
      objective: "Prepare changelog docs for slug fix release",
      result: changelogEval,
    });

    const proposal = await optLitePropose(store, workspace);
    const workspaceTarget = proposal.skill_targets?.find((target) => target.target === "workspace_skill");
    assert.match(workspaceTarget?.body ?? "", /npm test/);
    const replay = await optLiteReplay(store, workspace, proposal.id);
    assert.equal(replay.status, "accepted");

    const learnedConfig = config();
    const adopted = await optLiteAdopt(store, workspace, learnedConfig, proposal.id);
    assert.equal(adopted.status, "adopted");
    assert.deepEqual(adopted.skill_targets?.map((target) => target.skill_id).sort(), ["inferoa-loop-skill", "inferoa-workspace-skill"]);

    await writeFile(path.join(workspaceRoot, "README.md"), "# Slug fixture\n\nThe evaluator remains `npm test`.\n", "utf8");
    const laterEvalBeforeRecord = await runNpmTest(workspaceRoot);
    assert.equal(laterEvalBeforeRecord.status, "pass");

    const postSession = store.createSession(workspace, "post-adoption real docs task");
    const registry = new ToolRegistry(learnedConfig, workspace, store);
    const goal = structurallyCoveredGoal(
      replaceGoalPlanning(createGoalState({ objective: "Update README docs for the slug workspace" }), {
        steps: [{ id: "docs", title: "Update README docs", status: "completed" }],
      }),
      commandEvidence(workspaceRoot, laterEvalBeforeRecord),
    );
    writeGoalState(store, postSession.session_id, goal, "run_seed");

    const reflected = await registry.call(
      {
        id: "reflect_soft_done",
        name: "goal",
        arguments: {
          op: "reflect",
          decision: "done",
          summary: "Docs look updated from reflection.",
          verification_evidence: { self_check: true },
          reflection_packet: recursiveReflectionPacket(),
        },
      },
      { session_id: postSession.session_id, run_id: "run_reflect_soft", request_class: "reflection", visibility: "internal" },
    );
    assert.equal(reflected.ok, true, JSON.stringify(reflected));

    const blockedBeforeLoopSkill = await registry.call(
      { id: "complete_blocked_before_loop_skill", name: "goal", arguments: { op: "complete", summary: "Done." } },
      { session_id: postSession.session_id, run_id: "run_complete_before_loop_skill", control_plane: true },
    );
    assert.equal(blockedBeforeLoopSkill.ok, false);
    assert.equal(blockedBeforeLoopSkill.error?.code, "goal_skill_policy_required");
    assert.match(blockedBeforeLoopSkill.error?.message ?? "", /Loop Skill body/);

    const readLoopSkill = await registry.call(
      { id: "read_loop_skill", name: "skill", arguments: { op: "read", id: "inferoa-loop-skill" } },
      { session_id: postSession.session_id, run_id: "run_read_loop_skill" },
    );
    assert.equal(readLoopSkill.ok, true, JSON.stringify(readLoopSkill));

    const commandBeforeWorkspaceSkill = await registry.call(
      {
        id: "record_real_command_before_workspace_skill",
        name: "goal",
        arguments: {
          op: "verify",
          provider: "command",
          verdict: "pass",
          confidence: "hard",
          evidence: commandEvidence(workspaceRoot, laterEvalBeforeRecord),
          summary: "npm test passed before workspace skill body was loaded.",
        },
      },
      { session_id: postSession.session_id, run_id: "run_command_before_workspace_skill" },
    );
    assert.equal(commandBeforeWorkspaceSkill.ok, true, JSON.stringify(commandBeforeWorkspaceSkill));

    const blockedBeforeWorkspaceSkill = await registry.call(
      { id: "complete_blocked_before_workspace_skill", name: "goal", arguments: { op: "complete", summary: "Done." } },
      { session_id: postSession.session_id, run_id: "run_complete_before_workspace_skill", control_plane: true },
    );
    assert.equal(blockedBeforeWorkspaceSkill.ok, false);
    assert.equal(blockedBeforeWorkspaceSkill.error?.code, "goal_skill_policy_required");
    assert.match(blockedBeforeWorkspaceSkill.error?.message ?? "", /Workspace Skill body/);

    const readWorkspaceSkill = await registry.call(
      { id: "read_workspace_skill", name: "skill", arguments: { op: "read", id: "inferoa-workspace-skill" } },
      { session_id: postSession.session_id, run_id: "run_read_workspace_skill" },
    );
    assert.equal(readWorkspaceSkill.ok, true, JSON.stringify(readWorkspaceSkill));

    const laterEvalAfterRead = await runNpmTest(workspaceRoot);
    assert.equal(laterEvalAfterRead.status, "pass");
    const commandAfterWorkspaceSkill = await registry.call(
      {
        id: "record_real_command_after_workspace_skill",
        name: "goal",
        arguments: {
          op: "verify",
          provider: "command",
          verdict: "pass",
          confidence: "hard",
          evidence: commandEvidence(workspaceRoot, laterEvalAfterRead),
          summary: "npm test passed after reading Workspace Skill.",
        },
      },
      { session_id: postSession.session_id, run_id: "run_command_after_workspace_skill" },
    );
    assert.equal(commandAfterWorkspaceSkill.ok, true, JSON.stringify(commandAfterWorkspaceSkill));

    const completed = await registry.call(
      { id: "complete_after_real_eval", name: "goal", arguments: { op: "complete", summary: "Done after real npm test eval." } },
      { session_id: postSession.session_id, run_id: "run_complete_after_real_eval", control_plane: true },
    );
    assert.equal(completed.ok, true, JSON.stringify(completed));

    const view = readGoalLoopView(store, postSession.session_id);
    assert.deepEqual(view.skill_body_loads.map((load) => load.skill_id).sort(), ["inferoa-loop-skill", "inferoa-workspace-skill"]);
    assert.ok(view.skill_rule_applications.some((application) =>
      application.skill_id === "inferoa-workspace-skill"
      && application.rule_id === "workspace-command-verifier-used"
    ));
    assert.ok(view.skill_rule_applications.some((application) =>
      application.skill_id === "inferoa-workspace-skill"
      && application.rule_id === "workspace-completion-gate-satisfied"
    ));
    assert.ok(view.skill_rule_applications.some((application) =>
      application.skill_id === "inferoa-loop-skill"
      && application.rule_id === "loop-completion-gate-satisfied"
    ));

    const evalDir = path.join(workspaceRoot, ".inferoa", "generated", "loop-real-task-eval");
    await mkdir(evalDir, { recursive: true });
    await writeFile(path.join(evalDir, "evidence.json"), `${JSON.stringify({
      initial_eval: initialEval.status,
      fixed_eval: fixedEval.status,
      replay_status: replay.status,
      adopted_skill_ids: adopted.skill_targets?.map((target) => target.skill_id),
      blocked_before_loop_skill: blockedBeforeLoopSkill.error?.code,
      blocked_before_workspace_skill: blockedBeforeWorkspaceSkill.error?.code,
      skill_body_loads: view.skill_body_loads,
      skill_rule_applications: view.skill_rule_applications,
      real_command_status: laterEvalAfterRead.status,
    }, null, 2)}\n`, "utf8");
    const evidence = await readFile(path.join(evalDir, "evidence.json"), "utf8");
    assert.match(evidence, /"initial_eval": "fail"/);
    assert.match(evidence, /"fixed_eval": "pass"/);
    assert.match(evidence, /workspace-completion-gate-satisfied/);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.INFEROA_STATE_DIR;
    } else {
      process.env.INFEROA_STATE_DIR = previousStateDir;
    }
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function recordVerifiedRealTask(
  store: SessionStore,
  workspace: WorkspaceIdentity,
  input: { objective: string; result: CommandEvalResult; feedback?: string },
): Promise<void> {
  const session = store.createSession(workspace, input.objective);
  const registry = new ToolRegistry(config(), workspace, store);
  const evidence = commandEvidence(workspace.root, input.result);
  const goal = structurallyCoveredGoal(replaceGoalPlanning(createGoalState({ objective: input.objective }), {
    steps: [{ id: "done", title: input.objective, status: "completed" }],
  }), evidence);
  const state = writeGoalState(store, session.session_id, goal, `run_seed_${session.session_id}`);
  const reflected = await registry.call(
    {
      id: "reflect_real_eval",
      name: "goal",
      arguments: {
        op: "reflect",
        decision: "done",
        summary: "Real workspace eval passed.",
        verification_evidence: evidence,
        reflection_packet: recursiveReflectionPacket(),
      },
    },
    { session_id: session.session_id, run_id: `run_reflect_${session.session_id}`, request_class: "reflection", visibility: "internal" },
  );
  assert.equal(reflected.ok, true, JSON.stringify(reflected));
  const verified = await registry.call(
    {
      id: "verify_real_eval",
      name: "goal",
      arguments: {
        op: "verify",
        provider: "command",
        verdict: "pass",
        confidence: "hard",
        evidence,
        summary: "npm test passed for real task eval.",
      },
    },
    { session_id: session.session_id, run_id: `run_verify_${session.session_id}` },
  );
  assert.equal(verified.ok, true, JSON.stringify(verified));
  if (input.feedback) {
    store.appendEvent({
      session_id: session.session_id,
      run_id: `run_review_${session.session_id}`,
      type: "goal.review.resolved",
      data: {
        goal_id: state.goal.id,
        decision: "revise",
        action: "done",
        feedback: input.feedback,
      },
    });
  }
  const completed = await registry.call(
    { id: "complete_real_eval", name: "goal", arguments: { op: "complete", summary: "Completed with real npm test eval." } },
    { session_id: session.session_id, run_id: `run_complete_${session.session_id}`, control_plane: true },
  );
  assert.equal(completed.ok, true, JSON.stringify(completed));
}

async function writeSlugWorkspace(workspaceRoot: string, options: { fixed: boolean }): Promise<void> {
  await mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await mkdir(path.join(workspaceRoot, "test"), { recursive: true });
  await writeFile(path.join(workspaceRoot, "package.json"), `${JSON.stringify({
    name: "inferoa-real-task-eval-fixture",
    private: true,
    type: "module",
    scripts: {
      test: "node test/slug.test.mjs",
    },
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(workspaceRoot, "src", "slug.mjs"), options.fixed ? fixedSlugModule() : buggySlugModule(), "utf8");
  await writeFile(path.join(workspaceRoot, "test", "slug.test.mjs"), slugTestModule(), "utf8");
}

function buggySlugModule(): string {
  return [
    "export function headingSlugs(headings) {",
    "  return headings.map((heading) => heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));",
    "}",
    "",
  ].join("\n");
}

function fixedSlugModule(): string {
  return [
    "export function headingSlugs(headings) {",
    "  const seen = new Map();",
    "  return headings.map((heading) => {",
    "    const base = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';",
    "    const count = seen.get(base) ?? 0;",
    "    seen.set(base, count + 1);",
    "    return count === 0 ? base : `${base}-${count}`;",
    "  });",
    "}",
    "",
  ].join("\n");
}

function slugTestModule(): string {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { headingSlugs } from '../src/slug.mjs';",
    "",
    "test('deduplicates repeated markdown heading anchors', () => {",
    "  assert.deepEqual(headingSlugs(['Intro', 'Intro', 'Usage & API', 'Usage API']), ['intro', 'intro-1', 'usage-api', 'usage-api-1']);",
    "});",
    "",
  ].join("\n");
}

interface CommandEvalResult {
  status: "pass" | "fail";
  exit_code: number | null;
  stdout: string;
  stderr: string;
}

async function runNpmTest(cwd: string): Promise<CommandEvalResult> {
  try {
    const result = await execFileAsync("npm", ["test"], { cwd, timeout: 15000, maxBuffer: 1024 * 1024 });
    return { status: "pass", exit_code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as { code?: number | null; stdout?: string; stderr?: string };
    return {
      status: "fail",
      exit_code: typeof failed.code === "number" ? failed.code : null,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

function commandEvidence(cwd: string, result: CommandEvalResult) {
  return {
    command: "npm test",
    cwd,
    status: result.status,
    exit_code: result.exit_code,
    stdout_excerpt: result.stdout.slice(0, 500),
    stderr_excerpt: result.stderr.slice(0, 500),
  };
}

function config(): VllmAgentConfig {
  const next = structuredClone(DEFAULT_CONFIG);
  next.permissions.mode = "full_access";
  return next;
}
