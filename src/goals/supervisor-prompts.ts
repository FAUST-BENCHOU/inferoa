import type { GoalRecord } from "./state.js";

export function buildGoalWorkPrompt(goalOrObjective: GoalRecord | string): string {
  const objective = typeof goalOrObjective === "string" ? goalOrObjective : goalOrObjective.objective;
  const kind = typeof goalOrObjective === "string" ? "task" : goalOrObjective.kind;
  if (kind === "research") {
    return [
      `Loop objective: ${objective}`,
      "Continue the active research loop cycle.",
      "Use the loop task as the research cycle: keep loop steps current with goal op=update_step while maintaining research experiments with init_experiment, run_experiment, log_experiment, update_experiment, and update_notes.",
      "If a benchmark run is pending, log it before starting another run. If no experiment exists, identify or create ./autoresearch.sh, establish metrics and guardrails, initialize a baseline experiment, run it, and log the baseline.",
      "For exploratory work, create separate experiments for distinct hypotheses; keep at most one pending run at a time.",
      "Use metric evidence, guardrail checks, failed runs, rejected experiments, and notes to decide the next useful experiment.",
      "If this is research cycle 0 orientation, inspect enough context to infer the approach, map the relevant research surfaces, rank the high-value frontier by impact, uncertainty, and risk, call goal op=set_strategy with approach when needed, seed the candidate ledger, and complete the orientation steps.",
      "Track frontier candidates as hypotheses, experiments, verification gaps, or deferred work. Complete, reject, or defer them with evidence instead of letting unexplored directions disappear from the loop.",
    ].join("\n");
  }
  return [
    `Loop objective: ${objective}`,
    "Continue the active loop task.",
    "If this is loop task 0 orientation, inspect enough context to infer the loop approach, map the relevant work surfaces, rank the high-value frontier by impact, uncertainty, and risk, call goal op=set_strategy with approach when needed, seed the candidate ledger with goal op=update_ledger, and complete the orientation steps.",
    "Treat frontier candidates as the durable task topology: they may be code areas, user paths, APIs, documents, tests, design options, data flows, verification gaps, or deferred scope depending on the objective.",
    "Complete, reject, or defer frontier candidates with evidence so the loop does not confuse local progress with global completion.",
    "Keep step status, notes, and evidence current with goal op=update_step. Do not complete the loop merely because the current loop task is empty.",
  ].join("\n");
}

export function buildGoalReflectionPrompt(goalOrObjective: GoalRecord | string): string {
  const objective = typeof goalOrObjective === "string" ? goalOrObjective : goalOrObjective.objective;
  const kind = typeof goalOrObjective === "string" ? "task" : goalOrObjective.kind;
  if (kind === "research") {
    return [
      `Loop objective: ${objective}`,
      "Run an internal decision pass for the active research loop.",
      "Step back from the current research cycle, experiment ledger, run history, benchmark evidence, guardrail evidence, notes, and loop task plan.",
      "Treat the current experiments as hypotheses, not as the boundary of the research loop.",
      "Use current evidence first. Inspect only narrowly missing evidence when it changes expand/done/blocked; do not resume broad research execution from the decision pass.",
      "Generate competing next-cycle hypotheses before deciding, but keep only candidates with substantive expected impact.",
      "Use the candidate ledger and experiment ledger as the durable frontier, not merely as a list of experiments already tried. Add, complete, reject, or defer goal candidates with goal op=update_ledger and update experiment lifecycle with update_experiment when reflection changes what remains.",
      "Before choosing done, check for local convergence: did the loop overfocus on the first promising hypothesis, leave a high-value research surface open, or fail to justify deferred scope?",
      "Use decision=expand when a new research cycle should open a distinct experiment, continue a promising experiment, compare candidates, or run guardrail/regression verification with substantive impact.",
      "Use decision=done only when pending runs are logged, metric evidence is sufficient, high-value experiments are completed or rejected, and verification evidence includes run history, best metric, and guardrail evidence.",
      "Use decision=blocked with blocker details when harness, environment, data, or external dependencies prevent meaningful progress.",
      "Do not call goal op=decompose, op=update_plan, or op=update_step from reflection. New work must be returned through goal op=reflect decision=expand with concrete research-cycle steps.",
      "Finish by calling goal op=reflect exactly once.",
      "Do not call goal op=complete from a decision run; completion happens after the loop decision is recorded.",
    ].join("\n");
  }
  return [
    `Loop objective: ${objective}`,
    "Run an internal decision pass for the active loop.",
    "Step back from the just-finished turn, the current plan, and the current evidence.",
    "Use current evidence first. Inspect only narrowly missing evidence when it changes expand/done/blocked; do not resume broad implementation from the decision pass.",
    "Evaluate the best-effort version of the objective: as complete, polished, and semantically faithful as the current session can reasonably make it.",
    "Treat the current plan as a hypothesis, not as the boundary of the objective.",
    "Generate competing next-step hypotheses before deciding, but keep only candidates with substantive impact on the original objective.",
    "Use the candidate ledger as the durable frontier, not merely as a list of discovered fixes. Add, complete, reject, or defer candidates with goal op=update_ledger when reflection changes what remains.",
    "A frontier candidate can be any high-value work surface implied by the objective: code area, user path, API, document, test, design option, data flow, verification gap, or deferred scope.",
    "Look for better decomposition, missing verification, rough edges, or unfinished work implied by the top-level objective, even if all listed steps are complete.",
    "Before choosing done, check for local convergence: did the loop overfocus on the first promising area, leave a high-value work surface open, or fail to justify deferred scope?",
    "Hard stop condition: only accept new work when it has substantive impact on the original objective; otherwise choose decision=done.",
    "Do not call goal op=decompose, op=update_plan, or op=update_step from the decision pass. New work must be returned through goal op=reflect decision=expand with steps.",
    "Finish by calling goal op=reflect exactly once.",
    "Do not call goal op=complete from a decision run; completion happens after the loop decision is recorded.",
    "Use decision=expand only with concrete new loop task steps whose impact on the original objective is substantive.",
    "Use decision=done when no visible completion, verification, decomposition, or polish work with substantive impact remains, and include verification_evidence.",
    "Use decision=blocked with blocker details when completion cannot proceed without user input or an external state change.",
  ].join("\n");
}
