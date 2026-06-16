import type { JsonObject, JsonValue, ModelUsage, SessionEvent } from "../types.js";
import { SessionStore } from "../session/store.js";
import { randomId } from "../util/hash.js";
import { truncateText } from "../util/limit.js";

export type GoalStatus = "active" | "paused" | "budget-limited" | "complete" | "dropped";
export type GoalStepStatus = "pending" | "in_progress" | "completed" | "blocked" | "skipped";
export type GoalReflectionDecision = "expand" | "done" | "blocked";
export type GoalReflectionStatus = "running" | "completed";
export type LoopPreference = "deliver" | "discover" | "replay";
export type LoopRuntimePolicy =
  | { mode: "auto" }
  | { mode: "at_least"; min_duration_ms: number };
export type GoalHilPolicy = "auto" | "review";
export type GoalReviewDecision = "approve" | "reject" | "revise" | "block";
export type GoalCandidateValue = "high" | "medium" | "low";
export type GoalCandidateStatus = "open" | "done" | "rejected";
export type GoalCoverageSurfaceStatus = "pending" | "in_progress" | "covered" | "rejected";
export type GoalStructuralConfidence = "hard" | "soft" | "weak";
export type GoalEvidenceKind = "command" | "test" | "file" | "resource" | "metric" | "review" | "manual" | "other";
export type GoalRequirementStatus = "pending" | "satisfied" | "accepted_risk" | "rejected";
export type GoalFrontierStatus = "open" | "done" | "rejected";

export interface GoalReflectionPacket extends JsonObject {
  objective_decomposition?: JsonValue;
  coverage_review?: JsonValue;
  executed_evidence?: JsonValue;
  remaining_frontier?: JsonValue;
  residual_risk?: JsonValue;
  why_no_expand?: JsonValue;
}

export type GoalStructuralBlockKind =
  | "coverage_empty"
  | "coverage_unfinished"
  | "coverage_missing_evidence"
  | "coverage_rejected_weak"
  | "frontier_empty"
  | "frontier_bootstrap_missing"
  | "frontier_open_high_medium"
  | "frontier_closed_unproven"
  | "residual_risk_unaccepted";

export interface GoalStructuralBlockIssue {
  kind: GoalStructuralBlockKind;
  message: string;
  count?: number;
  ids?: string[];
}

export interface GoalStructuralBlock {
  message: string;
  issues: GoalStructuralBlockIssue[];
}

const PLAN_PROMPT_BODY_LIMIT = 6000;

export interface GoalRecord {
  id: string;
  objective: string;
  owner?: string;
  review_owner?: string;
  preference: LoopPreference;
  runtime_policy: LoopRuntimePolicy;
  replay?: LoopReplayState;
  hil_policy: GoalHilPolicy;
  status: GoalStatus;
  token_budget?: number;
  tokens_used: number;
  time_used_ms: number;
  time_used_seconds: number;
  tool_rounds_used: number;
  tool_calls_used: number;
  horizon_generation: number;
  verifier_policy?: GoalVerifierPolicy;
  ledger?: GoalLedger;
  delivery_contract?: GoalDeliveryContract;
  coverage?: GoalCoverageState;
  requirements?: GoalRequirement[];
  frontier?: GoalFrontierItem[];
  evidence_records?: GoalEvidenceRecord[];
  residual_risks?: GoalResidualRisk[];
  reflection_status?: GoalReflectionStatus;
  last_reflection_run_id?: string;
  last_reflection_decision?: GoalReflectionDecision;
  last_reflection_summary?: string;
  last_reflection_packet?: GoalReflectionPacket;
  verification_evidence?: JsonObject;
  blocker?: string;
  pending_review_decision?: GoalPendingReviewDecision;
  planning?: GoalPlanningState;
  plan?: GoalPlanSnapshot;
  summary?: string;
  created_at: string;
  updated_at: string;
}

export interface GoalVerifierPolicy {
  command_verifiers: GoalCommandVerifier[];
  updated_at: string;
}

export interface GoalCommandVerifier {
  id: string;
  command: string;
  cwd?: string;
  required: boolean;
}

export interface GoalPendingReviewDecision {
  id: string;
  action: GoalReflectionDecision;
  source_run_id?: string;
  source_horizon_generation: number;
  summary?: string;
  verification_evidence?: JsonObject;
  reflection_packet?: GoalReflectionPacket;
  blocker?: string;
  steps?: GoalPlanningStepInput[];
  active_step_id?: string;
  requested_decision?: GoalReviewDecision[];
  created_at: string;
  feedback?: string;
}

export interface LoopReplayState {
  target_attempts: number;
  remaining_attempts: number;
}

export interface GoalLedger {
  open: GoalCandidate[];
  done: GoalCandidate[];
  rejected: GoalCandidate[];
  updated_at: string;
}

export interface GoalDeliveryContract {
  success_criteria: string[];
  constraints: string[];
  assumptions: string[];
  non_goals: string[];
  required_evidence: string[];
  risk_surfaces: string[];
  updated_at: string;
}

export interface GoalCoverageState {
  surfaces: GoalCoverageSurface[];
  updated_at: string;
}

export interface GoalCoverageSurface {
  id: string;
  title: string;
  status: GoalCoverageSurfaceStatus;
  notes?: string;
  evidence?: JsonObject;
  evidence_ids?: string[];
  confidence?: GoalStructuralConfidence;
  residual_risk_id?: string;
  updated_at: string;
}

export interface GoalRequirement {
  id: string;
  title: string;
  status: GoalRequirementStatus;
  notes?: string;
  evidence_ids?: string[];
  residual_risk_id?: string;
  updated_at: string;
}

export interface GoalFrontierItem {
  id: string;
  title: string;
  source?: string;
  value: GoalCandidateValue;
  status: GoalFrontierStatus;
  reason?: string;
  evidence?: JsonObject;
  evidence_ids?: string[];
  residual_risk_id?: string;
  updated_at: string;
}

export interface GoalEvidenceRecord {
  id: string;
  kind: GoalEvidenceKind;
  title?: string;
  summary?: string;
  command?: string;
  path?: string;
  uri?: string;
  metrics?: JsonObject;
  evidence?: JsonObject;
  confidence: GoalStructuralConfidence;
  updated_at: string;
}

export interface GoalResidualRisk {
  id: string;
  title: string;
  severity: GoalCandidateValue;
  accepted: boolean;
  reason?: string;
  evidence_ids?: string[];
  updated_at: string;
}

export interface GoalCandidate {
  id: string;
  title: string;
  source?: string;
  value: GoalCandidateValue;
  status: GoalCandidateStatus;
  reason?: string;
  evidence?: JsonObject;
  updated_at: string;
}

export interface GoalPlanningState {
  summary?: string;
  active_step_id?: string;
  steps: GoalPlanningStep[];
  updated_at: string;
}

export interface GoalPlanningStep {
  id: string;
  title: string;
  status: GoalStepStatus;
  notes?: string;
  evidence?: JsonObject;
  updated_at: string;
}

export interface GoalHorizonSnapshot {
  generation: number;
  title?: string;
  summary?: string;
  active_step_id?: string;
  steps: GoalPlanningStep[];
  updated_at: string;
  current: boolean;
}

export interface GoalReflectionSnapshot {
  generation: number;
  next_generation?: number;
  run_id?: string;
  decision: GoalReflectionDecision;
  summary?: string;
  blocker?: string;
  reflection_packet?: GoalReflectionPacket;
  verification_evidence?: JsonObject;
  created_at: string;
}

export interface GoalPlanningInput {
  summary?: string;
  active_step_id?: string;
  steps: GoalPlanningStepInput[];
}

export interface GoalPlanningStepInput {
  id?: string;
  title: string;
  status?: GoalStepStatus;
  notes?: string;
  evidence?: JsonObject;
}

export interface GoalStepUpdateInput {
  step_id: string;
  title?: string;
  status?: GoalStepStatus;
  notes?: string;
  evidence?: JsonObject;
  active_step_id?: string;
}

export interface GoalReflectionInput {
  decision: GoalReflectionDecision;
  summary?: string;
  verification_evidence?: JsonObject;
  reflection_packet?: GoalReflectionPacket;
  blocker?: string;
  steps?: GoalPlanningStepInput[];
  active_step_id?: string;
}

export interface GoalDeliveryContractInput {
  success_criteria?: string[];
  constraints?: string[];
  assumptions?: string[];
  non_goals?: string[];
  required_evidence?: string[];
  risk_surfaces?: string[];
}

export interface GoalCoverageSurfaceInput {
  id?: string;
  title: string;
  status?: GoalCoverageSurfaceStatus;
  notes?: string;
  evidence?: JsonObject;
  evidence_ids?: string[];
  confidence?: GoalStructuralConfidence;
  residual_risk_id?: string;
}

export interface GoalFrontierInput {
  id?: string;
  title: string;
  source?: string;
  value?: GoalCandidateValue;
  status?: GoalFrontierStatus;
  reason?: string;
  evidence?: JsonObject;
  evidence_ids?: string[];
  residual_risk_id?: string;
}

export interface GoalEvidenceRecordInput {
  id?: string;
  kind?: GoalEvidenceKind;
  title?: string;
  summary?: string;
  command?: string;
  path?: string;
  uri?: string;
  metrics?: JsonObject;
  evidence?: JsonObject;
  confidence?: GoalStructuralConfidence;
}

export interface GoalResidualRiskInput {
  id?: string;
  title: string;
  severity?: GoalCandidateValue;
  accepted?: boolean;
  reason?: string;
  evidence_ids?: string[];
}

export interface GoalCandidateCloseInput {
  candidate_id?: string;
  title?: string;
  status: Exclude<GoalCandidateStatus, "open">;
  reason?: string;
  evidence?: JsonObject;
}

export interface GoalPlanSnapshot {
  id: string;
  objective: string;
  summary?: string;
  body?: string;
  approved_at: string;
}

export interface GoalState {
  enabled: boolean;
  goal: GoalRecord;
}

export interface GoalCompletionReport {
  objective: string;
  report: string;
}

export interface GoalCreateInput {
  objective: string;
  owner?: string;
  review_owner?: string;
  preference?: LoopPreference;
  runtime_policy?: LoopRuntimePolicy;
  replay?: LoopReplayInput;
  hil_policy?: GoalHilPolicy;
  token_budget?: number;
}

export interface LoopReplayInput {
  target_attempts?: number;
  remaining_attempts?: number;
}

export interface GoalVerifierPolicyInput {
  command_verifiers: GoalCommandVerifierInput[];
}

export interface GoalCommandVerifierInput {
  id?: string;
  command: string;
  cwd?: string;
  required?: boolean;
}

export interface GoalLedgerInput {
  open?: GoalCandidateInput[];
  done?: GoalCandidateInput[];
  rejected?: GoalCandidateInput[];
}

export interface GoalCandidateInput {
  id?: string;
  title: string;
  source?: string;
  value?: GoalCandidateValue;
  status?: GoalCandidateStatus;
  reason?: string;
  evidence?: JsonObject;
}

export function readGoalState(store: SessionStore, sessionId: string): GoalState | undefined {
  const event = store.latestEventOfTypes(sessionId, ["goal.updated"]);
  if (!event) {
    return undefined;
  }
  return parseGoalState(event.data);
}

export function readGoalHorizons(store: SessionStore, sessionId: string, goalId?: string): GoalHorizonSnapshot[] {
  const events = store.listEventsOfTypes(sessionId, ["goal.updated"]);
  const latest = readGoalState(store, sessionId)?.goal;
  const targetGoalId = goalId ?? latest?.id;
  if (!targetGoalId) {
    return [];
  }
  const byGeneration = new Map<number, GoalHorizonSnapshot>();
  for (const event of events) {
    const state = parseGoalState(event.data);
    const goal = state?.goal;
    if (!goal || goal.id !== targetGoalId || !goal.planning) {
      continue;
    }
    const summary = goalHorizonDisplaySummary(goal.horizon_generation, goal.planning.summary);
    byGeneration.set(goal.horizon_generation, {
      generation: goal.horizon_generation,
      title: goalHorizonTitle(summary),
      summary,
      active_step_id: goal.planning.active_step_id,
      steps: cloneGoalPlanning(goal.planning).steps,
      updated_at: goal.planning.updated_at || goal.updated_at,
      current: false,
    });
  }
  const currentGeneration = latest?.id === targetGoalId ? latest.horizon_generation : undefined;
  return [...byGeneration.values()]
    .sort((a, b) => a.generation - b.generation)
    .map((horizon) => ({ ...horizon, current: horizon.generation === currentGeneration }));
}

export function readGoalReflections(store: SessionStore, sessionId: string, goalId?: string): GoalReflectionSnapshot[] {
  const events = store.listEvents(sessionId);
  const latest = readGoalState(store, sessionId)?.goal;
  const targetGoalId = goalId ?? latest?.id;
  if (!targetGoalId) {
    return [];
  }
  const startedByRun = new Map<string, number>();
  const reflections: GoalReflectionSnapshot[] = [];
  for (const event of events) {
    if (event.data.goal_id !== targetGoalId) {
      continue;
    }
    if (event.type === "goal.reflection.started") {
      const generation = numericValue(event.data.horizon_generation) ?? 0;
      if (event.run_id) {
        startedByRun.set(event.run_id, generation);
      }
      continue;
    }
    if (event.type !== "goal.reflection.completed") {
      continue;
    }
    const decision = parseGoalReflectionDecision(event.data.decision);
    if (!decision) {
      continue;
    }
    const generation =
      numericValue(event.data.source_horizon_generation) ??
      (event.run_id ? startedByRun.get(event.run_id) : undefined) ??
      numericValue(event.data.previous_horizon_generation) ??
      numericValue(event.data.horizon_generation);
    if (generation === undefined) {
      continue;
    }
    const nextGeneration = numericValue(event.data.horizon_generation);
    reflections.push({
      generation,
      next_generation: nextGeneration,
      run_id: event.run_id,
      decision,
      summary: optionalString(event.data.summary),
      blocker: optionalString(event.data.blocker),
      reflection_packet: event.data.reflection_packet && typeof event.data.reflection_packet === "object" && !Array.isArray(event.data.reflection_packet)
        ? cloneJsonObject(event.data.reflection_packet as JsonObject)
        : undefined,
      verification_evidence: event.data.verification_evidence && typeof event.data.verification_evidence === "object" && !Array.isArray(event.data.verification_evidence)
        ? cloneJsonObject(event.data.verification_evidence as JsonObject)
        : undefined,
      created_at: event.created_at ?? "",
    });
  }
  return reflections;
}

