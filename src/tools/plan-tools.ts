import type { ClarifyRequest, ClarifyResponse, JsonObject, ToolResult } from "../types.js";
import { fail, ok } from "../util/limit.js";
import type { ToolExecutionContext } from "./context.js";
import {
  clonePlanState,
  createPlanState,
  planApprovalBlockMessage,
  readPlanState,
  writePlanState,
  type PlanRecord,
  type PlanState,
} from "../plans/state.js";
import { attachGoalPlanSnapshot, readGoalState, writeGoalState } from "../goals/state.js";

export async function planTool(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  const op = stringArg(args.op) ?? "get";
  try {
    switch (op) {
      case "create":
        return createPlan(args, context);
      case "get":
        return describePlan(readPlanState(context.store, context.session_id), "Plan state");
      case "update":
        return updatePlan(args, context);
      case "approve":
        return await finishPlan(args, context, "approved");
      case "pause":
        return pausePlan(context);
      case "resume":
        return resumePlan(context);
      case "drop":
        return await finishPlan(args, context, "dropped");
      default:
        return fail("invalid_plan_op", `Unknown plan operation: ${op}`);
    }
  } catch (error) {
    return fail("plan_error", error instanceof Error ? error.message : String(error));
  }
}

function createPlan(args: JsonObject, context: ToolExecutionContext): ToolResult {
  const existing = readPlanState(context.store, context.session_id);
  if (existing && existing.plan.status !== "approved" && existing.plan.status !== "dropped") {
    return updateExistingPlanFromCreate(args, context, existing);
  }
  const objective = stringArg(args.objective)?.trim();
  if (!objective) {
    return fail("plan_objective_required", "objective is required when op=create");
  }
  const state = writePlanState(
    context.store,
    context.session_id,
    createPlanState({ objective, body: stringArg(args.body) }),
    context.run_id,
  );
  return describePlan(state, "Plan created");
}

function updateExistingPlanFromCreate(args: JsonObject, context: ToolExecutionContext, state: PlanState): ToolResult {
  const next = clonePlanState(state);
  const objective = stringArg(args.objective)?.trim();
  if (objective) {
    next.plan.objective = objective;
  }
  const body = stringArg(args.body);
  if (body !== undefined) {
    const trimmed = body.trim();
    if (trimmed) {
      next.plan.body = trimmed;
    }
  }
  const summary = stringArg(args.summary);
  if (summary !== undefined) {
    const trimmed = summary.trim();
    if (trimmed) {
      next.plan.summary = trimmed;
    }
  }
  next.enabled = true;
  next.plan.status = "drafting";
  next.plan.updated_at = new Date().toISOString();
  return describePlan(writePlanState(context.store, context.session_id, next, context.run_id), "Plan continued");
}

function updatePlan(args: JsonObject, context: ToolExecutionContext): ToolResult {
  const state = readPlanState(context.store, context.session_id);
  if (!state) {
    return fail("plan_missing", "No plan to update.");
  }
  if (state.plan.status === "approved" || state.plan.status === "dropped") {
    return fail("plan_closed", `Cannot update a ${state.plan.status} plan.`);
  }
  const next = clonePlanState(state);
  const objective = stringArg(args.objective)?.trim();
  if (objective) {
    next.plan.objective = objective;
  }
  const body = stringArg(args.body);
  if (body !== undefined) {
    const trimmed = body.trim();
    if (trimmed) {
      next.plan.body = trimmed;
    } else {
      delete next.plan.body;
    }
  }
  const summary = stringArg(args.summary);
  if (summary !== undefined) {
    const trimmed = summary.trim();
    if (trimmed) {
      next.plan.summary = trimmed;
    } else {
      delete next.plan.summary;
    }
  }
  next.enabled = true;
  next.plan.status = "drafting";
  next.plan.updated_at = new Date().toISOString();
  return describePlan(writePlanState(context.store, context.session_id, next, context.run_id), "Plan updated");
}

function pausePlan(context: ToolExecutionContext): ToolResult {
  const state = readPlanState(context.store, context.session_id);
  if (!state) {
    return fail("plan_missing", "No plan to pause.");
  }
  if (state.plan.status === "approved" || state.plan.status === "dropped") {
    return fail("plan_closed", `Cannot pause a ${state.plan.status} plan.`);
  }
  const next = clonePlanState(state);
  next.enabled = false;
  next.plan.status = "paused";
  next.plan.updated_at = new Date().toISOString();
  return describePlan(writePlanState(context.store, context.session_id, next, context.run_id), "Plan paused");
}

function resumePlan(context: ToolExecutionContext): ToolResult {
  const state = readPlanState(context.store, context.session_id);
  if (!state) {
    return fail("plan_missing", "No plan to resume.");
  }
  if (state.plan.status === "approved" || state.plan.status === "dropped") {
    return fail("plan_closed", `Cannot resume a ${state.plan.status} plan.`);
  }
  const next = clonePlanState(state);
  next.enabled = true;
  next.plan.status = "drafting";
  next.plan.updated_at = new Date().toISOString();
  return describePlan(writePlanState(context.store, context.session_id, next, context.run_id), "Plan resumed");
}

