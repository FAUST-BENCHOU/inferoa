import type { AutoresearchState } from "../autoresearch/state.js";
import type { GoalState, GoalStepStatus } from "../goals/state.js";
import type { PlanState } from "../plans/state.js";
import { fg256 } from "./ansi.js";

export interface ModeFooterState {
  plan?: PlanState;
  autoresearch?: AutoresearchState;
  goal?: GoalState;
}

export function renderModeMetadataRight(state: ModeFooterState): string | undefined {
  const parts = [
    renderPlanMode(state.plan),
    renderAutoresearchMode(state.autoresearch),
    renderGoalMode(state.goal),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(fg256(238, " · ")) : undefined;
}

function renderPlanMode(state: PlanState | undefined): string | undefined {
  if (!state || (!state.enabled && state.plan.status !== "drafting" && state.plan.status !== "paused")) {
    return undefined;
  }
  const detail = !state.enabled || state.plan.status === "paused"
    ? "paused"
    : state.plan.body?.trim()
      ? "ready"
      : "drafting";
  return modeToken("Plan", detail);
}

function renderAutoresearchMode(state: AutoresearchState | undefined): string | undefined {
  if (!state?.enabled) {
    return undefined;
  }
  const experiment = state.experiment;
  if (experiment?.pending_run) {
    return modeToken("Research", `pending ${experiment.pending_run.id}`);
  }
  if (experiment?.best_metric !== undefined && experiment.best_metric !== null) {
    return modeToken("Research", `best ${experiment.best_metric}`);
  }
  if (experiment?.results.length) {
    return modeToken("Research", `${experiment.results.length} runs`);
  }
  return modeToken("Research", "mode");
}

function renderGoalMode(state: GoalState | undefined): string | undefined {
  const goal = state?.goal;
  if (!state || !goal || (!state.enabled && goal.status !== "active" && goal.status !== "budget-limited" && goal.status !== "paused")) {
    return undefined;
  }
  if (!state.enabled || goal.status === "paused") {
    return modeToken("Goal", "paused");
  }
  if (goal.status === "budget-limited") {
    return modeToken("Goal", "budget");
  }
  if (goal.planning?.steps.length) {
    const completed = countSteps(goal.planning.steps.map((step) => step.status), "completed");
    const blocked = countSteps(goal.planning.steps.map((step) => step.status), "blocked");
    const progress = blocked > 0 ? `${completed}/${goal.planning.steps.length} ${blocked} blocked` : `${completed}/${goal.planning.steps.length}`;
    return modeToken("Goal", progress);
  }
  return modeToken("Goal", "mode");
}

function countSteps(statuses: GoalStepStatus[], target: GoalStepStatus): number {
  return statuses.filter((status) => status === target).length;
}

function modeToken(name: string, detail: string): string {
  return `${fg256(75, name)} ${fg256(244, detail)}`;
}