export function createGoalState(input: GoalCreateInput, now = new Date()): GoalState {
  const objective = input.objective.trim();
  if (!objective) {
    throw new Error("objective is required");
  }
  validateTokenBudget(input.token_budget);
  const timestamp = now.toISOString();
  const preference = input.preference ?? "deliver";
  const runtimePolicy = createLoopRuntimePolicy(input.runtime_policy);
  const replay = preference === "replay" ? createLoopReplayState(input.replay) : undefined;
  const planning = preference === "replay" ? undefined : createGoalPlanning(horizonZeroPlanningInput(preference), now);
  return {
    enabled: true,
    goal: {
      id: randomId("goal"),
      objective,
      owner: cleanOptionalString(input.owner),
      review_owner: cleanOptionalString(input.review_owner),
      preference,
      runtime_policy: runtimePolicy,
      replay,
      hil_policy: input.hil_policy ?? "auto",
      status: "active",
      token_budget: input.token_budget,
      tokens_used: 0,
      time_used_ms: 0,
      time_used_seconds: 0,
      tool_rounds_used: 0,
      tool_calls_used: 0,
      horizon_generation: 0,
      ledger: emptyGoalLedger(timestamp),
      delivery_contract: preference === "replay" ? undefined : createGoalDeliveryContract(objective, preference, timestamp),
      coverage: preference === "replay" ? undefined : emptyGoalCoverage(timestamp),
      requirements: preference === "replay" ? undefined : [],
      frontier: preference === "replay" ? undefined : [],
      evidence_records: preference === "replay" ? undefined : [],
      residual_risks: preference === "replay" ? undefined : [],
      planning,
      created_at: timestamp,
      updated_at: timestamp,
    },
  };
}

function horizonZeroPlanningInput(preference: LoopPreference): GoalPlanningInput {
  if (preference === "discover") {
    return {
      summary: "Loop task 0 · Discover bootstrap",
      active_step_id: "read_research_objective",
      steps: [
        { id: "read_research_objective", title: "Read research objective", status: "in_progress" },
        { id: "define_evidence_metrics_guardrails", title: "Define evidence, metrics, and guardrails", status: "pending" },
        { id: "design_experiment_protocol", title: "Design or locate the benchmark / experiment protocol", status: "pending" },
        { id: "seed_experiment_hypotheses", title: "Seed experiment hypotheses", status: "pending" },
      ],
    };
  }
  return {
    summary: "Loop task 0 · Deliver bootstrap",
    active_step_id: "read_objective_and_constraints",
    steps: [
      { id: "read_objective_and_constraints", title: "Read objective and constraints", status: "in_progress" },
      { id: "map_work_surfaces", title: "Map work surfaces, risks, and unknowns", status: "pending" },
      { id: "seed_frontier_candidates", title: "Seed high-value frontier candidates", status: "pending" },
      { id: "choose_first_execution_slice", title: "Choose the first execution slice", status: "pending" },
    ],
  };
}

function createLoopRuntimePolicy(input?: LoopRuntimePolicy): LoopRuntimePolicy {
  if (input?.mode === "at_least") {
    const minDurationMs = Math.max(0, Math.trunc(input.min_duration_ms));
    return Number.isFinite(minDurationMs) && minDurationMs > 0
      ? { mode: "at_least", min_duration_ms: minDurationMs }
      : { mode: "auto" };
  }
  return { mode: "auto" };
}

function createLoopReplayState(input?: LoopReplayInput): LoopReplayState {
  const targetAttempts = Math.max(1, Math.trunc(input?.target_attempts ?? 1));
  const remainingAttempts = Math.max(0, Math.trunc(input?.remaining_attempts ?? targetAttempts));
  return {
    target_attempts: Number.isFinite(targetAttempts) ? targetAttempts : 1,
    remaining_attempts: Number.isFinite(remainingAttempts) ? remainingAttempts : targetAttempts,
  };
}

function createGoalVerifierPolicy(input: GoalVerifierPolicyInput, now = new Date()): GoalVerifierPolicy {
  const used = new Set<string>();
  const commandVerifiers = input.command_verifiers.map((item, index) => {
    const command = item.command.trim();
    if (!command) {
      throw new Error("command verifiers must have non-empty commands");
    }
    const id = normalizeGoalStepId(item.id, command, index, used);
    used.add(id);
    const cwd = cleanVerifierCwd(item.cwd);
    return {
      id,
      command,
      cwd,
      required: item.required !== false,
    };
  });
  return {
    command_verifiers: commandVerifiers,
    updated_at: now.toISOString(),
  };
}

function cleanVerifierCwd(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === ".") {
    return undefined;
  }
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "") || undefined;
}

function emptyGoalLedger(timestamp: string): GoalLedger {
  return {
    open: [],
    done: [],
    rejected: [],
    updated_at: timestamp,
  };
}

function emptyGoalCoverage(timestamp: string): GoalCoverageState {
  return {
    surfaces: [],
    updated_at: timestamp,
  };
}

function createGoalDeliveryContract(objective: string, preference: LoopPreference, timestamp: string): GoalDeliveryContract | undefined {
  if (preference === "replay") {
    return undefined;
  }
  if (preference === "discover") {
    return {
      success_criteria: [`Reach an evidence-supported conclusion for: ${objective}`],
      constraints: [],
      assumptions: [],
      non_goals: [],
      required_evidence: [
        "hypothesis, intervention, baseline, metric, and experiment result",
        "comparison against controls or an explicit reason controls are not applicable",
        "reward-hack and variance checks when a metric drives the conclusion",
      ],
      risk_surfaces: [
        "benchmark design and metric validity",
        "baseline/control selection",
        "implementation side effects",
        "variance, confounders, and reward hacking",
      ],
      updated_at: timestamp,
    };
  }
  return {
    success_criteria: [`Complete the stated objective end to end: ${objective}`],
    constraints: [],
    assumptions: [],
    non_goals: [],
    required_evidence: [
      "frontier candidates completed or rejected with evidence",
      "verification from tests, checks, review, or equivalent hard evidence",
      "recursive reflection packet covering decomposition, coverage, remaining frontier, and why no expansion remains",
    ],
    risk_surfaces: [
      "code paths and integration boundaries",
      "tests and negative cases",
      "configuration, deployment, and rollback behavior",
      "docs, user-visible behavior, and operational risks",
    ],
    updated_at: timestamp,
  };
}

function createGoalCandidates(inputs: GoalCandidateInput[], status: GoalCandidateStatus, timestamp: string): GoalCandidate[] {
  const used = new Set<string>();
  return inputs.map((input, index) => {
    const title = input.title.trim();
    if (!title) {
      throw new Error("goal ledger candidates must have non-empty titles");
    }
    const id = normalizeGoalStepId(input.id, title, index, used);
    used.add(id);
    return {
      id,
      title,
      source: cleanOptionalString(input.source),
      value: input.value ?? "medium",
      status,
      reason: cleanOptionalString(input.reason),
      evidence: input.evidence ? cloneJsonObject(input.evidence) : undefined,
      updated_at: timestamp,
    };
  });
}

export function replaceGoalPlanning(state: GoalState, input: GoalPlanningInput, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  next.goal.planning = createGoalPlanning(input, now);
  next.goal.updated_at = next.goal.planning.updated_at;
  return next;
}

export function consumeRepeatGoalRun(state: GoalState, now = new Date()): GoalState | undefined {
  if (state.goal.preference !== "replay" || !state.goal.replay) {
    return undefined;
  }
  const remaining = repeatGoalRemainingRuns(state.goal);
  if (remaining <= 0) {
    return undefined;
  }
  const next = cloneGoalState(state);
  next.goal.replay = {
    ...state.goal.replay,
    remaining_attempts: remaining - 1,
  };
  next.goal.updated_at = now.toISOString();
  return next;
}

export function completeRepeatGoal(state: GoalState, summary: string | undefined, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  const trimmed = summary?.trim();
  if (trimmed) {
    next.goal.summary = trimmed;
  }
  next.enabled = false;
  next.goal.status = "complete";
  next.goal.updated_at = now.toISOString();
  return next;
}

export function repeatGoalRemainingRuns(goal: GoalRecord): number {
  if (goal.preference !== "replay" || !goal.replay) {
    return 0;
  }
  return Math.max(0, Math.trunc(goal.replay.remaining_attempts ?? goal.replay.target_attempts));
}

export function setGoalOwner(state: GoalState, owner: string | undefined, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  const normalized = cleanOptionalString(owner);
  if (normalized) {
    next.goal.owner = normalized;
  } else {
    delete next.goal.owner;
  }
  next.goal.updated_at = now.toISOString();
  return next;
}

export function setGoalReviewOwner(state: GoalState, owner: string | undefined, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  const normalized = cleanOptionalString(owner);
  if (normalized) {
    next.goal.review_owner = normalized;
  } else {
    delete next.goal.review_owner;
  }
  next.goal.updated_at = now.toISOString();
  return next;
}

export function setGoalVerifierPolicy(state: GoalState, input: GoalVerifierPolicyInput, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  next.goal.verifier_policy = createGoalVerifierPolicy(input, now);
  next.goal.updated_at = next.goal.verifier_policy.updated_at;
  return next;
}

export function updateGoalLedger(state: GoalState, input: GoalLedgerInput, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const current = next.goal.ledger ?? emptyGoalLedger(timestamp);
  next.goal.ledger = {
    open: input.open !== undefined ? createGoalCandidates(input.open, "open", timestamp) : current.open,
    done: input.done !== undefined ? createGoalCandidates(input.done, "done", timestamp) : current.done,
    rejected: input.rejected !== undefined ? createGoalCandidates(input.rejected, "rejected", timestamp) : current.rejected,
    updated_at: timestamp,
  };
  next.goal.frontier = frontierFromLegacyLedger(next.goal.ledger) ?? [];
  next.goal.updated_at = timestamp;
  return next;
}

export function appendGoalLedgerCandidate(state: GoalState, input: GoalCandidateInput, now = new Date()): GoalState {
  const title = input.title.trim();
  if (!title) {
    throw new Error("candidate title is required");
  }
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const ledger = next.goal.ledger ?? emptyGoalLedger(timestamp);
  const used = new Set([...ledger.open, ...ledger.done, ...ledger.rejected].map((candidate) => candidate.id));
  const candidate: GoalCandidate = {
    id: normalizeGoalStepId(input.id, title, ledger.open.length + ledger.done.length + ledger.rejected.length, used),
    title,
    source: cleanOptionalString(input.source),
    value: input.value ?? "medium",
    status: "open",
    reason: cleanOptionalString(input.reason),
    evidence: input.evidence ? cloneJsonObject(input.evidence) : undefined,
    updated_at: timestamp,
  };
  ledger.open = [...ledger.open.filter((item) => !goalCandidatesMatch(item, candidate)), candidate];
  ledger.done = ledger.done.filter((item) => !goalCandidatesMatch(item, candidate));
  ledger.rejected = ledger.rejected.filter((item) => !goalCandidatesMatch(item, candidate));
  ledger.updated_at = timestamp;
  next.goal.ledger = ledger;
  next.goal.frontier = frontierFromLegacyLedger(ledger) ?? [];
  next.goal.updated_at = timestamp;
  return next;
}

export function closeGoalLedgerCandidate(state: GoalState, input: GoalCandidateCloseInput, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const ledger = next.goal.ledger ?? emptyGoalLedger(timestamp);
  const matchId = canonicalGoalIdentity(input.candidate_id);
  const matchTitle = cleanOptionalString(input.title);
  const index = ledger.open.findIndex((candidate) => {
    if (matchId && canonicalGoalIdentity(candidate.id) === matchId) {
      return true;
    }
    return Boolean(matchTitle && goalStepTitleKey(candidate.title) === goalStepTitleKey(matchTitle));
  });
  if (index < 0) {
    const label = input.candidate_id ?? input.title ?? "candidate";
    throw new Error(`open candidate not found: ${label}`);
  }
  const [candidate] = ledger.open.splice(index, 1);
  if (!candidate) {
    throw new Error("open candidate not found");
  }
  const closed: GoalCandidate = {
    ...candidate,
    status: input.status,
    reason: cleanOptionalString(input.reason) ?? candidate.reason,
    evidence: input.evidence ? cloneJsonObject(input.evidence) : candidate.evidence ? cloneJsonObject(candidate.evidence) : undefined,
    updated_at: timestamp,
  };
  if (input.status === "done") {
    ledger.done = [...ledger.done.filter((item) => !goalCandidatesMatch(item, closed)), closed];
    ledger.rejected = ledger.rejected.filter((item) => !goalCandidatesMatch(item, closed));
  } else {
    ledger.rejected = [...ledger.rejected.filter((item) => !goalCandidatesMatch(item, closed)), closed];
    ledger.done = ledger.done.filter((item) => !goalCandidatesMatch(item, closed));
  }
  ledger.updated_at = timestamp;
  next.goal.ledger = ledger;
  next.goal.frontier = frontierFromLegacyLedger(ledger) ?? [];
  next.goal.updated_at = timestamp;
  return next;
}

