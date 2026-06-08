import type { ClarifyChoice, ClarifyRequest, ClarifyResponse, JsonObject, ToolResult } from "../types.js";
import { fail, ok } from "../util/limit.js";
import type { ToolExecutionContext } from "./context.js";

export async function clarifyTool(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  const question = stringArg(args.question)?.trim();
  if (!question) {
    return fail("clarify_question_required", "question is required");
  }
  if (!context.clarify) {
    return fail("clarify_unavailable", "Clarification UI is unavailable for this run.");
  }
  const request: ClarifyRequest = {
    question,
    details: stringArg(args.details)?.trim() || undefined,
    choices: choicesArg(args.choices),
    allow_freeform: args.allow_freeform !== false,
    placeholder: stringArg(args.placeholder)?.trim() || undefined,
  };
  if (!request.allow_freeform && !request.choices.length) {
    return fail("clarify_choices_required", "choices are required when allow_freeform=false");
  }
  context.store.appendEvent({
    session_id: context.session_id,
    run_id: context.run_id,
    type: "clarification.requested",
    data: request as unknown as JsonObject,
  });
  let response: ClarifyResponse;
  try {
    response = normalizeClarifyResponse(await context.clarify(request), request);
  } catch (error) {
    return fail("clarify_cancelled", error instanceof Error ? error.message : String(error), { question });
  }
  context.store.appendEvent({
    session_id: context.session_id,
    run_id: context.run_id,
    type: "clarification.answered",
    data: {
      question,
      answer: response.answer,
      choice_id: response.choice_id,
      choice_label: response.choice_label,
      freeform: response.freeform,
    },
  });
  return ok(response.choice_label ? `Question answered: ${response.choice_label}` : "Question answered by user", {
    question,
    answer: response.answer,
    choice_id: response.choice_id,
    choice_label: response.choice_label,
    freeform: response.freeform,
  });
}

function normalizeClarifyResponse(response: ClarifyResponse, request: ClarifyRequest): ClarifyResponse {
  const choice = response.choice_id ? request.choices.find((item) => item.id === response.choice_id) : undefined;
  const answer = response.answer.trim() || choice?.label || "";
  if (!answer) {
    throw new Error("Clarification answer was empty.");
  }
  return {
    answer,
    choice_id: choice?.id ?? response.choice_id,
    choice_label: choice?.label ?? response.choice_label,
    freeform: choice ? false : response.freeform !== false,
  };
}

function choicesArg(value: unknown): ClarifyChoice[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const used = new Set<string>();
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        const label = item.trim();
        return label ? choice(label, undefined, index, used) : undefined;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return undefined;
      }
      const data = item as Record<string, unknown>;
      const label = stringArg(data.label)?.trim() || stringArg(data.value)?.trim();
      if (!label) {
        return undefined;
      }
      return choice(label, stringArg(data.description)?.trim(), index, used, stringArg(data.id)?.trim());
    })
    .filter((item): item is ClarifyChoice => Boolean(item));
}

function choice(label: string, description: string | undefined, index: number, used: Set<string>, rawId?: string): ClarifyChoice {
  const base = (rawId || label || `choice-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `choice-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return { id, label, description: description || undefined };
}

function stringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
