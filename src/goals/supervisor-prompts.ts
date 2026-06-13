import type { GoalRecord, LoopPreference } from "./state.js";

export function buildLoopExecutionPrompt(goalOrObjective: GoalRecord | string): string {
  const objective = typeof goalOrObjective === "string" ? goalOrObjective : goalOrObjective.objective;
  const preference = typeof goalOrObjective === "string" ? "deliver" : goalOrObjective.preference;
  if (preference === "discover") {
    return [
      `Loop objective: ${objective}`,
      "Execution turn for a Discover loop.",
      "Treat the objective as an open investigation; map evidence surfaces when the current horizon is too local.",
      "Choose the highest-information move: benchmark, compare, ablate, inspect, hypothesize, or run the experiment that best improves evidence.",
      "The agent decides the benchmark, metric, harness, controls, and comparison shape from workspace evidence.",
      "Record competing hypotheses, rejected branches, failures, metrics, and remaining uncertainty in the loop step, ledger, or decomposition.",
      "Every execution turn must make structural loop progress; natural-language completion claims alone are not progress.",
    ].join("\n");
  }
  return [
    `Loop objective: ${objective}`,
    "Execution turn for a Deliver loop.",
    "Treat the top-level objective as broader than the current local task unless evidence proves the full scope is covered.",
    "Map or refresh work surfaces when needed: code paths, tests, integrations, user-visible behavior, config, docs, risks, and rollback.",
    "Choose the highest-leverage action across implementation, verification, comparison, polish, and risk reduction.",
    "Execute and verify with the strongest practical evidence available this turn.",
    "Before ending, update the loop step, ledger, or decomposition with evidence, frontier status, and the next execution slice.",
    "Every execution turn must make structural loop progress; natural-language completion claims alone are not progress.",
  ].join("\n");
}

export function buildLoopDecisionPrompt(goalOrObjective: GoalRecord | string): string {
  const objective = typeof goalOrObjective === "string" ? goalOrObjective : goalOrObjective.objective;
  const preference = typeof goalOrObjective === "string" ? "deliver" : goalOrObjective.preference;
  if (preference === "discover") {
    return [
      `Loop objective: ${objective}`,
      "Decision turn for a Discover loop.",
      "Independently judge whether to expand, complete, or block; treat the current plan as evidence, not as the boundary.",
      "Inspect narrowly only if missing evidence can change the decision; do not perform broad execution in this turn.",
      "Call goal op=reflect exactly once with decision=expand, done, or blocked.",
      "If expanding, include concrete next steps in steps; never use bare expand.",
      "Use done only when completion gates are satisfied and the conclusion follows from concrete evidence.",
      "Use expand when a benchmark, comparison, ablation, failure analysis, guardrail, alternative hypothesis, or runtime minimum could materially improve the outcome.",
      "When At least runtime remains, expand to new evidence surfaces or experiments; never repeat stale or duplicate work just to consume time.",
    ].join("\n");
  }
  return [
    `Loop objective: ${objective}`,
    "Decision turn for a Deliver loop.",
    "Independently judge whether to expand, complete, or block; treat the current plan as evidence, not as the boundary.",
    "Inspect narrowly only if missing evidence can change the decision; do not perform broad implementation in this turn.",
    "Call goal op=reflect exactly once with decision=expand, done, or blocked.",
    "If expanding, include concrete next steps in steps; never use bare expand.",
    "Use done only when completion gates are satisfied and no material frontier remains.",
    "Use expand when coverage, verification, integration, user-visible behavior, edge cases, docs/config, or runtime minimum could materially improve delivery.",
    "When At least runtime remains, expand to a different high-value surface or stronger verification; never repeat stale or duplicate work just to consume time.",
  ].join("\n");
}

export function buildGoalWorkPrompt(goalOrObjective: GoalRecord | string): string {
  return buildLoopExecutionPrompt(goalOrObjective);
}

export function buildGoalReflectionPrompt(goalOrObjective: GoalRecord | string): string {
  return buildLoopDecisionPrompt(goalOrObjective);
}

export function loopPreferenceDescription(preference: LoopPreference): string {
  if (preference === "discover") return "Explore, experiment, and learn with evidence";
  if (preference === "replay") return "Repeat one visible prompt for fixed attempts";
  return "Close an end-to-end objective with verification";
}