export function updateGoalDeliveryContract(state: GoalState, input: GoalDeliveryContractInput, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const current = next.goal.delivery_contract ?? createGoalDeliveryContract(next.goal.objective, next.goal.preference, timestamp);
  if (!current) {
    throw new Error("delivery contract is not available for replay loops");
  }
  next.goal.delivery_contract = {
    success_criteria: input.success_criteria !== undefined ? cleanGoalStringList(input.success_criteria) : current.success_criteria,
    constraints: input.constraints !== undefined ? cleanGoalStringList(input.constraints) : current.constraints,
    assumptions: input.assumptions !== undefined ? cleanGoalStringList(input.assumptions) : current.assumptions,
    non_goals: input.non_goals !== undefined ? cleanGoalStringList(input.non_goals) : current.non_goals,
    required_evidence: input.required_evidence !== undefined ? cleanGoalStringList(input.required_evidence) : current.required_evidence,
    risk_surfaces: input.risk_surfaces !== undefined ? cleanGoalStringList(input.risk_surfaces) : current.risk_surfaces,
    updated_at: timestamp,
  };
  next.goal.updated_at = timestamp;
  return next;
}

export function updateGoalCoverageSurface(state: GoalState, input: GoalCoverageSurfaceInput, now = new Date()): GoalState {
  const title = input.title.trim();
  if (!title) {
    throw new Error("coverage surface title is required");
  }
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const coverage = next.goal.coverage ?? emptyGoalCoverage(timestamp);
  const used = new Set(coverage.surfaces.map((surface) => surface.id));
  const id = normalizeGoalStepId(input.id, title, coverage.surfaces.length, used);
  const existingIndex = coverage.surfaces.findIndex((surface) => surface.id === id || goalStepTitleKey(surface.title) === goalStepTitleKey(title));
  const surface: GoalCoverageSurface = {
    id: existingIndex >= 0 ? coverage.surfaces[existingIndex]!.id : id,
    title,
    status: input.status ?? coverage.surfaces[existingIndex]?.status ?? "pending",
    notes: cleanOptionalString(input.notes) ?? coverage.surfaces[existingIndex]?.notes,
    evidence: input.evidence
      ? cloneJsonObject(input.evidence)
      : coverage.surfaces[existingIndex]?.evidence
        ? cloneJsonObject(coverage.surfaces[existingIndex]!.evidence!)
        : undefined,
    evidence_ids: input.evidence_ids !== undefined
      ? cleanGoalStringList(input.evidence_ids)
      : coverage.surfaces[existingIndex]?.evidence_ids
        ? [...coverage.surfaces[existingIndex]!.evidence_ids!]
        : undefined,
    confidence: input.confidence ?? coverage.surfaces[existingIndex]?.confidence,
    residual_risk_id: cleanOptionalString(input.residual_risk_id) ?? coverage.surfaces[existingIndex]?.residual_risk_id,
    updated_at: timestamp,
  };
  if (existingIndex >= 0) {
    coverage.surfaces[existingIndex] = surface;
  } else {
    coverage.surfaces.push(surface);
  }
  coverage.updated_at = timestamp;
  next.goal.coverage = coverage;
  next.goal.updated_at = timestamp;
  return next;
}

export function upsertGoalFrontierItem(state: GoalState, input: GoalFrontierInput, now = new Date()): GoalState {
  const title = input.title.trim();
  if (!title) {
    throw new Error("frontier title is required");
  }
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const frontier = next.goal.frontier ?? [];
  const used = new Set(frontier.map((item) => item.id));
  const id = normalizeGoalStepId(input.id, title, frontier.length, used);
  const existingIndex = frontier.findIndex((item) => item.id === id || goalStepTitleKey(item.title) === goalStepTitleKey(title));
  const prior = existingIndex >= 0 ? frontier[existingIndex] : undefined;
  const item: GoalFrontierItem = {
    id: prior?.id ?? id,
    title,
    source: cleanOptionalString(input.source) ?? prior?.source,
    value: input.value ?? prior?.value ?? "medium",
    status: input.status ?? prior?.status ?? "open",
    reason: cleanOptionalString(input.reason) ?? prior?.reason,
    evidence: input.evidence ? cloneJsonObject(input.evidence) : prior?.evidence ? cloneJsonObject(prior.evidence) : undefined,
    evidence_ids: input.evidence_ids !== undefined ? cleanGoalStringList(input.evidence_ids) : prior?.evidence_ids ? [...prior.evidence_ids] : undefined,
    residual_risk_id: cleanOptionalString(input.residual_risk_id) ?? prior?.residual_risk_id,
    updated_at: timestamp,
  };
  if (existingIndex >= 0) {
    frontier[existingIndex] = item;
  } else {
    frontier.push(item);
  }
  next.goal.frontier = frontier;
  next.goal.updated_at = timestamp;
  return next;
}

export function upsertGoalEvidenceRecord(state: GoalState, input: GoalEvidenceRecordInput, now = new Date()): GoalState {
  const title = cleanOptionalString(input.title) ?? cleanOptionalString(input.summary) ?? cleanOptionalString(input.command) ?? cleanOptionalString(input.path) ?? cleanOptionalString(input.uri);
  if (!title) {
    throw new Error("evidence title, summary, command, path, or uri is required");
  }
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const records = next.goal.evidence_records ?? [];
  const used = new Set(records.map((record) => record.id));
  const id = normalizeGoalStepId(input.id, title, records.length, used);
  const existingIndex = records.findIndex((record) => record.id === id);
  const prior = existingIndex >= 0 ? records[existingIndex] : undefined;
  const record: GoalEvidenceRecord = {
    id: prior?.id ?? id,
    kind: input.kind ?? prior?.kind ?? "other",
    title: cleanOptionalString(input.title) ?? prior?.title,
    summary: cleanOptionalString(input.summary) ?? prior?.summary,
    command: cleanOptionalString(input.command) ?? prior?.command,
    path: cleanOptionalString(input.path) ?? prior?.path,
    uri: cleanOptionalString(input.uri) ?? prior?.uri,
    metrics: input.metrics ? cloneJsonObject(input.metrics) : prior?.metrics ? cloneJsonObject(prior.metrics) : undefined,
    evidence: input.evidence ? cloneJsonObject(input.evidence) : prior?.evidence ? cloneJsonObject(prior.evidence) : undefined,
    confidence: input.confidence ?? prior?.confidence ?? "soft",
    updated_at: timestamp,
  };
  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }
  next.goal.evidence_records = records;
  next.goal.updated_at = timestamp;
  return next;
}

export function upsertGoalResidualRisk(state: GoalState, input: GoalResidualRiskInput, now = new Date()): GoalState {
  const title = input.title.trim();
  if (!title) {
    throw new Error("residual risk title is required");
  }
  const next = cloneGoalState(state);
  const timestamp = now.toISOString();
  const risks = next.goal.residual_risks ?? [];
  const used = new Set(risks.map((risk) => risk.id));
  const id = normalizeGoalStepId(input.id, title, risks.length, used);
  const existingIndex = risks.findIndex((risk) => risk.id === id || goalStepTitleKey(risk.title) === goalStepTitleKey(title));
  const prior = existingIndex >= 0 ? risks[existingIndex] : undefined;
  const risk: GoalResidualRisk = {
    id: prior?.id ?? id,
    title,
    severity: input.severity ?? prior?.severity ?? "medium",
    accepted: input.accepted ?? prior?.accepted ?? false,
    reason: cleanOptionalString(input.reason) ?? prior?.reason,
    evidence_ids: input.evidence_ids !== undefined ? cleanGoalStringList(input.evidence_ids) : prior?.evidence_ids ? [...prior.evidence_ids] : undefined,
    updated_at: timestamp,
  };
  if (existingIndex >= 0) {
    risks[existingIndex] = risk;
  } else {
    risks.push(risk);
  }
  next.goal.residual_risks = risks;
  next.goal.updated_at = timestamp;
  return next;
}

export function markGoalReflectionStarted(state: GoalState, runId: string, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  next.goal.reflection_status = "running";
  next.goal.last_reflection_run_id = runId;
  next.goal.last_reflection_decision = undefined;
  next.goal.last_reflection_summary = undefined;
  next.goal.last_reflection_packet = undefined;
  next.goal.verification_evidence = undefined;
  next.goal.blocker = undefined;
  next.goal.pending_review_decision = undefined;
  next.goal.updated_at = now.toISOString();
  return next;
}

export function stageGoalReviewDecision(state: GoalState, input: GoalReflectionInput, runId: string, now = new Date()): GoalState {
  validateReflectionInput(input);
  const timestamp = now.toISOString();
  const next = cloneGoalState(state);
  next.enabled = false;
  next.goal.status = "paused";
  next.goal.reflection_status = "completed";
  next.goal.last_reflection_run_id = runId;
  next.goal.last_reflection_decision = input.decision;
  next.goal.last_reflection_summary = cleanOptionalString(input.summary);
  next.goal.last_reflection_packet = normalizeGoalReflectionPacket(input.reflection_packet);
  next.goal.verification_evidence = input.verification_evidence ? cloneJsonObject(input.verification_evidence) : undefined;
  next.goal.blocker = input.decision === "blocked" ? cleanOptionalString(input.blocker) : "human review required";
  next.goal.pending_review_decision = {
    id: randomId("review"),
    action: input.decision,
    source_run_id: runId || undefined,
    source_horizon_generation: state.goal.horizon_generation,
    summary: cleanOptionalString(input.summary),
    verification_evidence: input.verification_evidence ? cloneJsonObject(input.verification_evidence) : undefined,
    reflection_packet: next.goal.last_reflection_packet ? cloneJsonObject(next.goal.last_reflection_packet) : undefined,
    blocker: cleanOptionalString(input.blocker),
    steps: input.steps?.map(cloneGoalPlanningStepInput),
    active_step_id: cleanOptionalString(input.active_step_id),
    requested_decision: ["approve", "reject", "revise", "block"],
    created_at: timestamp,
  };
  next.goal.updated_at = timestamp;
  return next;
}

export function completeGoalReflection(state: GoalState, input: GoalReflectionInput, runId: string, now = new Date()): GoalState {
  validateReflectionInput(input);
  const timestamp = now.toISOString();
  let next = cloneGoalState(state);
  next.goal.reflection_status = "completed";
  next.goal.last_reflection_run_id = runId;
  next.goal.last_reflection_decision = input.decision;
  next.goal.last_reflection_summary = cleanOptionalString(input.summary);
  next.goal.last_reflection_packet = normalizeGoalReflectionPacket(input.reflection_packet);
  next.goal.verification_evidence = input.verification_evidence ? cloneJsonObject(input.verification_evidence) : undefined;
  next.goal.blocker = cleanOptionalString(input.blocker);
  next.goal.pending_review_decision = undefined;
  if (input.decision === "expand") {
    next.goal.horizon_generation = Math.max(0, next.goal.horizon_generation) + 1;
    next.goal.planning = createGoalPlanning(
      {
        summary: input.summary ?? next.goal.planning?.summary,
        active_step_id: input.active_step_id,
        steps: input.steps ?? [],
      },
      now,
    );
  }
  reconcileLedgerCandidatesFromReflectionSteps(next.goal, input.steps ?? [], timestamp);
  next.goal.updated_at = timestamp;
  return next;
}

function validateReflectionInput(input: GoalReflectionInput): void {
  if (input.decision === "expand" && !input.steps?.length) {
    throw new Error("reflection decision expand requires concrete new steps with substantive impact on the original goal");
  }
  if (input.decision === "done" && !input.verification_evidence) {
    throw new Error("reflection decision done requires top-level verification_evidence");
  }
}

export function clearGoalPendingReviewDecision(state: GoalState, feedback: string | undefined, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  next.goal.pending_review_decision = undefined;
  next.enabled = true;
  next.goal.status = "active";
  next.goal.reflection_status = undefined;
  next.goal.last_reflection_run_id = undefined;
  next.goal.last_reflection_decision = undefined;
  next.goal.last_reflection_summary = undefined;
  next.goal.last_reflection_packet = undefined;
  next.goal.verification_evidence = undefined;
  next.goal.blocker = cleanOptionalString(feedback);
  next.goal.updated_at = now.toISOString();
  return next;
}

export function blockGoalForReview(state: GoalState, reason: string | undefined, now = new Date()): GoalState {
  const next = cloneGoalState(state);
  next.goal.pending_review_decision = undefined;
  next.enabled = false;
  next.goal.status = "paused";
  next.goal.blocker = cleanOptionalString(reason) ?? "human review blocked";
  next.goal.updated_at = now.toISOString();
  return next;
}

export function completeGoalAfterReflection(state: GoalState, summary: string | undefined, now = new Date()): GoalState {
  const recursiveMessage = goalCompletionRecursiveBlockMessage(state.goal);
  if (recursiveMessage) {
    throw new Error(recursiveMessage);
  }
  const candidateMessage = goalCompletionCandidateBlockMessage(state.goal);
  if (candidateMessage) {
    throw new Error(candidateMessage);
  }
  const structuralMessage = goalCompletionStructuralBlockMessage(state.goal);
  if (structuralMessage) {
    throw new Error(structuralMessage);
  }
  const next = cloneGoalState(state);
  const trimmed = summary?.trim() || next.goal.last_reflection_summary;
  if (trimmed) {
    next.goal.summary = trimmed;
  }
  next.enabled = false;
  next.goal.status = "complete";
  next.goal.updated_at = now.toISOString();
  return next;
}

