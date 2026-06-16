import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import {
  completeGoalReflection,
  createGoalState,
  readGoalState,
  replaceGoalPlanning,
  writeGoalState,
} from "../src/goals/state.js";
import { runGoalSupervisor, type GoalSupervisorTurnRequest } from "../src/goals/supervisor.js";
import { SessionStore } from "../src/session/store.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { CORE_TOOL_DEFINITIONS } from "../src/tools/schemas.js";
import type { JsonObject, VllmAgentConfig, WorkspaceIdentity } from "../src/types.js";

function config(): VllmAgentConfig {
  const next = structuredClone(DEFAULT_CONFIG);
  next.permissions.mode = "full_access";
  next.skills.enabled = [];
  return next;
}

function recursiveDonePacket(overrides: JsonObject = {}): JsonObject {
  return {
    objective_decomposition: "Mapped one plausible local horizon.",
    coverage_review: "Claimed broad coverage in prose.",
    executed_evidence: "Ran a narrow command and inspected a few files.",
    remaining_frontier: "No high-value frontier remains.",
    why_no_expand: "Further work would have diminishing returns.",
    ...overrides,
  };
}

async function withGoalFixture(
  name: string,
  fn: (fixture: { store: SessionStore; sessionId: string; registry: ToolRegistry; workspace: WorkspaceIdentity }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `${name}-`));
  const store = await SessionStore.open(path.join(dir, "state"));
  try {
    const workspace: WorkspaceIdentity = { id: `w_${name.replaceAll("-", "_")}`, root: dir, alias: name };
    const session = store.createSession(workspace, name);
    await fn({ store, sessionId: session.session_id, registry: new ToolRegistry(config(), workspace, store), workspace });
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function structurallyDoneGoal(): ReturnType<typeof createGoalState> {
  let state = replaceGoalPlanning(createGoalState({ objective: "挖掘潜在问题并修复" }), {
    summary: "Loop task 0 · Local investigation",
    steps: [
      { id: "map_work_surfaces", title: "Map work surfaces", status: "completed" },
      { id: "seed_frontier_candidates", title: "Seed frontier candidates", status: "completed" },
      { id: "fix_identified_problem", title: "Fix identified problem", status: "completed" },
      { id: "verify_fixes", title: "Verify fixes", status: "completed" },
    ],
  });
  state = completeGoalReflection(
    state,
    {
      decision: "done",
      summary: "Found one bug, fixed it, and no material frontier remains.",
      reflection_packet: recursiveDonePacket(),
      verification_evidence: { narrow_test: "passed" },
    },
    "run_reflect_done",
  );
  return state;
}

async function reflectDoneTurn(registry: ToolRegistry, sessionId: string, request: GoalSupervisorTurnRequest, packetOverrides: JsonObject = {}) {
  assert.equal(request.requestClass, "reflection");
  const runId = request.runId ?? "run_reflection";
  const reflected = await registry.call(
    {
      id: `${runId}_done_reflection`,
      name: "goal",
      arguments: {
        op: "reflect",
        decision: "done",
        summary: "Current horizon appears done.",
        verification_evidence: { checked: true },
        reflection_packet: recursiveDonePacket(packetOverrides),
      },
    },
    { session_id: sessionId, run_id: runId, request_class: "reflection", visibility: "internal" },
  );
  assert.equal(reflected.ok, true, JSON.stringify(reflected));
  return { run_id: runId };
}

test("free-text recursive reflection cannot complete a deliver loop with empty coverage and frontier state", async () => {
  await withGoalFixture("loop-structural-empty-coverage", async ({ store, sessionId, registry }) => {
    writeGoalState(store, sessionId, structurallyDoneGoal(), "run_seed");

    const completed = await registry.call(
      { id: "complete_empty_structural_state", name: "goal", arguments: { op: "complete", summary: "Done." } },
      { session_id: sessionId, run_id: "run_complete", control_plane: true },
    );

    assert.equal(completed.ok, false);
    assert.equal(completed.error?.code, "goal_structural_evidence_required");
    assert.match(completed.error?.message ?? "", /coverage/i);
    assert.match(completed.error?.message ?? "", /frontier/i);
    assert.equal(readGoalState(store, sessionId)?.goal.status, "active");
  });
});

test("completing seed_frontier_candidates without recorded frontier blocks completion", async () => {
  await withGoalFixture("loop-structural-empty-frontier", async ({ store, sessionId, registry }) => {
    const state = structurallyDoneGoal();
    state.goal.coverage = {
      surfaces: [
        {
          id: "local-tests",
          title: "Local tests and focused code path",
          status: "covered",
          evidence: { command: "npm test fixture" },
          updated_at: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };
    writeGoalState(store, sessionId, state, "run_seed");

    const completed = await registry.call(
      { id: "complete_empty_frontier", name: "goal", arguments: { op: "complete", summary: "Done." } },
      { session_id: sessionId, run_id: "run_complete", control_plane: true },
    );

    assert.equal(completed.ok, false);
    assert.equal(completed.error?.code, "goal_structural_evidence_required");
    assert.match(completed.error?.message ?? "", /frontier/i);
    assert.equal(readGoalState(store, sessionId)?.goal.status, "active");
  });
});

test("goal supervisor turns empty frontier structural gate into a frontier repair horizon", async () => {
  await withGoalFixture("loop-structural-frontier-repair", async ({ store, sessionId, registry }) => {
    const state = structurallyDoneGoal();
    state.goal.coverage = {
      surfaces: [
        {
          id: "local-tests",
          title: "Local tests and focused code path",
          status: "covered",
          evidence: { command: "npm test fixture" },
          updated_at: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };
    writeGoalState(store, sessionId, state, "run_seed");
    let reflectionCalls = 0;

    const result = await runGoalSupervisor({
      store,
      sessionId,
      supervisor: "test",
      maxIterations: 3,
      shouldContinue: () => reflectionCalls < 1,
      runTurn: async (request) => {
        reflectionCalls += 1;
        return reflectDoneTurn(registry, sessionId, request);
      },
    });

    assert.equal(result.status, "stopped");
    const current = readGoalState(store, sessionId)?.goal;
    assert.equal(current?.status, "active");
    assert.equal(current?.horizon_generation, 1);
    assert.equal(current?.planning?.summary, "Loop task 1 · Frontier repair");
    assert.equal(current?.planning?.active_step_id, "structural_frontier_seed_1");
    assert.match(current?.planning?.steps[0]?.notes ?? "", /goal op=update action=frontier/);
    const expansion = store.listEvents(sessionId).find((event) => event.type === "goal.horizon.expanded" && event.data.reason === "structural_completion");
    assert.ok(expansion);
    assert.deepEqual(
      (expansion.data.structural_issues as Array<{ kind: string }>).map((issue) => issue.kind),
      ["frontier_empty", "frontier_bootstrap_missing"],
    );
  });
});

test("goal supervisor pauses a repeated structural blocker instead of duplicating repair horizons", async () => {
  await withGoalFixture("loop-structural-repair-fuse", async ({ store, sessionId, registry }) => {
    const state = structurallyDoneGoal();
    state.goal.coverage = {
      surfaces: [
        {
          id: "local-tests",
          title: "Local tests and focused code path",
          status: "covered",
          evidence: { command: "npm test fixture" },
          updated_at: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    };
    writeGoalState(store, sessionId, state, "run_seed");
    let reflectionCalls = 0;

    await runGoalSupervisor({
      store,
      sessionId,
      supervisor: "test",
      maxIterations: 3,
      shouldContinue: () => reflectionCalls < 1,
      runTurn: async (request) => {
        reflectionCalls += 1;
        return reflectDoneTurn(registry, sessionId, request);
      },
    });

    const repairState = readGoalState(store, sessionId);
    assert.equal(repairState?.goal.planning?.summary, "Loop task 1 · Frontier repair");
    assert.match(repairState?.goal.planning?.steps[0]?.notes ?? "", /structural_block_signature=/);
    const completedRepair = replaceGoalPlanning(repairState!, {
      summary: repairState!.goal.planning?.summary,
      active_step_id: repairState!.goal.planning?.active_step_id,
      steps: repairState!.goal.planning!.steps.map((step) => ({
        id: step.id,
        title: step.title,
        status: "completed",
        notes: step.notes,
        evidence: step.evidence,
      })),
    });
    writeGoalState(store, sessionId, completedRepair, "run_complete_repair_without_frontier");

    reflectionCalls = 0;
    const result = await runGoalSupervisor({
      store,
      sessionId,
      supervisor: "test",
      maxIterations: 3,
      shouldContinue: () => reflectionCalls < 1,
      runTurn: async (request) => {
        reflectionCalls += 1;
        return reflectDoneTurn(registry, sessionId, request, { residual_risk: "No new frontier was recorded." });
      },
    });

    assert.equal(result.status, "paused");
    assert.match(result.reason ?? "", /same blocker signature/);
    const current = readGoalState(store, sessionId)?.goal;
    assert.equal(current?.status, "paused");
    assert.equal(current?.horizon_generation, 1);
    assert.equal(current?.planning?.summary, "Loop task 1 · Frontier repair");
    assert.equal(store.listEvents(sessionId).filter((event) => event.type === "goal.horizon.expanded" && event.data.reason === "structural_completion").length, 1);
  });
});

test("goal tool schema exposes stable loop operations instead of legacy ledger and step ops", () => {
  const goalTool = CORE_TOOL_DEFINITIONS.find((tool) => tool.name === "goal");
  assert.ok(goalTool);
  const parameters = goalTool.parameters as { properties?: Record<string, { enum?: string[] }> };
  const op = parameters.properties?.op;

  assert.deepEqual(op?.enum, ["get", "update", "reflect", "verify"]);
});
