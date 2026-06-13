import type { GoalRecord, LoopPreference } from "./state.js";

export function buildLoopExecutionPrompt(goalOrObjective: GoalRecord | string): string {
  const objective = typeof goalOrObjective === "string" ? goalOrObjective : goalOrObjective.objective;
  const preference = typeof goalOrObjective === "string" ? "deliver" : goalOrObjective.preference;
  if (preference === "discover") {
    return [
      `Loop objective: ${objective}`,
      "Execution turn for a Discover loop.",
      "Drive autonomous research with evidence. Treat the objective as an open investigation, not a checklist to finish quickly.",
      "Build or locate the benchmark / experiment protocol that best answers the objective. The agent decides the benchmark, metric, harness, controls, and comparison shape from the workspace and task evidence.",
      "Form competing hypotheses, prioritize the highest-information experiment, run or design the smallest credible test, and record observations, metrics, guardrails, failures, and interpretation.",
      "Keep the internal loop plan current with goal op=update_step. Use goal op=update_ledger for hypotheses, evidence gaps, promising directions, and rejected branches so high-value frontier does not disappear.",
      "Every execution turn must record structural loop progress through goal op=update_step, goal op=update_ledger, or goal op=decompose. A natural-language summary alone is not loop progress.",
      "For complex or uncertain research, create a multi-layer plan: problem framing, evidence sources, baseline, experiment variants, comparison criteria, risks, and next verification slice.",
      "Do not force a fixed script name or preselected harness. Prefer the most defensible metric-driven evidence path available.",
      "End the turn with concrete evidence, updated frontier, and a clear next slice when more work remains.",
    ].join("\n");
  }
  return [
    `Loop objective: ${objective}`,
    "Execution turn for a Deliver loop.",
    "Close the end-to-end objective with verification. Treat the top-level objective as larger than the current small task unless evidence proves otherwise.",
    "Build a multi-layer plan when the objective is complex: user intent, affected surfaces, risks, dependencies, implementation slices, verification, polish, and rollback or follow-up concerns.",
    "During bootstrap and whenever the map is stale, map the relevant work surfaces and keep a durable task topology across code areas, user paths, APIs, documents, tests, design options, data flows, verification gaps.",
    "Actively expand the high-value frontier each turn, then rank the high-value frontier by impact, uncertainty, and risk. Look for missing work surfaces, edge cases, tests, integration paths, product rough edges, and verification gaps.",
    "Balance local progress with global completion. Do not conclude the loop merely because the current checklist is empty or one local fix is done.",
    "Maintain the candidate ledger with goal op=update_ledger so new findings, skipped branches, and remaining risks stay visible across turns. Convert execution evidence into goal op=update_step notes.",
    "Every execution turn must record structural loop progress through goal op=update_step, goal op=update_ledger, or goal op=decompose. A natural-language summary alone is not loop progress.",
    "When uncertain, generate hypotheses and a verification path instead of stopping. Prefer concrete edits, tests, inspections, or measurements that increase confidence.",
    "Keep the internal loop plan current with goal op=update_step. Leave evidence, frontier status, and the next execution slice visible for the decision turn.",
  ].join("\n");
}

export function buildLoopDecisionPrompt(goalOrObjective: GoalRecord | string): string {
  const objective = typeof goalOrObjective === "string" ? goalOrObjective : goalOrObjective.objective;
  const preference = typeof goalOrObjective === "string" ? "deliver" : goalOrObjective.preference;
  if (preference === "discover") {
    return [
      `Loop objective: ${objective}`,
      "Decision turn for a Discover loop.",
      "Do not do broad implementation or research execution in this turn. Decide only expand / done / blocked through goal op=reflect exactly once.",
      "Default posture: be skeptical of premature completion. A Discover loop is done only when pending experiments are logged or ruled out, metric/evidence exists, and the conclusion follows from evidence.",
      "If At least runtime is configured and not satisfied, decision=done is not allowed; expand with the next highest-information experiment or evidence check.",
      "When expanding for At least runtime, choose substantive work that could improve the research outcome; never expand just to consume time.",
      "Inspect only narrowly missing evidence when it changes the decision. Otherwise reason from current plan, evidence, frontier, experiment notes, metrics, and guardrails.",
      "Prefer expand when a comparison, ablation, baseline, failure analysis, guardrail, or alternative hypothesis could materially change the conclusion.",
      "Use done only with concrete verification_evidence containing the decisive metric/evidence, comparison context, and remaining-scope justification.",
      "Use blocked only when meaningful progress cannot continue without user input or external state change.",
    ].join("\n");
  }
  return [
    `Loop objective: ${objective}`,
    "Decision turn for a Deliver loop.",
    "Do not perform implementation work in this turn. Decide only expand / done / blocked through goal op=reflect exactly once.",
    "Step back. Use current evidence first; inspect only narrowly missing evidence when it can change the decision.",
    "Treat the current plan as a hypothesis, not as the boundary. Generate competing next-step hypotheses before declaring the loop complete.",
    "Default posture: be skeptical of premature completion. A complex objective should expand toward verification, contrast, boundaries, risk reduction, integration, or polish until evidence supports closure.",
    "If At least runtime is configured and not satisfied, decision=done is not allowed; expand with substantive work that advances the original objective.",
    "When expanding for At least runtime, choose substantive work that could improve the delivered outcome; never expand just to consume time.",
    "Evaluate the current horizon, evidence, durable frontier, work surface coverage, verifier policy, user-visible behavior, and remaining risks. Current checklist completion is not enough.",
    "Use expand when any high-value frontier remains, verification is weak, integration has not been checked, or the loop only solved a local slice of a broader objective.",
    "Use done only when the current horizon is complete, no high-value frontier remains, verification evidence exists, required verifiers are satisfied, and the top-level objective is genuinely handled as complete, polished, and semantically faithful.",
    "If only local convergence is visible while deferred scope could have substantive impact on the original objective, expand. Otherwise choose decision=done with best-effort evidence.",
    "Do not call goal op=complete from this turn. Do not call goal op=decompose from this turn. Record the decision through goal op=reflect exactly once.",
    "Use blocked only when meaningful progress cannot continue without user input or external state change.",
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