export function attachGoalPlanSnapshot(state: GoalState, plan: GoalPlanSnapshot, now = new Date()): GoalState {
  let next = cloneGoalState(state);
  next.goal.plan = { ...plan };
  const steps = goalPlanningStepsFromMarkdown(plan.body);
  if (steps.length) {
    next = syncApprovedPlanIntoGoalPlanning(next, steps, plan.summary, now);
  }
  next.goal.updated_at = now.toISOString();
  return next;
}

function syncApprovedPlanIntoGoalPlanning(state: GoalState, planSteps: GoalPlanningStepInput[], summary: string | undefined, now: Date): GoalState {
  if (!state.goal.planning) {
    return replaceGoalPlanning(
      state,
      {
        summary,
        steps: planSteps,
      },
      now,
    );
  }
  const existing = state.goal.planning;
  const byId = new Map(existing.steps.map((step) => [step.id, step]));
  const byTitle = new Map(existing.steps.map((step) => [goalStepTitleKey(step.title), step]));
  const used = new Set<string>();
  const mergedSteps = planSteps.map((step, index) => {
    const title = step.title.trim();
    const provisionalId = normalizeGoalStepId(step.id, title, index, new Set());
    const prior = byId.get(provisionalId) ?? byTitle.get(goalStepTitleKey(title));
    const id = normalizeGoalStepId(prior?.id ?? step.id, title, index, used);
    used.add(id);
    return {
      id,
      title,
      status: prior?.status ?? step.status ?? "pending",
      notes: prior?.notes ?? cleanOptionalString(step.notes),
      evidence: prior?.evidence ? cloneJsonObject(prior.evidence) : step.evidence ? cloneJsonObject(step.evidence) : undefined,
    };
  });
  return replaceGoalPlanning(
    state,
    {
      summary: summary ?? existing.summary,
      active_step_id: existing.active_step_id && mergedSteps.some((step) => step.id === existing.active_step_id) ? existing.active_step_id : undefined,
      steps: mergedSteps,
    },
    now,
  );
}

export function updateGoalPlanningStep(state: GoalState, input: GoalStepUpdateInput, now = new Date()): GoalState {
  if (!state.goal.planning) {
    throw new Error("goal planning has not been decomposed yet");
  }
  const stepId = input.step_id.trim();
  if (!stepId) {
    throw new Error("step_id is required");
  }
  const timestamp = now.toISOString();
  const next = cloneGoalState(state);
  const planning = next.goal.planning!;
  let step = planning.steps.find((item) => item.id === stepId);
  if (!step) {
    const title = input.title?.trim();
    if (!title) {
      throw new Error(`unknown goal step: ${stepId}`);
    }
    step = {
      id: normalizeGoalStepId(stepId, title, planning.steps.length, new Set(planning.steps.map((item) => item.id))),
      title,
      status: input.status ?? "pending",
      updated_at: timestamp,
    };
    planning.steps.push(step);
  }
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) {
      throw new Error("step title cannot be empty");
    }
    step.title = title;
  }
  if (input.status) {
    step.status = input.status;
  }
  if (input.notes !== undefined) {
    const notes = input.notes.trim();
    if (notes) {
      step.notes = notes;
    } else {
      delete step.notes;
    }
  }
  if (input.evidence !== undefined) {
    step.evidence = cloneJsonObject(input.evidence);
  }
  step.updated_at = timestamp;
  if (input.active_step_id !== undefined) {
    planning.active_step_id = normalizeExistingStepId(input.active_step_id, planning.steps);
  } else if (step.status === "in_progress") {
    planning.active_step_id = step.id;
  } else if (planning.active_step_id === step.id && isTerminalGoalStepStatus(step.status)) {
    planning.active_step_id = firstNonTerminalStep(planning.steps)?.id;
  }
  const active = planning.active_step_id ? planning.steps.find((item) => item.id === planning.active_step_id) : undefined;
  if (active && active.status === "pending") {
    active.status = "in_progress";
    active.updated_at = timestamp;
  }
  reconcileLedgerCandidateFromStep(next.goal, step, timestamp);
  planning.updated_at = timestamp;
  next.goal.updated_at = timestamp;
  return next;
}

export function createGoalPlanning(input: GoalPlanningInput, now = new Date()): GoalPlanningState {
  const timestamp = now.toISOString();
  const used = new Set<string>();
  const steps = input.steps.map((step, index) => {
    const title = step.title.trim();
    if (!title) {
      throw new Error("goal planning steps must have non-empty titles");
    }
    const id = normalizeGoalStepId(step.id, title, index, used);
    used.add(id);
    return {
      id,
      title,
      status: step.status ?? "pending",
      notes: cleanOptionalString(step.notes),
      evidence: step.evidence ? cloneJsonObject(step.evidence) : undefined,
      updated_at: timestamp,
    };
  });
  if (!steps.length) {
    throw new Error("goal planning requires at least one step");
  }
  const activeStepId = normalizeExistingStepId(input.active_step_id, steps) ?? firstNonTerminalStep(steps)?.id;
  const activeStep = activeStepId ? steps.find((step) => step.id === activeStepId) : undefined;
  if (activeStep && activeStep.status === "pending") {
    activeStep.status = "in_progress";
  }
  return {
    summary: cleanOptionalString(input.summary),
    active_step_id: activeStepId,
    steps,
    updated_at: timestamp,
  };
}

export function writeGoalState(store: SessionStore, sessionId: string, state: GoalState, runId?: string): GoalState {
  const cloned = cloneGoalState(state);
  store.appendEvent({
    session_id: sessionId,
    run_id: runId,
    type: "goal.updated",
    data: goalStateToJson(cloned),
  });
  return cloned;
}

export function goalCompletionReportForRun(store: SessionStore, sessionId: string, runId: string): string | undefined {
  return goalCompletionForRun(store, sessionId, runId)?.report;
}

export function recordGoalCompletionReport(store: SessionStore, sessionId: string, runId: string): GoalCompletionReport | undefined {
  const completion = goalCompletionForRun(store, sessionId, runId);
  if (!completion) {
    return undefined;
  }
  const state = readGoalState(store, sessionId);
  if (!state) {
    return undefined;
  }
  const exists = store.listEvents(sessionId).some((event) => event.run_id === runId && event.type === "goal.completion_report");
  if (!exists) {
    const data: JsonObject = {
      goal_objective: completion.objective,
      report: completion.report,
      tool_rounds: state.goal.tool_rounds_used,
      tool_calls: state.goal.tool_calls_used,
      horizons: state.goal.horizon_generation + 1,
      tokens: state.goal.tokens_used,
      duration_ms: goalDurationMs(state.goal),
    };
    if (state.goal.summary) {
      data.completion_summary = state.goal.summary;
    }
    store.appendEvent({
      session_id: sessionId,
      run_id: runId,
      type: "goal.completion_report",
      data,
    });
  }
  return completion;
}

export function goalStateToJson(state: GoalState): JsonObject {
  return {
    enabled: state.enabled,
    goal: state.goal as unknown as JsonObject,
  };
}

export function applyGoalUsage(
  store: SessionStore,
  sessionId: string,
  usage: { tokens?: number; time_seconds?: number; duration_ms?: number; tool_rounds?: number; tool_calls?: number },
  runId?: string,
): GoalState | undefined {
  const state = readGoalState(store, sessionId);
  if (!state || !shouldAccountGoalUsage(store, sessionId, state, runId)) {
    return state;
  }
  const tokens = Math.max(0, Math.trunc(usage.tokens ?? 0));
  const seconds = Math.max(0, Math.trunc(usage.time_seconds ?? 0));
  const durationMs = Math.max(0, Math.trunc(usage.duration_ms ?? seconds * 1000));
  const toolRounds = Math.max(0, Math.trunc(usage.tool_rounds ?? 0));
  const toolCalls = Math.max(0, Math.trunc(usage.tool_calls ?? 0));
  if (tokens === 0 && durationMs === 0 && toolRounds === 0 && toolCalls === 0) {
    return state;
  }
  const next = cloneGoalState(state);
  next.goal.tokens_used += tokens;
  next.goal.time_used_ms = goalDurationMs(next.goal) + durationMs;
  next.goal.time_used_seconds = Math.floor(next.goal.time_used_ms / 1000);
  next.goal.tool_rounds_used += toolRounds;
  next.goal.tool_calls_used += toolCalls;
  next.goal.updated_at = new Date().toISOString();
  if (
    next.goal.token_budget !== undefined &&
    next.goal.tokens_used >= next.goal.token_budget &&
    next.goal.status === "active"
  ) {
    next.goal.status = "budget-limited";
  }
  return writeGoalState(store, sessionId, next, runId);
}

export function modelUsageTokenCost(usage: ModelUsage | undefined): number {
  if (!usage) {
    return 0;
  }
  if (typeof usage.total_tokens === "number" && Number.isFinite(usage.total_tokens)) {
    return Math.max(0, Math.trunc(usage.total_tokens));
  }
  const prompt = numeric(usage.prompt_tokens);
  const completion = numeric(usage.completion_tokens);
  return Math.max(0, prompt + completion);
}

export function renderGoalModeSection(state: GoalState | undefined): string | undefined {
  return renderLoopContext(state);
}