async function finishPlan(args: JsonObject, context: ToolExecutionContext, status: "approved" | "dropped"): Promise<ToolResult> {
  const state = readPlanState(context.store, context.session_id);
  if (!state) {
    return fail("plan_missing", status === "approved" ? "cannot approve plan because no plan is active" : "No plan to drop.");
  }
  if (state.plan.status === status) {
    return fail("plan_closed", `Plan is already ${status}.`);
  }
  const next = clonePlanState(state);
  const body = stringArg(args.body);
  if (body !== undefined) {
    const trimmed = body.trim();
    if (trimmed) {
      next.plan.body = trimmed;
    } else {
      delete next.plan.body;
    }
  }
  const summary = stringArg(args.summary);
  if (summary !== undefined) {
    const trimmed = summary.trim();
    if (trimmed) {
      next.plan.summary = trimmed;
    } else {
      delete next.plan.summary;
    }
  }
  if (status === "approved") {
    const blockMessage = planApprovalBlockMessage(next);
    if (blockMessage) {
      return fail("plan_not_ready", blockMessage, {
        enabled: next.enabled,
        plan: next.plan as unknown as JsonObject,
      });
    }
    const confirmation = await requestPlanApproval(next, context);
    if (!confirmation.approved) {
      return confirmation.result;
    }
  }
  next.enabled = false;
  next.plan.status = status;
  next.plan.updated_at = new Date().toISOString();
  const saved = writePlanState(context.store, context.session_id, next, context.run_id);
  if (status === "approved") {
    attachApprovedPlanToGoal(saved, context);
  }
  return describePlan(saved, status === "approved" ? "Plan approved" : "Plan dropped");
}

async function requestPlanApproval(state: PlanState, context: ToolExecutionContext): Promise<{ approved: true } | { approved: false; result: ToolResult }> {
  if (!context.clarify) {
    return {
      approved: false,
      result: fail("plan_approval_required", "Plan approval requires explicit user confirmation before execution.", {
        enabled: state.enabled,
        plan: state.plan as unknown as JsonObject,
      }),
    };
  }
  const request: ClarifyRequest = {
    question: "Implement this plan?",
    details: planApprovalDetails(state.plan),
    choices: [
      {
        id: "approve_execute",
        label: "Yes, implement this plan",
        description: "Exit Plan mode and continue with execution.",
      },
      {
        id: "revise_plan",
        label: "Keep planning",
        description: "Leave Plan mode active so the agent can revise the plan.",
      },
    ],
    allow_freeform: true,
    placeholder: "Type requested changes, or choose 1 to implement",
  };
  context.store.appendEvent({
    session_id: context.session_id,
    run_id: context.run_id,
    type: "clarification.requested",
    data: request as unknown as JsonObject,
  });
  let response: ClarifyResponse;
  try {
    response = await context.clarify(request);
  } catch (error) {
    return {
      approved: false,
      result: fail("plan_approval_cancelled", error instanceof Error ? error.message : String(error), {
        enabled: state.enabled,
        plan: state.plan as unknown as JsonObject,
      }),
    };
  }
  context.store.appendEvent({
    session_id: context.session_id,
    run_id: context.run_id,
    type: "clarification.answered",
    data: {
      question: request.question,
      answer: response.answer,
      choice_id: response.choice_id,
      choice_label: response.choice_label,
      freeform: response.freeform,
    },
  });
  if (isApprovalResponse(response)) {
    return { approved: true };
  }
  return {
    approved: false,
    result: ok("Plan approval was not confirmed. Keep the plan in drafting and revise it before execution.", {
      enabled: state.enabled,
      plan: state.plan as unknown as JsonObject,
      approval_status: "revision_requested",
      user_feedback: response.answer,
      choice_id: response.choice_id,
      choice_label: response.choice_label,
    }),
  };
}

function isApprovalResponse(response: ClarifyResponse): boolean {
  if (response.choice_id === "approve_execute") {
    return true;
  }
  if (response.choice_id === "revise_plan") {
    return false;
  }
  return /^(1|y|yes|approve|approved|ok|okay|go|run|execute|implement|确认|批准|同意|可以|执行|开始执行)$/i.test(response.answer.trim());
}

function describePlan(state: PlanState | undefined, prefix: string): ToolResult {
  if (!state) {
    return ok("No plan set.", { plan: null });
  }
  return ok(planSummary(prefix, state.plan), {
    enabled: state.enabled,
    plan: state.plan as unknown as JsonObject,
  });
}

function planSummary(prefix: string, plan: PlanRecord): string {
  const lines = [`${prefix}: ${plan.objective}`, `Status: ${plan.status}`];
  if (plan.summary) {
    lines.push(`Summary: ${plan.summary}`);
  }
  if (plan.body) {
    lines.push(`Plan body: ${plan.body}`);
    if (plan.status === "drafting") {
      lines.push("Next: call plan approve to ask the user whether to implement this plan or revise it.");
    }
  }
  return lines.join("\n");
}

function planApprovalDetails(plan: PlanRecord): string {
  const parts = [
    `Objective: ${plan.objective}`,
    plan.summary ? `Summary: ${plan.summary}` : undefined,
    plan.body ? "Review the proposed plan above. Type changes here to keep planning, or choose 1 to start execution." : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join("\n\n");
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function attachApprovedPlanToGoal(planState: PlanState, context: ToolExecutionContext): void {
  const goalState = readGoalState(context.store, context.session_id);
  if (!goalState || goalState.goal.status === "complete" || goalState.goal.status === "dropped") {
    return;
  }
  const next = attachGoalPlanSnapshot(goalState, {
    id: planState.plan.id,
    objective: planState.plan.objective,
    summary: planState.plan.summary,
    body: planState.plan.body,
    approved_at: planState.plan.updated_at,
  });
  writeGoalState(context.store, context.session_id, next, context.run_id);
}
