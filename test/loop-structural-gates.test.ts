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
  updateGoalCoverageSurface,
  upsertGoalEvidenceRecord,
  upsertGoalFrontierItem,
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

function latestBugHuntDoneState(): ReturnType<typeof createGoalState> {
  const now = new Date();
  let state = replaceGoalPlanning(createGoalState({ objective: "挖掘潜在问题并修复" }, now), {
    summary: "Loop task 0 · Frontier execution",
    steps: [
      { id: "dashboard_cors_overpermissive", title: "Fix dashboard CORS/PNA", status: "completed" },
      { id: "python_cli_secret_handling", title: "Fix K8s secret argv exposure", status: "completed" },
      { id: "router_vectorstore_file_boundary", title: "Fix vectorstore file path boundary", status: "completed" },
      { id: "verify_frontier_outcomes", title: "Verify frontier outcomes", status: "completed" },
    ],
  });
  state = upsertGoalEvidenceRecord(state, {
    id: "dashboard_backend_go_test_all",
    kind: "test",
    title: "Dashboard backend CORS tests",
    command: "go test -count=1 ./middleware ./proxy ./router",
    confidence: "hard",
  });
  state = upsertGoalEvidenceRecord(state, {
    id: "vllm_sr_deployment_backend_tests",
    kind: "test",
    title: "vllm-sr deployment backend tests",
    command: "python -m pytest tests/test_deployment_backend.py -q",
    confidence: "hard",
  });
  state = upsertGoalEvidenceRecord(state, {
    id: "semantic_router_vectorstore_tests",
    kind: "test",
    title: "Semantic router vectorstore tests",
    command: "go test -count=1 ./pkg/vectorstore",
    confidence: "hard",
  });
  state = upsertGoalFrontierItem(state, {
    id: "dashboard_cors_overpermissive",
    title: "Dashboard backend echoes arbitrary Origin with credentials and PNA enabled",
    value: "high",
    status: "done",
    evidence_ids: ["dashboard_backend_go_test_all"],
  });
  state = upsertGoalFrontierItem(state, {
    id: "python_cli_secret_handling",
    title: "Python CLI secret handling exposes token values in argv",
    value: "medium",
    status: "done",
    evidence_ids: ["vllm_sr_deployment_backend_tests"],
  });
  state = upsertGoalFrontierItem(state, {
    id: "router_vectorstore_file_boundary",
    title: "Router vectorstore FileStore path boundary",
    value: "medium",
    status: "done",
    evidence_ids: ["semantic_router_vectorstore_tests"],
  });
  state = updateGoalCoverageSurface(state, {
    id: "dashboard_backend",
    title: "Dashboard backend proxy/CORS surface",
    status: "covered",
    evidence_ids: ["dashboard_backend_go_test_all"],
    confidence: "hard",
  });
  state = updateGoalCoverageSurface(state, {
    id: "python_cli",
    title: "Python CLI deployment secret handling",
    status: "covered",
    evidence_ids: ["vllm_sr_deployment_backend_tests"],
    confidence: "hard",
  });
  state = updateGoalCoverageSurface(state, {
    id: "router_vectorstore",
    title: "Router vectorstore file storage",
    status: "covered",
    evidence_ids: ["semantic_router_vectorstore_tests"],
    confidence: "hard",
  });
  state = updateGoalCoverageSurface(state, {
    id: "operator_runtime_defaults",
    title: "Operator, deployment, and runtime defaults",
    status: "pending",
    notes: "Still uninspected after the first frontier pass.",
  });
  return completeGoalReflection(
    state,
    {
      decision: "done",
      summary: "Three seeded frontier items are fixed and verified.",
      verification_evidence: { checked: true },
      reflection_packet: recursiveDonePacket({
        coverage_review: "Three touched surfaces are verified; operator/runtime defaults remain pending.",
        residual_risk: [
          {
            title: "Whole repository exhaustive verification not run",
            severity: "medium",
            reason: "Only selected frontier items were verified.",
          },
        ],
        why_no_expand: "Seeded frontier is closed.",
      }),
    },
    "run_reflect_done",
  );
}

test("deliver goals start with pending coverage inventory from the delivery contract", () => {
  const state = createGoalState({ objective: "挖掘潜在问题并修复" });

  const contractSurfaces = state.goal.delivery_contract?.risk_surfaces ?? [];
  assert.ok(contractSurfaces.length > 0);
  assert.deepEqual(
    state.goal.coverage?.surfaces.map((surface) => ({ title: surface.title, status: surface.status })),
    contractSurfaces.map((title) => ({ title, status: "pending" })),
  );
});

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

test("closed seeded frontier does not complete while coverage inventory still has pending surfaces", async () => {
  await withGoalFixture("loop-structural-coverage-debt", async ({ store, sessionId, registry }) => {
    writeGoalState(store, sessionId, latestBugHuntDoneState(), "run_seed");
    let reflectionCalls = 0;

    const result = await runGoalSupervisor({
      store,
      sessionId,
      supervisor: "test",
      maxIterations: 3,
      shouldContinue: () => reflectionCalls < 1,
      runTurn: async (request) => {
        reflectionCalls += 1;
        return reflectDoneTurn(registry, sessionId, request, {
          residual_risk: "Whole repository exhaustive verification not run.",
        });
      },
    });

    assert.equal(result.status, "stopped");
    const current = readGoalState(store, sessionId)?.goal;
    assert.equal(current?.status, "active");
    assert.equal(current?.horizon_generation, 1);
    assert.equal(current?.planning?.summary, "Loop task 1 · Coverage continuation");
    assert.equal(current?.planning?.active_step_id, "structural_coverage_resolve_1");
    assert.match(current?.planning?.steps[0]?.notes ?? "", /operator_runtime_defaults/);
    const expansion = store.listEvents(sessionId).find((event) => event.type === "goal.horizon.expanded" && event.data.reason === "structural_completion");
    assert.ok(expansion);
    assert.match(JSON.stringify(expansion.data.structural_issues), /coverage_unfinished/);
  });
});

test("reflection packet residual risks must be persisted before completion", async () => {
  await withGoalFixture("loop-structural-packet-risk", async ({ store, sessionId, registry }) => {
    let state = latestBugHuntDoneState();
    for (const surface of state.goal.coverage?.surfaces ?? []) {
      state = updateGoalCoverageSurface(state, {
        id: surface.id,
        title: surface.title,
        status: "covered",
        evidence_ids: surface.evidence_ids?.length ? surface.evidence_ids : ["dashboard_backend_go_test_all"],
        confidence: "hard",
      });
    }
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
        return reflectDoneTurn(registry, sessionId, request, {
          residual_risk: "Whole repository exhaustive verification not run.",
        });
      },
    });

    assert.equal(result.status, "stopped");
    const current = readGoalState(store, sessionId)?.goal;
    assert.equal(current?.status, "active");
    assert.equal(current?.horizon_generation, 1);
    assert.equal(current?.planning?.summary, "Loop task 1 · Evidence repair");
    assert.match(current?.planning?.steps[0]?.notes ?? "", /residual risk/i);
  });
});

test("goal tool schema exposes stable loop operations instead of legacy ledger and step ops", () => {
  const goalTool = CORE_TOOL_DEFINITIONS.find((tool) => tool.name === "goal");
  assert.ok(goalTool);
  const parameters = goalTool.parameters as { properties?: Record<string, { enum?: string[] }> };
  const op = parameters.properties?.op;

  assert.deepEqual(op?.enum, ["get", "update", "reflect", "verify"]);
});