export function renderLoopContext(state: GoalState | undefined): string | undefined {
  if (!state?.enabled || !isActiveGoalPromptStatus(state.goal.status)) {
    return undefined;
  }
  const goal = state.goal;
  if (goal.preference === "replay") {
    return undefined;
  }
  return [
    "A loop objective is active for this session.",
    renderTrustedObjective(goal.objective),
    `preference: ${loopPreferenceLabel(goal.preference)}`,
    `runtime: ${renderLoopRuntimePolicy(goal.runtime_policy)}`,
    renderLoopRuntimeProgress(goal),
    renderLoopPlanContext(goal),
    renderGoalDeliveryContract(goal.delivery_contract, goal.preference),
    renderGoalCoverage(goal.coverage),
    renderGoalFrontier(goal),
    renderGoalEvidenceRecords(goal),
    goal.planning ? renderGoalPlanning(goal.planning) : "Internal loop task plan: not decomposed yet.",
    goal.plan ? renderApprovedPlan(goal.plan, Boolean(goal.planning)) : undefined,
    renderLatestReflection(goal),
    renderGoalVerifierPolicy(goal.verifier_policy),
    renderLoopCompletionGates(goal),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderLoopPlanContext(goal: GoalRecord): string {
  return `loop task: ${goal.horizon_generation}`;
}

export function loopPreferenceLabel(preference: LoopPreference): "Deliver" | "Discover" | "Replay" {
  if (preference === "discover") return "Discover";
  if (preference === "replay") return "Replay";
  return "Deliver";
}

export function renderLoopRuntimePolicy(policy: LoopRuntimePolicy): string {
  if (policy.mode === "at_least") {
    return `At least ${formatDurationMs(policy.min_duration_ms)}`;
  }
  return "Auto";
}

function renderLoopCompletionGates(goal: GoalRecord): string {
  if (goal.preference === "discover") {
    return [
      "Completion gates:",
      "- pending experiments are logged or explicitly ruled out",
      "- metric/evidence exists",
      "- conclusion follows from evidence",
      "- done reflection includes recursive planning evidence: decomposition, coverage review, remaining frontier or residual risk, and why no further expansion is useful",
      "- runtime at-least satisfied when configured",
      "- decision=done is recorded by the internal decision run",
    ].join("\n");
  }
  return [
    "Completion gates:",
    "- current horizon complete",
    "- decision=done is recorded by the internal decision run",
    "- no high-value frontier remains",
    "- done reflection includes recursive planning evidence: decomposition, coverage review, remaining frontier or residual risk, and why no further expansion is useful",
    "- runtime at-least satisfied when configured",
    "- verification evidence exists",
    "- required verifier policy is satisfied",
  ].join("\n");
}

export function completionBudgetReport(goal: GoalRecord): string | undefined {
  const usage =
    goal.token_budget === undefined
      ? `${goal.tokens_used} tokens used`
      : `${goal.tokens_used} of ${goal.token_budget} tokens used`;
  return `Loop achieved. ${countLabel(goal.tool_rounds_used, "tool loop")} · ${countLabel(goal.tool_calls_used, "tool call")} · ${countLabel(goal.horizon_generation + 1, "loop task")} · ${formatDurationMs(goalDurationMs(goal))} · ${usage}.`;
}

export function goalDurationMs(goal: GoalRecord): number {
  return Math.max(0, Math.trunc(goal.time_used_ms ?? goal.time_used_seconds * 1000));
}

export function loopRuntimeRemainingMs(goal: GoalRecord): number | undefined {
  const runtime = goal.runtime_policy;
  if (runtime.mode !== "at_least") {
    return undefined;
  }
  return Math.max(0, runtime.min_duration_ms - goalDurationMs(goal));
}

export function isLoopRuntimeSatisfied(goal: GoalRecord): boolean {
  const remaining = loopRuntimeRemainingMs(goal);
  return remaining === undefined || remaining <= 0;
}

export function formatGoalDuration(goal: GoalRecord): string {
  return formatDurationMs(goalDurationMs(goal));
}

export function renderTrustedObjective(objective: string): string {
  return `<objective>\n${escapeXmlText(objective)}\n</objective>`;
}

export function escapeXmlText(input: string): string {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function cloneGoalState(state: GoalState): GoalState {
  return {
    enabled: state.enabled,
    goal: {
      ...state.goal,
      preference: state.goal.preference ?? "deliver",
      runtime_policy: createLoopRuntimePolicy(state.goal.runtime_policy),
      replay: state.goal.replay ? { ...state.goal.replay } : undefined,
      hil_policy: state.goal.hil_policy ?? "auto",
      verification_evidence: state.goal.verification_evidence ? cloneJsonObject(state.goal.verification_evidence) : undefined,
      last_reflection_packet: state.goal.last_reflection_packet ? cloneJsonObject(state.goal.last_reflection_packet) : undefined,
      pending_review_decision: state.goal.pending_review_decision ? cloneGoalPendingReviewDecision(state.goal.pending_review_decision) : undefined,
      verifier_policy: state.goal.verifier_policy ? cloneGoalVerifierPolicy(state.goal.verifier_policy) : undefined,
      ledger: state.goal.ledger ? cloneGoalLedger(state.goal.ledger) : undefined,
      delivery_contract: state.goal.delivery_contract ? cloneGoalDeliveryContract(state.goal.delivery_contract) : undefined,
      coverage: state.goal.coverage ? cloneGoalCoverage(state.goal.coverage) : undefined,
      requirements: state.goal.requirements ? state.goal.requirements.map(cloneGoalRequirement) : undefined,
      frontier: state.goal.frontier ? state.goal.frontier.map(cloneGoalFrontierItem) : undefined,
      evidence_records: state.goal.evidence_records ? state.goal.evidence_records.map(cloneGoalEvidenceRecord) : undefined,
      residual_risks: state.goal.residual_risks ? state.goal.residual_risks.map(cloneGoalResidualRisk) : undefined,
      planning: state.goal.planning ? cloneGoalPlanning(state.goal.planning) : undefined,
      plan: state.goal.plan ? { ...state.goal.plan } : undefined,
    },
  };
}

export function incompleteGoalPlanningSteps(goal: GoalRecord): GoalPlanningStep[] {
  return goal.planning?.steps.filter((step) => !isTerminalGoalStepStatus(step.status)) ?? [];
}

export function incompleteGoalPlanningMessage(goal: GoalRecord): string | undefined {
  const incomplete = incompleteGoalPlanningSteps(goal);
  if (!incomplete.length) {
    return undefined;
  }
  const visible = incomplete.slice(0, 8).map((step) => step.id);
  const suffix = incomplete.length > visible.length ? `, and ${incomplete.length - visible.length} more` : "";
  return `Cannot complete goal with unfinished internal plan steps: ${visible.join(", ")}${suffix}`;
}

export function isGoalHorizonExhausted(goal: GoalRecord): boolean {
  return Boolean(goal.planning && incompleteGoalPlanningSteps(goal).length === 0);
}

export function goalCompletionReflectionBlockMessage(goal: GoalRecord): string | undefined {
  if (goal.pending_review_decision) {
    return "Cannot complete goal while a human review decision is pending.";
  }
  if (goal.last_reflection_decision !== "done") {
    return "Cannot complete goal until a tool-enabled reflection run records decision=done.";
  }
  if (!goal.verification_evidence || Object.keys(goal.verification_evidence).length === 0) {
    return "Cannot complete goal until the latest done reflection records top-level verification_evidence.";
  }
  return undefined;
}

export function goalCompletionRecursiveBlockMessage(goal: GoalRecord): string | undefined {
  if (goal.preference === "replay") {
    return undefined;
  }
  const reflectionMessage = goalCompletionReflectionBlockMessage(goal);
  if (reflectionMessage) {
    return reflectionMessage;
  }
  if (!hasRecursiveDoneReflectionEvidence(goal)) {
    return "Cannot auto-complete loop until the latest done reflection records recursive planning evidence: objective_decomposition, coverage_review, executed_evidence, remaining_frontier or residual_risk, and why_no_expand.";
  }
  return undefined;
}

export function hasRecursiveDoneReflectionEvidence(goal: GoalRecord): boolean {
  if (goal.last_reflection_decision !== "done") {
    return false;
  }
  const packet = normalizeGoalReflectionPacket(goal.last_reflection_packet);
  if (!packet) {
    return false;
  }
  return hasMeaningfulReflectionPacketField(packet, "objective_decomposition")
    && hasMeaningfulReflectionPacketField(packet, "coverage_review")
    && hasMeaningfulReflectionPacketField(packet, "executed_evidence")
    && (
      hasMeaningfulReflectionPacketField(packet, "remaining_frontier")
      || hasMeaningfulReflectionPacketField(packet, "residual_risk")
    )
    && hasMeaningfulReflectionPacketField(packet, "why_no_expand");
}

export function goalCompletionStructuralBlock(goal: GoalRecord): GoalStructuralBlock | undefined {
  if (goal.preference === "replay") {
    return undefined;
  }
  const issues: GoalStructuralBlockIssue[] = [];
  const surfaces = goal.coverage?.surfaces ?? [];
  const frontier = goalFrontierItems(goal);
  const evidenceRecords = goal.evidence_records ?? [];
  const residualRisks = goal.residual_risks ?? [];
  const highMediumOpen = frontier.filter((item) => item.status === "open" && (item.value === "high" || item.value === "medium"));
  const highMediumUnprovenClosed = frontier.filter((item) =>
    item.status !== "open"
    && (item.value === "high" || item.value === "medium")
    && !hasStructuralItemEvidence(item, evidenceRecords, residualRisks)
  );
  if (!surfaces.length) {
    issues.push({ kind: "coverage_empty", message: "coverage surfaces are empty" });
  } else {
    const uncovered = surfaces.filter((surface) => surface.status === "pending" || surface.status === "in_progress");
    const weakCovered = surfaces.filter((surface) => surface.status === "covered" && !hasCoverageEvidence(surface, evidenceRecords));
    const weakRejected = surfaces.filter((surface) => surface.status === "rejected" && !hasAcceptedResidualRisk(surface.residual_risk_id, residualRisks) && !surface.notes);
    if (uncovered.length) {
      issues.push({
        kind: "coverage_unfinished",
        message: `coverage has ${countLabel(uncovered.length, "unfinished surface")}`,
        count: uncovered.length,
        ids: uncovered.map((surface) => surface.id),
      });
    }
    if (weakCovered.length) {
      issues.push({
        kind: "coverage_missing_evidence",
        message: `coverage has ${countLabel(weakCovered.length, "covered surface")} without evidence`,
        count: weakCovered.length,
        ids: weakCovered.map((surface) => surface.id),
      });
    }
    if (weakRejected.length) {
      issues.push({
        kind: "coverage_rejected_weak",
        message: `coverage has ${countLabel(weakRejected.length, "rejected surface")} without accepted residual risk or rationale`,
        count: weakRejected.length,
        ids: weakRejected.map((surface) => surface.id),
      });
    }
  }
  if (!frontier.length) {
    issues.push({ kind: "frontier_empty", message: "frontier audit is empty" });
  }
  if (completedBootstrapFrontierStep(goal) && !frontier.length) {
    issues.push({ kind: "frontier_bootstrap_missing", message: "seed_frontier_candidates completed without recorded frontier" });
  }
  if (highMediumOpen.length) {
    issues.push({
      kind: "frontier_open_high_medium",
      message: `${countLabel(highMediumOpen.length, "open high/medium frontier item")} remain`,
      count: highMediumOpen.length,
      ids: highMediumOpen.map((item) => item.id),
    });
  }
  if (highMediumUnprovenClosed.length) {
    issues.push({
      kind: "frontier_closed_unproven",
      message: `${countLabel(highMediumUnprovenClosed.length, "closed high/medium frontier item")} lack evidence or accepted residual risk`,
      count: highMediumUnprovenClosed.length,
      ids: highMediumUnprovenClosed.map((item) => item.id),
    });
  }
  const unacceptedHighMediumRisks = residualRisks.filter((risk) => !risk.accepted && (risk.severity === "high" || risk.severity === "medium"));
  if (unacceptedHighMediumRisks.length) {
    issues.push({
      kind: "residual_risk_unaccepted",
      message: `${countLabel(unacceptedHighMediumRisks.length, "high/medium residual risk")} are not accepted`,
      count: unacceptedHighMediumRisks.length,
      ids: unacceptedHighMediumRisks.map((risk) => risk.id),
    });
  }
  if (!issues.length) {
    return undefined;
  }
  return {
    message: `Cannot complete ${goal.preference} loop until structural coverage and frontier audit are recorded: ${issues.map((issue) => issue.message).join("; ")}.`,
    issues,
  };
}

export function goalCompletionStructuralBlockMessage(goal: GoalRecord): string | undefined {
  return goalCompletionStructuralBlock(goal)?.message;
}

export function goalCompletionCandidateBlockMessage(goal: GoalRecord): string | undefined {
  if (goal.preference === "replay") {
    const remaining = repeatGoalRemainingRuns(goal);
    return remaining > 0 ? `Cannot complete replay loop while ${countLabel(remaining, "attempt")} remains.` : undefined;
  }
  const runtimeMessage = loopRuntimeCompletionBlockMessage(goal);
  if (runtimeMessage) {
    return runtimeMessage;
  }
  const openCandidates = meaningfulOpenGoalCandidates(goal);
  const highMedium = openCandidates.filter((candidate) => candidate.value === "high" || candidate.value === "medium");
  if (highMedium.length > 0) {
    return `Cannot complete ${goal.preference} loop while open high/medium frontier candidates remain (${highMedium.length}).`;
  }
  return undefined;
}

export function meaningfulOpenGoalCandidates(goal: GoalRecord): GoalCandidate[] {
  return meaningfulOpenFrontierItems(goalFrontierItems(goal));
}

export function loopRuntimeCompletionBlockMessage(goal: GoalRecord): string | undefined {
  const runtime = goal.runtime_policy;
  if (runtime.mode !== "at_least") {
    return undefined;
  }
  if (isLoopRuntimeSatisfied(goal)) {
    return undefined;
  }
  const elapsed = goalDurationMs(goal);
  return `Cannot complete loop before At least runtime is satisfied (${formatDurationMs(elapsed)} elapsed of ${formatDurationMs(runtime.min_duration_ms)}).`;
}

function renderLoopRuntimeProgress(goal: GoalRecord): string | undefined {
  const runtime = goal.runtime_policy;
  if (runtime.mode !== "at_least") {
    return undefined;
  }
  const remaining = loopRuntimeRemainingMs(goal) ?? 0;
  return `runtime progress: elapsed ${formatDurationMs(goalDurationMs(goal))}; minimum ${formatDurationMs(runtime.min_duration_ms)}; remaining ${formatDurationMs(remaining)}`;
}

export function goalPlanningProgressSummary(planning: GoalPlanningState): string {
  const counts = new Map<GoalStepStatus, number>();
  for (const step of planning.steps) {
    counts.set(step.status, (counts.get(step.status) ?? 0) + 1);
  }
  const parts = [
    countPart(counts, "completed", "completed"),
    countPart(counts, "in_progress", "in progress"),
    countPart(counts, "blocked", "blocked"),
    countPart(counts, "pending", "pending"),
    countPart(counts, "skipped", "skipped"),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : "no steps";
}

export function goalPlanningStepsFromMarkdown(body: string | undefined): GoalPlanningStepInput[] {
  if (!body) {
    return [];
  }
  return body
    .split(/\r?\n/)
    .map(parseGoalPlanningStepLine)
    .filter((step): step is GoalPlanningStepInput => Boolean(step));
}

export function validateTokenBudget(value: unknown): asserts value is number | undefined {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("token_budget must be a positive integer when provided");
  }
}

export function isAccountingGoal(goal: GoalRecord): boolean {
  return goal.status === "active" || goal.status === "budget-limited";
}

function shouldAccountGoalUsage(store: SessionStore, sessionId: string, state: GoalState, runId?: string): boolean {
  if (state.enabled && isAccountingGoal(state.goal)) {
    return true;
  }
  if (!runId || (state.goal.status !== "complete" && state.goal.status !== "dropped")) {
    return false;
  }
  return store.listEvents(sessionId).some((event) => {
    if (event.run_id !== runId || event.type !== "goal.updated") {
      return false;
    }
    const eventState = parseGoalState(event.data);
    return eventState?.goal.id === state.goal.id && (eventState.goal.status === "complete" || eventState.goal.status === "dropped");
  });
}

function goalCompletionForRun(store: SessionStore, sessionId: string, runId: string): GoalCompletionReport | undefined {
  const state = readGoalState(store, sessionId);
  if (!state || state.goal.status !== "complete") {
    return undefined;
  }
  const completedInRun = store.listEvents(sessionId).some((event) => {
    if (event.run_id !== runId || event.type !== "goal.updated") {
      return false;
    }
    const eventState = parseGoalState(event.data);
    return eventState?.goal.id === state.goal.id && eventState.goal.status === "complete";
  });
  const report = completedInRun ? completionBudgetReport(state.goal) : undefined;
  return report ? { objective: state.goal.objective, report } : undefined;
}

export function parseGoalReflectionDecision(value: unknown): GoalReflectionDecision | undefined {
  return value === "expand" || value === "done" || value === "blocked" ? value : undefined;
}

function parseGoalReflectionStatus(value: unknown): GoalReflectionStatus | undefined {
  return value === "running" || value === "completed" ? value : undefined;
}

function isActiveGoalPromptStatus(status: GoalStatus): boolean {
  return status === "active" || status === "budget-limited";
}

function latestGoalEvent(events: SessionEvent[]): SessionEvent | undefined {
  return events.filter((event) => event.type === "goal.updated").at(-1);
}

function parseGoalState(data: JsonObject): GoalState | undefined {
  const goal = data.goal;
  if (!goal || typeof goal !== "object" || Array.isArray(goal)) {
    return undefined;
  }
  const candidate = goal as Record<string, unknown>;
  const objective = typeof candidate.objective === "string" ? candidate.objective : "";
  const status = parseGoalStatus(candidate.status);
  const id = typeof candidate.id === "string" ? candidate.id : "";
  if (!id || !objective || !status) {
    return undefined;
  }
  const tokenBudget = numericOrUndefined(candidate.token_budget);
  const planning = parseGoalPlanning(candidate.planning);
  const horizonGeneration = numeric(candidate.horizon_generation);
  const ledger = parseGoalLedger(candidate.ledger);
  return {
    enabled: data.enabled === true,
    goal: {
      id,
      objective,
      owner: optionalString(candidate.owner),
      review_owner: optionalString(candidate.review_owner),
      preference: parseLoopPreference(candidate.preference) ?? "deliver",
      runtime_policy: parseLoopRuntimePolicy(candidate.runtime_policy) ?? { mode: "auto" },
      replay: parseLoopReplayState(candidate.replay),
      hil_policy: parseGoalHilPolicy(candidate.hil_policy) ?? "auto",
      status,
      token_budget: tokenBudget,
      tokens_used: numeric(candidate.tokens_used),
      time_used_ms: durationMsFromGoalData(candidate),
      time_used_seconds: numeric(candidate.time_used_seconds),
      tool_rounds_used: numeric(candidate.tool_rounds_used),
      tool_calls_used: numeric(candidate.tool_calls_used),
      horizon_generation: horizonGeneration,
      verifier_policy: parseGoalVerifierPolicy(candidate.verifier_policy),
      ledger,
      delivery_contract: parseGoalDeliveryContract(candidate.delivery_contract),
      coverage: parseGoalCoverage(candidate.coverage),
      requirements: parseGoalRequirements(candidate.requirements),
      frontier: parseGoalFrontier(candidate.frontier) ?? frontierFromLegacyLedger(ledger),
      evidence_records: parseGoalEvidenceRecords(candidate.evidence_records),
      residual_risks: parseGoalResidualRisks(candidate.residual_risks),
      reflection_status: parseGoalReflectionStatus(candidate.reflection_status),
      last_reflection_run_id: optionalString(candidate.last_reflection_run_id),
      last_reflection_decision: parseGoalReflectionDecision(candidate.last_reflection_decision),
      last_reflection_summary: optionalString(candidate.last_reflection_summary),
      last_reflection_packet: parseJsonObject(candidate.last_reflection_packet),
      verification_evidence: parseJsonObject(candidate.verification_evidence),
      blocker: optionalString(candidate.blocker),
      pending_review_decision: parseGoalPendingReviewDecision(candidate.pending_review_decision),
      planning,
      plan: parseGoalPlan(candidate.plan),
      summary: optionalString(candidate.summary),
      created_at: typeof candidate.created_at === "string" ? candidate.created_at : "",
      updated_at: typeof candidate.updated_at === "string" ? candidate.updated_at : "",
    },
  };
}

export function parseLoopPreference(value: unknown): LoopPreference | undefined {
  return value === "deliver" || value === "discover" || value === "replay" ? value : undefined;
}

function parseLoopRuntimePolicy(value: unknown): LoopRuntimePolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  if (data.mode === "auto") {
    return { mode: "auto" };
  }
  if (data.mode === "at_least") {
    const minDurationMs = numericValue(data.min_duration_ms);
    return minDurationMs !== undefined && minDurationMs > 0
      ? { mode: "at_least", min_duration_ms: Math.trunc(minDurationMs) }
      : { mode: "auto" };
  }
  return undefined;
}

function parseLoopReplayState(value: unknown): LoopReplayState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const targetAttempts = numericValue(data.target_attempts);
  if (targetAttempts === undefined || targetAttempts <= 0) {
    return undefined;
  }
  return createLoopReplayState({
    target_attempts: targetAttempts,
    remaining_attempts: numericValue(data.remaining_attempts),
  });
}

export function parseGoalHilPolicy(value: unknown): GoalHilPolicy | undefined {
  return value === "auto" || value === "review" ? value : undefined;
}

function renderApprovedPlan(plan: GoalPlanSnapshot, hasInternalPlanning: boolean): string {
  const bodySyncedIntoInternalPlan = hasInternalPlanning && goalPlanningStepsFromMarkdown(plan.body).length > 0;
  return [
    "Approved plan:",
    `<plan_objective>\n${escapeXmlText(plan.objective)}\n</plan_objective>`,
    plan.summary ? `Plan summary: ${escapeXmlText(plan.summary)}` : undefined,
    bodySyncedIntoInternalPlan ? "Body synced into the internal goal plan above." : plan.body ? `Plan body:\n${escapeXmlText(truncateText(plan.body, PLAN_PROMPT_BODY_LIMIT).text)}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderGoalPlanning(planning: GoalPlanningState): string {
  const active = planning.active_step_id ? planning.steps.find((step) => step.id === planning.active_step_id) : undefined;
  return [
    "Internal goal plan:",
    planning.summary ? `Plan summary: ${escapeXmlText(planning.summary)}` : undefined,
    active ? `Active step: ${escapeXmlText(active.id)} ${escapeXmlText(active.title)}` : undefined,
    `Progress: ${goalPlanningProgressSummary(planning)}`,
    ...planning.steps.flatMap((step) => renderGoalPlanningStep(step)),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderGoalDeliveryContract(contract: GoalDeliveryContract | undefined, preference: LoopPreference): string | undefined {
  if (!contract) {
    return undefined;
  }
  const label = preference === "discover" ? "Research contract:" : "Delivery contract:";
  return [
    label,
    ...renderStringList("Success criteria", contract.success_criteria, 3),
    ...renderStringList("Required evidence", contract.required_evidence, 4),
    ...renderStringList("Risk surfaces", contract.risk_surfaces, 4),
    ...renderStringList("Assumptions", contract.assumptions, 3),
    ...renderStringList("Non-goals", contract.non_goals, 3),
    ...renderStringList("Constraints", contract.constraints, 3),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderGoalCoverage(coverage: GoalCoverageState | undefined): string | undefined {
  if (!coverage?.surfaces.length) {
    return undefined;
  }
  const visible = coverage.surfaces.slice(0, 8).map((surface) => {
    const notes = surface.notes ? ` - ${escapeXmlText(truncateEvidenceText(surface.notes, 180))}` : "";
    return `- [${surface.status}] ${escapeXmlText(surface.id)} ${escapeXmlText(surface.title)}${notes}`;
  });
  const omitted = Math.max(0, coverage.surfaces.length - visible.length);
  return [
    "Coverage surfaces:",
    ...visible,
    omitted ? `- ${omitted} more coverage surfaces recorded` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderGoalFrontier(goal: GoalRecord): string | undefined {
  const frontier = goalFrontierItems(goal);
  if (!frontier.length) {
    return undefined;
  }
  const counts = new Map<GoalFrontierStatus, number>();
  for (const item of frontier) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  const visibleOpen = frontier
    .filter((item) => item.status === "open" && (item.value === "high" || item.value === "medium"))
    .slice(0, 8)
    .map((item) => `- [${item.value}] ${escapeXmlText(item.id)} ${escapeXmlText(item.title)}${item.reason ? ` - ${escapeXmlText(truncateEvidenceText(item.reason, 180))}` : ""}`);
  return [
    "Frontier audit:",
    `open: ${counts.get("open") ?? 0}; done: ${counts.get("done") ?? 0}; rejected: ${counts.get("rejected") ?? 0}`,
    visibleOpen.length ? "Open high/medium frontier:" : undefined,
    ...visibleOpen,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderGoalEvidenceRecords(goal: GoalRecord): string | undefined {
  const records = goal.evidence_records ?? [];
  const risks = goal.residual_risks ?? [];
  if (!records.length && !risks.length) {
    return undefined;
  }
  const visibleRecords = records.slice(-6).map((record) => {
    const label = record.title ?? record.command ?? record.path ?? record.uri ?? record.summary ?? record.id;
    return `- [${record.confidence}] ${escapeXmlText(record.kind)} ${escapeXmlText(record.id)} ${escapeXmlText(truncateEvidenceText(label, 180))}`;
  });
  const visibleRisks = risks.slice(0, 6).map((risk) => {
    const accepted = risk.accepted ? "accepted" : "open";
    return `- [${risk.severity}/${accepted}] ${escapeXmlText(risk.id)} ${escapeXmlText(risk.title)}${risk.reason ? ` - ${escapeXmlText(truncateEvidenceText(risk.reason, 180))}` : ""}`;
  });
  return [
    records.length ? "Evidence records:" : undefined,
    ...visibleRecords,
    risks.length ? "Residual risks:" : undefined,
    ...visibleRisks,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderStringList(label: string, values: string[], limit: number): string[] {
  const visible = values.filter((value) => value.trim()).slice(0, limit);
  if (!visible.length) {
    return [];
  }
  const omitted = Math.max(0, values.length - visible.length);
  return [
    `${label}:`,
    ...visible.map((value) => `- ${escapeXmlText(truncateEvidenceText(value, 260))}`),
    omitted ? `- ${omitted} more` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function goalHorizonDisplaySummary(generation: number, summary: string | undefined): string | undefined {
  const trimmed = cleanOptionalString(summary);
  if (!trimmed) {
    return undefined;
  }
  const horizonPrefix = /^(?:horizon|loop task)\s+(\d+)\s*(?:[·:.-])\s*(.*)$/i.exec(trimmed);
  if (horizonPrefix) {
    const sourceGeneration = Number.parseInt(horizonPrefix[1] ?? "", 10);
    if (sourceGeneration !== generation) {
      return undefined;
    }
    const text = cleanOptionalString(horizonPrefix[2]);
    return text ? goalHorizonDisplayLabel(text) : undefined;
  }
  return goalHorizonDisplayLabel(trimmed);
}

function goalHorizonTitle(summary: string | undefined): string | undefined {
  return cleanOptionalString(summary);
}

function goalHorizonDisplayLabel(text: string): string {
  switch (text.toLowerCase()) {
    case "orientation":
      return "Setup";
    case "candidate ledger":
      return "Candidate work";
    default:
      return text;
  }
}

function renderLatestReflection(goal: GoalRecord): string | undefined {
  if (!goal.reflection_status && !goal.last_reflection_decision && !goal.last_reflection_summary && !goal.last_reflection_packet && !goal.verification_evidence && !goal.blocker) {
    return undefined;
  }
  return [
    "Latest internal loop decision:",
    goal.reflection_status ? `status: ${goal.reflection_status}` : undefined,
    goal.last_reflection_decision ? `decision: ${goal.last_reflection_decision}` : undefined,
    goal.last_reflection_packet ? `recursive reflection packet: ${escapeXmlText(compactEvidenceSummary(goal.last_reflection_packet))}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderPendingReviewDecision(decision: GoalPendingReviewDecision | undefined): string | undefined {
  if (!decision) {
    return undefined;
  }
  return [
    "Human review pending:",
    `action: ${decision.action}`,
    `source loop task: ${decision.source_horizon_generation}`,
    decision.summary ? `summary: ${escapeXmlText(truncateEvidenceText(decision.summary, 1000))}` : undefined,
    decision.blocker ? `blocker: ${escapeXmlText(truncateEvidenceText(decision.blocker, 1000))}` : undefined,
    decision.verification_evidence ? `verification evidence: ${escapeXmlText(compactEvidenceSummary(decision.verification_evidence))}` : undefined,
    decision.steps?.length ? "proposed steps:" : undefined,
    ...(decision.steps ?? []).map((step) => `- ${escapeXmlText(step.id ?? "")} ${escapeXmlText(step.title)}${step.status ? ` (${step.status})` : ""}`),
    "Do not continue this loop until the user resolves the pending review decision.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderGoalVerifierPolicy(policy: GoalVerifierPolicy | undefined): string | undefined {
  if (!policy?.command_verifiers.length) {
    return undefined;
  }
  return [
    "Verifier policy:",
    ...policy.command_verifiers.slice(0, 8).map((verifier) => {
      const required = verifier.required ? "required" : "optional";
      const cwd = verifier.cwd ? ` cwd=${escapeXmlText(verifier.cwd)}` : "";
      return `- command ${escapeXmlText(verifier.id)} (${required}${cwd}): ${escapeXmlText(truncateEvidenceText(verifier.command, 300))}`;
    }),
  ].join("\n");
}

function renderDefaultVerifierPolicy(): string {
  return "Default verifier policy: background auto-completion requires a current-loop-task pass from command, research metric, human review, or checker verification. Reflection-only evidence is not enough for unattended completion.";
}

function cloneGoalVerifierPolicy(policy: GoalVerifierPolicy): GoalVerifierPolicy {
  return {
    command_verifiers: policy.command_verifiers.map((verifier) => ({ ...verifier })),
    updated_at: policy.updated_at,
  };
}

function renderGoalPlanningStep(step: GoalPlanningStep): string[] {
  const marker = stepMarker(step.status);
  const lines = [`[${marker}] ${escapeXmlText(step.id)} ${escapeXmlText(step.title)}`];
  if (step.notes) {
    lines.push(`notes: ${escapeXmlText(truncateEvidenceText(step.notes, 500))}`);
  }
  if (step.evidence) {
    lines.push(`evidence: ${escapeXmlText(compactEvidenceSummary(step.evidence))}`);
  }
  return lines;
}

function reconcileLedgerCandidateFromStep(goal: GoalRecord, step: GoalPlanningStep, timestamp: string): void {
  if (!goal.ledger || (step.status !== "completed" && step.status !== "skipped")) {
    return;
  }
  const openIndex = goal.ledger.open.findIndex((candidate) => goalCandidateMatchesStep(candidate, step));
  if (openIndex < 0) {
    return;
  }
  const [candidate] = goal.ledger.open.splice(openIndex, 1);
  if (!candidate) {
    return;
  }
  goal.ledger.open = goal.ledger.open.filter((item) => !goalCandidatesMatch(item, candidate));
  const status: GoalCandidateStatus = step.status === "completed" ? "done" : "rejected";
  const moved: GoalCandidate = {
    ...candidate,
    id: normalizeGoalStepId(candidate.id, candidate.title, 0, new Set()),
    status,
    reason: step.notes ?? candidate.reason,
    evidence: step.evidence ? cloneJsonObject(step.evidence) : candidate.evidence ? cloneJsonObject(candidate.evidence) : undefined,
    updated_at: timestamp,
  };
  if (status === "done") {
    goal.ledger.done = [...goal.ledger.done.filter((item) => !goalCandidatesMatch(item, moved)), moved];
    goal.ledger.rejected = goal.ledger.rejected.filter((item) => !goalCandidatesMatch(item, moved));
  } else {
    goal.ledger.rejected = [...goal.ledger.rejected.filter((item) => !goalCandidatesMatch(item, moved)), moved];
    goal.ledger.done = goal.ledger.done.filter((item) => !goalCandidatesMatch(item, moved));
  }
  goal.ledger.updated_at = timestamp;
  goal.frontier = frontierFromLegacyLedger(goal.ledger) ?? [];
}

function reconcileLedgerCandidatesFromReflectionSteps(goal: GoalRecord, steps: GoalPlanningStepInput[], timestamp: string): void {
  if (!goal.ledger || !steps.length) {
    return;
  }
  const used = new Set<string>();
  for (const input of steps) {
    const title = input.title.trim();
    if (!title) {
      continue;
    }
    const status = input.status ?? "pending";
    if (status !== "completed" && status !== "skipped") {
      continue;
    }
    const step: GoalPlanningStep = {
      id: normalizeGoalStepId(input.id, title, used.size, used),
      title,
      status,
      notes: cleanOptionalString(input.notes),
      evidence: input.evidence ? cloneJsonObject(input.evidence) : undefined,
      updated_at: timestamp,
    };
    used.add(step.id);
    reconcileLedgerCandidateFromStep(goal, step, timestamp);
  }
}

function compactEvidenceSummary(value: JsonObject): string {
  return compactEvidenceObject(value, 0) || "recorded";
}

function compactEvidenceObject(value: JsonObject, depth: number): string {
  const entries = Object.keys(value)
    .sort()
    .slice(0, depth === 0 ? 8 : 4)
    .map((key) => {
      const compact = compactEvidenceValue(value[key], depth + 1);
      return compact ? `${key}=${compact}` : "";
    })
    .filter(Boolean);
  const omitted = Math.max(0, Object.keys(value).length - (depth === 0 ? 8 : 4));
  if (omitted > 0) {
    entries.push(`${omitted} more`);
  }
  return entries.join("; ");
}

function compactEvidenceValue(value: unknown, depth: number): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return truncateEvidenceText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => compactEvidenceValue(item, depth)).filter(Boolean).slice(0, 6);
    const omitted = Math.max(0, value.length - items.length);
    return `${items.join(", ")}${omitted ? `, ${omitted} more` : ""}`;
  }
  if (typeof value === "object") {
    if (depth >= 3) {
      return "object";
    }
    const compact = compactEvidenceObject(value as JsonObject, depth);
    return compact ? `(${compact})` : "";
  }
  return truncateEvidenceText(String(value));
}

function truncateEvidenceText(value: string, max = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function parseGoalPlan(value: unknown): GoalPlanSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const objective = optionalString(data.objective);
  const approvedAt = optionalString(data.approved_at);
  if (!id || !objective || !approvedAt) {
    return undefined;
  }
  return {
    id,
    objective,
    summary: optionalString(data.summary),
    body: optionalString(data.body),
    approved_at: approvedAt,
  };
}

function parseGoalPendingReviewDecision(value: unknown): GoalPendingReviewDecision | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const action = parseGoalReflectionDecision(data.action);
  const sourceHorizonGeneration = numericValue(data.source_horizon_generation);
  const createdAt = optionalString(data.created_at);
  if (!id || !action || sourceHorizonGeneration === undefined || !createdAt) {
    return undefined;
  }
  const requestedDecision = Array.isArray(data.requested_decision)
    ? data.requested_decision.map(parseGoalReviewDecision).filter((item): item is GoalReviewDecision => Boolean(item))
    : undefined;
  return {
    id,
    action,
    source_run_id: optionalString(data.source_run_id),
    source_horizon_generation: sourceHorizonGeneration,
    summary: optionalString(data.summary),
    verification_evidence: parseJsonObject(data.verification_evidence),
    reflection_packet: parseJsonObject(data.reflection_packet),
    blocker: optionalString(data.blocker),
    steps: parseGoalPlanningStepInputs(data.steps),
    active_step_id: optionalString(data.active_step_id),
    requested_decision: requestedDecision?.length ? requestedDecision : undefined,
    created_at: createdAt,
    feedback: optionalString(data.feedback),
  };
}

function parseGoalReviewDecision(value: unknown): GoalReviewDecision | undefined {
  return value === "approve" || value === "reject" || value === "revise" || value === "block" ? value : undefined;
}

function parseGoalVerifierPolicy(value: unknown): GoalVerifierPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const updatedAt = optionalString(data.updated_at) ?? "";
  const commandVerifiers = Array.isArray(data.command_verifiers)
    ? data.command_verifiers.map(parseGoalCommandVerifier).filter((item): item is GoalCommandVerifier => Boolean(item))
    : [];
  return commandVerifiers.length ? { command_verifiers: commandVerifiers, updated_at: updatedAt } : undefined;
}

function parseGoalCommandVerifier(value: unknown): GoalCommandVerifier | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const command = optionalString(data.command);
  if (!id || !command) {
    return undefined;
  }
  return {
    id,
    command,
    cwd: cleanVerifierCwd(optionalString(data.cwd)),
    required: data.required !== false,
  };
}

function parseGoalLedger(value: unknown): GoalLedger | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const updatedAt = typeof data.updated_at === "string" ? data.updated_at : "";
  return {
    open: parseGoalCandidates(data.open, "open"),
    done: parseGoalCandidates(data.done, "done"),
    rejected: parseGoalCandidates(data.rejected, "rejected"),
    updated_at: updatedAt,
  };
}

function parseGoalDeliveryContract(value: unknown): GoalDeliveryContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  return {
    success_criteria: parseStringList(data.success_criteria),
    constraints: parseStringList(data.constraints),
    assumptions: parseStringList(data.assumptions),
    non_goals: parseStringList(data.non_goals),
    required_evidence: parseStringList(data.required_evidence),
    risk_surfaces: parseStringList(data.risk_surfaces),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalCoverage(value: unknown): GoalCoverageState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const surfaces = Array.isArray(data.surfaces)
    ? data.surfaces.map(parseGoalCoverageSurface).filter((surface): surface is GoalCoverageSurface => Boolean(surface))
    : [];
  return {
    surfaces,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalCoverageSurface(value: unknown): GoalCoverageSurface | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const title = optionalString(data.title);
  const status = parseGoalCoverageSurfaceStatus(data.status);
  if (!id || !title || !status) {
    return undefined;
  }
  return {
    id,
    title,
    status,
    notes: optionalString(data.notes),
    evidence: parseJsonObject(data.evidence),
    evidence_ids: parseStringList(data.evidence_ids),
    confidence: parseGoalStructuralConfidence(data.confidence),
    residual_risk_id: optionalString(data.residual_risk_id),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalCoverageSurfaceStatus(value: unknown): GoalCoverageSurfaceStatus | undefined {
  return value === "pending" || value === "in_progress" || value === "covered" || value === "rejected" ? value : undefined;
}

function parseGoalRequirements(value: unknown): GoalRequirement[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const requirements = value.map(parseGoalRequirement).filter((item): item is GoalRequirement => Boolean(item));
  return requirements.length ? requirements : [];
}

function parseGoalRequirement(value: unknown): GoalRequirement | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const title = optionalString(data.title);
  const status = parseGoalRequirementStatus(data.status);
  if (!id || !title || !status) {
    return undefined;
  }
  return {
    id,
    title,
    status,
    notes: optionalString(data.notes),
    evidence_ids: parseStringList(data.evidence_ids),
    residual_risk_id: optionalString(data.residual_risk_id),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalFrontier(value: unknown): GoalFrontierItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const frontier = value.map(parseGoalFrontierItem).filter((item): item is GoalFrontierItem => Boolean(item));
  return frontier.length ? frontier : [];
}

function parseGoalFrontierItem(value: unknown): GoalFrontierItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const title = optionalString(data.title);
  const candidateValue = parseGoalCandidateValue(data.value);
  const status = parseGoalFrontierStatus(data.status);
  if (!id || !title || !candidateValue || !status) {
    return undefined;
  }
  return {
    id: normalizeGoalStepId(id, title, 0, new Set()),
    title,
    source: optionalString(data.source),
    value: candidateValue,
    status,
    reason: optionalString(data.reason),
    evidence: parseJsonObject(data.evidence),
    evidence_ids: parseStringList(data.evidence_ids),
    residual_risk_id: optionalString(data.residual_risk_id),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalEvidenceRecords(value: unknown): GoalEvidenceRecord[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const records = value.map(parseGoalEvidenceRecord).filter((item): item is GoalEvidenceRecord => Boolean(item));
  return records.length ? records : [];
}

function parseGoalEvidenceRecord(value: unknown): GoalEvidenceRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const kind = parseGoalEvidenceKind(data.kind);
  const confidence = parseGoalStructuralConfidence(data.confidence);
  if (!id || !kind || !confidence) {
    return undefined;
  }
  return {
    id,
    kind,
    title: optionalString(data.title),
    summary: optionalString(data.summary),
    command: optionalString(data.command),
    path: optionalString(data.path),
    uri: optionalString(data.uri),
    metrics: parseJsonObject(data.metrics),
    evidence: parseJsonObject(data.evidence),
    confidence,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalResidualRisks(value: unknown): GoalResidualRisk[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const risks = value.map(parseGoalResidualRisk).filter((item): item is GoalResidualRisk => Boolean(item));
  return risks.length ? risks : [];
}

function parseGoalResidualRisk(value: unknown): GoalResidualRisk | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const title = optionalString(data.title);
  const severity = parseGoalCandidateValue(data.severity);
  if (!id || !title || !severity) {
    return undefined;
  }
  return {
    id,
    title,
    severity,
    accepted: data.accepted === true,
    reason: optionalString(data.reason),
    evidence_ids: parseStringList(data.evidence_ids),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function frontierFromLegacyLedger(ledger: GoalLedger | undefined): GoalFrontierItem[] | undefined {
  if (!ledger) {
    return undefined;
  }
  const frontier = [...ledger.open, ...ledger.done, ...ledger.rejected].map((candidate) => ({
    ...candidate,
    status: candidate.status as GoalFrontierStatus,
    evidence: candidate.evidence ? cloneJsonObject(candidate.evidence) : undefined,
  }));
  return frontier.length ? frontier : [];
}

function parseGoalCandidates(value: unknown, status: GoalCandidateStatus): GoalCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => parseGoalCandidate(item, status)).filter((candidate): candidate is GoalCandidate => Boolean(candidate));
}

function parseGoalCandidate(value: unknown, status: GoalCandidateStatus): GoalCandidate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const title = optionalString(data.title);
  const candidateValue = parseGoalCandidateValue(data.value);
  if (!id || !title || !candidateValue) {
    return undefined;
  }
  return {
    id: normalizeGoalStepId(id, title, 0, new Set()),
    title,
    source: optionalString(data.source),
    value: candidateValue,
    status,
    reason: optionalString(data.reason),
    evidence: parseJsonObject(data.evidence),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalPlanning(value: unknown): GoalPlanningState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const rawSteps = Array.isArray(data.steps) ? data.steps : [];
  const steps = rawSteps.map(parseGoalPlanningStep).filter((step): step is GoalPlanningStep => Boolean(step));
  if (!steps.length) {
    return undefined;
  }
  const activeStepId = normalizeExistingStepId(optionalString(data.active_step_id), steps) ?? firstNonTerminalStep(steps)?.id;
  return {
    summary: optionalString(data.summary),
    active_step_id: activeStepId,
    steps,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalPlanningStepInputs(value: unknown): GoalPlanningStepInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const steps = value.map(parseGoalPlanningStepInput).filter((step): step is GoalPlanningStepInput => Boolean(step));
  return steps.length ? steps : undefined;
}

function parseGoalPlanningStepInput(value: unknown): GoalPlanningStepInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const title = optionalString(data.title);
  if (!title) {
    return undefined;
  }
  return {
    id: optionalString(data.id),
    title,
    status: parseGoalStepStatus(data.status),
    notes: optionalString(data.notes),
    evidence: parseJsonObject(data.evidence),
  };
}

function parseGoalPlanningStep(value: unknown): GoalPlanningStep | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const id = optionalString(data.id);
  const title = optionalString(data.title);
  const status = parseGoalStepStatus(data.status);
  if (!id || !title || !status) {
    return undefined;
  }
  return {
    id,
    title,
    status,
    notes: optionalString(data.notes),
    evidence: parseJsonObject(data.evidence),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : "",
  };
}

function parseGoalStatus(value: unknown): GoalStatus | undefined {
  return value === "active" || value === "paused" || value === "budget-limited" || value === "complete" || value === "dropped"
    ? value
    : undefined;
}

function parseGoalCandidateValue(value: unknown): GoalCandidateValue | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function parseGoalRequirementStatus(value: unknown): GoalRequirementStatus | undefined {
  return value === "pending" || value === "satisfied" || value === "accepted_risk" || value === "rejected" ? value : undefined;
}

function parseGoalFrontierStatus(value: unknown): GoalFrontierStatus | undefined {
  return value === "open" || value === "done" || value === "rejected" ? value : undefined;
}

function parseGoalStructuralConfidence(value: unknown): GoalStructuralConfidence | undefined {
  return value === "hard" || value === "soft" || value === "weak" ? value : undefined;
}

function parseGoalEvidenceKind(value: unknown): GoalEvidenceKind | undefined {
  return value === "command"
    || value === "test"
    || value === "file"
    || value === "resource"
    || value === "metric"
    || value === "review"
    || value === "manual"
    || value === "other"
    ? value
    : undefined;
}

export function parseGoalStepStatus(value: unknown): GoalStepStatus | undefined {
  return value === "pending" || value === "in_progress" || value === "completed" || value === "blocked" || value === "skipped"
    ? value
    : undefined;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : undefined;
}

function numericOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function durationMsFromGoalData(candidate: Record<string, unknown>): number {
  const millis = numeric(candidate.time_used_ms);
  if (millis > 0 || typeof candidate.time_used_ms === "number") {
    return millis;
  }
  return numeric(candidate.time_used_seconds) * 1000;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function cleanOptionalString(value: unknown): string | undefined {
  return optionalString(value);
}

function cleanGoalStringList(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(trimmed);
  }
  return output;
}

function parseStringList(value: unknown): string[] {
  return Array.isArray(value) ? cleanGoalStringList(value.filter((item): item is string => typeof item === "string")) : [];
}

function normalizeGoalReflectionPacket(value: unknown): GoalReflectionPacket | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return cloneJsonObject(value as JsonObject);
}

function hasMeaningfulReflectionPacketField(packet: JsonObject, key: string): boolean {
  if (!(key in packet)) {
    return false;
  }
  return hasMeaningfulReflectionPacketValue(packet[key]);
}

function hasMeaningfulReflectionPacketValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulReflectionPacketValue);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulReflectionPacketValue);
  }
  return false;
}

function cleanPlanStepTitle(value: string | undefined): string | undefined {
  const trimmed = value
    ?.replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
  return trimmed || undefined;
}

function parseGoalPlanningStepLine(line: string): GoalPlanningStepInput | undefined {
  const match = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[(?<mark>[ xX-])\]\s*)?(?<title>.+?)\s*$/.exec(line);
  const title = cleanPlanStepTitle(match?.groups?.title);
  if (!title) {
    return undefined;
  }
  const status = goalStepStatusFromCheckbox(match?.groups?.mark);
  return status ? { title, status } : { title };
}

function goalStepStatusFromCheckbox(value: string | undefined): GoalStepStatus | undefined {
  if (value === "x" || value === "X") {
    return "completed";
  }
  if (value === "-") {
    return "skipped";
  }
  if (value === " ") {
    return "pending";
  }
  return undefined;
}

function goalStepTitleKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function goalFrontierItems(goal: GoalRecord): GoalFrontierItem[] {
  if (goal.frontier !== undefined && goal.frontier.length > 0) {
    return goal.frontier;
  }
  const legacy = frontierFromLegacyLedger(goal.ledger) ?? [];
  return legacy.length ? legacy : goal.frontier ?? [];
}

function meaningfulOpenFrontierItems(frontier: GoalFrontierItem[]): GoalCandidate[] {
  const closedKeys = new Set(frontier.filter((item) => item.status !== "open").flatMap(goalFrontierSemanticKeys));
  const seenKeys = new Set<string>();
  const output: GoalCandidate[] = [];
  for (const item of frontier) {
    if (item.status !== "open") {
      continue;
    }
    const keys = goalFrontierSemanticKeys(item);
    if (keys.some((key) => closedKeys.has(key))) {
      continue;
    }
    if (keys.some((key) => seenKeys.has(key))) {
      continue;
    }
    for (const key of keys) {
      seenKeys.add(key);
    }
    output.push(frontierItemToCandidate(item));
  }
  return output;
}

function frontierItemToCandidate(item: GoalFrontierItem): GoalCandidate {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    value: item.value,
    status: item.status === "open" ? "open" : item.status,
    reason: item.reason,
    evidence: item.evidence ? cloneJsonObject(item.evidence) : undefined,
    updated_at: item.updated_at,
  };
}

function hasCoverageEvidence(surface: GoalCoverageSurface, records: GoalEvidenceRecord[]): boolean {
  if (surface.confidence === "weak") {
    return false;
  }
  if (surface.evidence && Object.keys(surface.evidence).length > 0) {
    return true;
  }
  return evidenceIdsResolve(surface.evidence_ids, records);
}

function hasStructuralItemEvidence(item: GoalFrontierItem, records: GoalEvidenceRecord[], risks: GoalResidualRisk[]): boolean {
  if (item.evidence && Object.keys(item.evidence).length > 0) {
    return true;
  }
  if (evidenceIdsResolve(item.evidence_ids, records)) {
    return true;
  }
  return hasAcceptedResidualRisk(item.residual_risk_id, risks);
}

function evidenceIdsResolve(ids: string[] | undefined, records: GoalEvidenceRecord[]): boolean {
  const requested = cleanGoalStringList(ids);
  if (!requested.length) {
    return false;
  }
  const byId = new Map(records.map((record) => [record.id, record]));
  return requested.every((id) => {
    const record = byId.get(id);
    return Boolean(record && record.confidence !== "weak");
  });
}

function hasAcceptedResidualRisk(id: string | undefined, risks: GoalResidualRisk[]): boolean {
  const riskId = cleanOptionalString(id);
  return Boolean(riskId && risks.some((risk) => risk.id === riskId && risk.accepted));
}

function completedBootstrapFrontierStep(goal: GoalRecord): boolean {
  return Boolean(goal.planning?.steps.some((step) => step.id === "seed_frontier_candidates" && step.status === "completed"));
}

function goalFrontierSemanticKeys(item: GoalFrontierItem): string[] {
  const keys: string[] = [];
  const id = canonicalGoalIdentity(item.id);
  if (id) {
    keys.push(`id:${id}`);
  }
  const title = goalStepTitleKey(item.title);
  if (title) {
    keys.push(`title:${title}`);
  }
  return keys;
}

function meaningfulOpenLedgerCandidates(ledger: GoalLedger | undefined): GoalCandidate[] {
  if (!ledger) {
    return [];
  }
  const closedKeys = new Set([...ledger.done, ...ledger.rejected].flatMap(goalCandidateSemanticKeys));
  const seenKeys = new Set<string>();
  const output: GoalCandidate[] = [];
  for (const candidate of ledger.open) {
    const keys = goalCandidateSemanticKeys(candidate);
    if (keys.some((key) => closedKeys.has(key))) {
      continue;
    }
    if (keys.some((key) => seenKeys.has(key))) {
      continue;
    }
    for (const key of keys) {
      seenKeys.add(key);
    }
    output.push(candidate);
  }
  return output;
}

function goalCandidateMatchesStep(candidate: GoalCandidate, step: GoalPlanningStep): boolean {
  const stepId = canonicalGoalIdentity(step.id);
  const stepTitle = goalStepTitleKey(step.title);
  return goalCandidateSemanticKeys(candidate).some((key) => key === `id:${stepId}` || key === `title:${stepTitle}`);
}

function goalCandidatesMatch(left: GoalCandidate, right: GoalCandidate): boolean {
  const rightKeys = new Set(goalCandidateSemanticKeys(right));
  return goalCandidateSemanticKeys(left).some((key) => rightKeys.has(key));
}

function goalCandidateSemanticKeys(candidate: GoalCandidate): string[] {
  const keys: string[] = [];
  const id = canonicalGoalIdentity(candidate.id);
  if (id) {
    keys.push(`id:${id}`);
  }
  const title = goalStepTitleKey(candidate.title);
  if (title) {
    keys.push(`title:${title}`);
  }
  return keys;
}

function canonicalGoalIdentity(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
}

function cloneGoalPlanning(planning: GoalPlanningState): GoalPlanningState {
  return {
    summary: planning.summary,
    active_step_id: planning.active_step_id,
    updated_at: planning.updated_at,
    steps: planning.steps.map((step) => ({
      ...step,
      evidence: step.evidence ? cloneJsonObject(step.evidence) : undefined,
    })),
  };
}

function cloneGoalPlanningStepInput(step: GoalPlanningStepInput): GoalPlanningStepInput {
  return {
    ...step,
    evidence: step.evidence ? cloneJsonObject(step.evidence) : undefined,
  };
}

function cloneGoalPendingReviewDecision(decision: GoalPendingReviewDecision): GoalPendingReviewDecision {
  return {
    ...decision,
    verification_evidence: decision.verification_evidence ? cloneJsonObject(decision.verification_evidence) : undefined,
    reflection_packet: decision.reflection_packet ? cloneJsonObject(decision.reflection_packet) : undefined,
    steps: decision.steps?.map(cloneGoalPlanningStepInput),
    requested_decision: decision.requested_decision ? [...decision.requested_decision] : undefined,
  };
}

function cloneGoalLedger(ledger: GoalLedger): GoalLedger {
  return {
    open: ledger.open.map(cloneGoalCandidate),
    done: ledger.done.map(cloneGoalCandidate),
    rejected: ledger.rejected.map(cloneGoalCandidate),
    updated_at: ledger.updated_at,
  };
}

function cloneGoalDeliveryContract(contract: GoalDeliveryContract): GoalDeliveryContract {
  return {
    success_criteria: [...contract.success_criteria],
    constraints: [...contract.constraints],
    assumptions: [...contract.assumptions],
    non_goals: [...contract.non_goals],
    required_evidence: [...contract.required_evidence],
    risk_surfaces: [...contract.risk_surfaces],
    updated_at: contract.updated_at,
  };
}

function cloneGoalCoverage(coverage: GoalCoverageState): GoalCoverageState {
  return {
    surfaces: coverage.surfaces.map((surface) => ({
      ...surface,
      evidence: surface.evidence ? cloneJsonObject(surface.evidence) : undefined,
      evidence_ids: surface.evidence_ids ? [...surface.evidence_ids] : undefined,
    })),
    updated_at: coverage.updated_at,
  };
}

function cloneGoalRequirement(requirement: GoalRequirement): GoalRequirement {
  return {
    ...requirement,
    evidence_ids: requirement.evidence_ids ? [...requirement.evidence_ids] : undefined,
  };
}

function cloneGoalFrontierItem(item: GoalFrontierItem): GoalFrontierItem {
  return {
    ...item,
    evidence: item.evidence ? cloneJsonObject(item.evidence) : undefined,
    evidence_ids: item.evidence_ids ? [...item.evidence_ids] : undefined,
  };
}

function cloneGoalEvidenceRecord(record: GoalEvidenceRecord): GoalEvidenceRecord {
  return {
    ...record,
    metrics: record.metrics ? cloneJsonObject(record.metrics) : undefined,
    evidence: record.evidence ? cloneJsonObject(record.evidence) : undefined,
  };
}

function cloneGoalResidualRisk(risk: GoalResidualRisk): GoalResidualRisk {
  return {
    ...risk,
    evidence_ids: risk.evidence_ids ? [...risk.evidence_ids] : undefined,
  };
}

function cloneGoalCandidate(candidate: GoalCandidate): GoalCandidate {
  return {
    ...candidate,
    evidence: candidate.evidence ? cloneJsonObject(candidate.evidence) : undefined,
  };
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function parseJsonObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return cloneJsonObject(value as JsonObject);
}

function normalizeGoalStepId(rawId: string | undefined, title: string, index: number, used: Set<string>): string {
  const seed = rawId?.trim() || title.trim() || `step-${index + 1}`;
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "") || `step-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeExistingStepId(stepId: string | undefined, steps: GoalPlanningStep[]): string | undefined {
  const trimmed = stepId?.trim();
  if (!trimmed) {
    return undefined;
  }
  return steps.some((step) => step.id === trimmed) ? trimmed : undefined;
}

function firstNonTerminalStep(steps: GoalPlanningStep[]): GoalPlanningStep | undefined {
  return steps.find((step) => !isTerminalGoalStepStatus(step.status));
}

function isTerminalGoalStepStatus(status: GoalStepStatus): boolean {
  return status === "completed" || status === "skipped";
}

function countPart(counts: Map<GoalStepStatus, number>, status: GoalStepStatus, label: string): string | undefined {
  const count = counts.get(status) ?? 0;
  return count > 0 ? `${count} ${label}` : undefined;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatDurationMs(durationMs: number): string {
  const safe = Math.max(0, Math.trunc(durationMs));
  if (safe > 0 && safe < 1000) {
    return `${safe}ms`;
  }
  return formatSeconds(Math.floor(safe / 1000));
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) {
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder ? `${hours}h ${minuteRemainder}m` : `${hours}h`;
}

function stepMarker(status: GoalStepStatus): string {
  switch (status) {
    case "completed":
      return "x";
    case "in_progress":
      return "*";
    case "blocked":
      return "!";
    case "skipped":
      return "-";
    case "pending":
      return " ";
  }
}
