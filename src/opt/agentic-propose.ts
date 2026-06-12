import { ModelGateway } from "../model/gateway.js";
import { providerId } from "../model/endpoint-signals.js";
import { recordGoalLearningSignals } from "../loop/learning.js";
import { readGoalLoopView } from "../loop/projection.js";
import type { GoalLoopLearningSignal, GoalLoopVerification } from "../loop/types.js";
import type { SessionStore } from "../session/store.js";
import type { JsonObject, ModelRequest, VllmAgentConfig, WorkspaceIdentity } from "../types.js";
import type { OptLearningEdit, OptSkillTarget, OptSkillTargetKind } from "./opt-lite.js";

export type LoopLearningSignalTier = "T0" | "T1" | "T2" | "T3";
export type AgenticProposalSource = "agentic" | "deterministic_fallback";

export interface AgenticEvidencePacket {
  workspace: {
    id: string;
    root: string;
    alias: string;
  };
  sessions: AgenticEvidenceSession[];
  signals: AgenticEvidenceSignal[];
  source_events: AgenticSourceEvent[];
}

export interface AgenticEvidenceSession {
  session_id: string;
  goal_id: string;
  objective: string;
  verification_count: number;
}

export interface AgenticEvidenceSignal {
  signal_id: string;
  tier: LoopLearningSignalTier;
  target_hints: OptSkillTargetKind[];
  failure_mode: string;
  summary: string;
  source_event_id?: number;
  source_run_id?: string;
  evidence?: JsonObject;
}

export interface AgenticSourceEvent {
  session_id: string;
  event_id?: number;
  run_id?: string;
  type: string;
  summary: string;
}

export interface AgenticSkillProposalDraft {
  edits: AgenticSkillEditDraft[];
  rejected_signals?: AgenticRejectedSignal[];
}

export interface AgenticSkillEditDraft {
  target: OptSkillTargetKind;
  op: "add" | "replace" | "delete";
  section: string;
  anchor?: string;
  content: string;
  rationale: string;
  expected_behavior_change: string;
  eval_plan: string;
  source_event_ids: number[];
  source_signal_ids: string[];
}

export interface AgenticRejectedSignal {
  source_signal_id: string;
  reason: string;
}

export interface AgenticProposalOptimizer {
  propose(packet: AgenticEvidencePacket): Promise<AgenticProposalOptimizerResult>;
}

export type AgenticProposalOptimizerResult = AgenticSkillProposalDraft | AgenticProposalOptimizerOutput;

export interface AgenticProposalOptimizerOutput {
  draft: AgenticSkillProposalDraft;
  run?: AgenticOptimizerRun;
}

export interface AgenticOptimizerRun {
  session_id: string;
  run_id: string;
  title?: string;
  request_class: "background";
}

export interface AgenticOptimizerRuntime {
  run(options: {
    prompt: string;
    title?: string;
    request_class?: "background";
    visibility?: "normal" | "internal";
    signal?: AbortSignal;
    max_tool_rounds?: number;
    tool_names?: string[];
  }): Promise<{
    session: { session_id: string; title?: string };
    run_id: string;
    content: string;
  }>;
}

export interface ValidatedAgenticProposal {
  proposal: AgenticSkillProposalDraft;
  edits: OptLearningEdit[];
  targets: OptSkillTarget[];
}

export class AgenticNoEditsError extends Error {
  constructor(readonly draft: AgenticSkillProposalDraft) {
    super(
      Array.isArray(draft.rejected_signals) && draft.rejected_signals.length
        ? "Agentic optimizer rejected all evidence and proposed no skill edits."
        : "Agentic optimizer proposed no skill edits.",
    );
    this.name = "AgenticNoEditsError";
  }
}

const VALID_TARGETS = new Set<OptSkillTargetKind>(["loop_skill", "workspace_skill"]);
const VALID_OPS = new Set(["add", "replace", "delete"]);
const MAX_EDIT_CONTENT_LENGTH = 1200;
export const SELF_IMPROVE_OPTIMIZER_TOOL_NAMES = [
  "ast_grep",
  "codegraph_callers",
  "codegraph_callees",
  "codegraph_explore",
  "codegraph_files",
  "codegraph_impact",
  "codegraph_node",
  "codegraph_search",
  "codegraph_status",
  "file_search",
  "git_diff",
  "git_show",
  "git_status",
  "glob",
  "list_dir",
  "lsp",
  "read_file",
  "read_resource",
  "skill_list",
  "skill_read",
] as const;
const SELF_IMPROVE_OPTIMIZER_MAX_TOOL_ROUNDS = 8;

export function buildAgenticEvidencePacket(store: SessionStore, workspace: WorkspaceIdentity): AgenticEvidencePacket {
  recordGoalLearningSignals(store, workspace);
  const sessions: AgenticEvidenceSession[] = [];
  const signals: AgenticEvidenceSignal[] = [];
  const sourceEvents: AgenticSourceEvent[] = [];
  for (const session of store.listSessions(workspace.id, { includeArchived: true })) {
    const view = readGoalLoopView(store, session.session_id);
    if (!view.goal) {
      continue;
    }
    const events = store.listEvents(session.session_id);
    sessions.push({
      session_id: session.session_id,
      goal_id: view.goal.id,
      objective: view.goal.objective,
      verification_count: view.verifications.length,
    });
    for (const signal of view.learning_signals) {
      signals.push(signalToEvidence(signal, view.verifications));
    }
    for (const event of events) {
      if (event.type === "goal.review.resolved" || event.type === "goal.verification.recorded") {
        sourceEvents.push({
          session_id: session.session_id,
          event_id: event.id,
          run_id: event.run_id,
          type: event.type,
          summary: eventSummary(event.data),
        });
      }
    }
  }
  return {
    workspace: {
      id: workspace.id,
      root: workspace.root,
      alias: workspace.alias,
    },
    sessions,
    signals: dedupeBy(signals, (signal) => signal.signal_id).slice(0, 80),
    source_events: sourceEvents.slice(0, 80),
  };
}

export function validateAgenticProposal(
  draft: AgenticSkillProposalDraft,
  packet: AgenticEvidencePacket,
): AgenticSkillProposalDraft {
  if (!Array.isArray(draft.edits) || draft.edits.length === 0) {
    throw new AgenticNoEditsError(draft);
  }
  const signalIds = new Set(packet.signals.map((signal) => signal.signal_id));
  const eventIds = new Set(packet.source_events.map((event) => event.event_id).filter((id): id is number => id !== undefined));
  const normalized: AgenticSkillEditDraft[] = draft.edits.map((edit, index) => {
    if (!VALID_TARGETS.has(edit.target)) {
      throw new Error(`Agentic edit ${index} has unsupported target: ${String(edit.target)}.`);
    }
    if (!VALID_OPS.has(edit.op)) {
      throw new Error(`Agentic edit ${index} has unsupported op: ${String(edit.op)}.`);
    }
    for (const key of ["section", "content", "rationale", "expected_behavior_change", "eval_plan"] as const) {
      if (!edit[key]?.trim()) {
        throw new Error(`Agentic edit ${index} is missing ${key}.`);
      }
    }
    if (edit.content.length > MAX_EDIT_CONTENT_LENGTH) {
      throw new Error(`Agentic edit ${index} is too large.`);
    }
    const citedSignals = [...new Set(edit.source_signal_ids ?? [])];
    const citedEvents = [...new Set(edit.source_event_ids ?? [])];
    if (!citedSignals.length && !citedEvents.length) {
      throw new Error(`Agentic edit ${index} has no citation; it must cite at least one source signal or event.`);
    }
    for (const signalId of citedSignals) {
      if (!signalIds.has(signalId)) {
        throw new Error(`Agentic edit ${index} cites unknown signal: ${signalId}.`);
      }
    }
    for (const eventId of citedEvents) {
      if (!eventIds.has(eventId)) {
        throw new Error(`Agentic edit ${index} cites unknown event: ${eventId}.`);
      }
    }
    if ((edit.op === "replace" || edit.op === "delete") && !edit.anchor?.trim()) {
      throw new Error(`Agentic edit ${index} with op ${edit.op} must include an anchor.`);
    }
    if (edit.anchor && edit.anchor.length > 500) {
      throw new Error(`Agentic edit ${index} anchor is too large.`);
    }
    if (looksLikeWholeTemplateRewrite(edit.content)) {
      throw new Error(`Agentic edit ${index} looks like a whole-skill template rewrite.`);
    }
    return {
      ...edit,
      source_signal_ids: citedSignals,
      source_event_ids: citedEvents,
    };
  });
  return {
    edits: normalized,
    rejected_signals: Array.isArray(draft.rejected_signals) ? draft.rejected_signals : [],
  };
}

export function renderAgenticSkillTargets(
  packet: AgenticEvidencePacket,
  draft: AgenticSkillProposalDraft,
  existingBodies: Partial<Record<OptSkillTargetKind, string>> = {},
): ValidatedAgenticProposal {
  const proposal = validateAgenticProposal(draft, packet);
  const edits = proposal.edits.map((edit, index): OptLearningEdit => ({
    target: edit.target,
    op: edit.op,
    section: edit.section,
    content: edit.content,
    rationale: [
      edit.rationale,
      `Expected behavior change: ${edit.expected_behavior_change}`,
      `Eval plan: ${edit.eval_plan}`,
    ].join("\n"),
    source_event_indexes: editSourceIndexes(packet, edit, index),
  }));
  return {
    proposal,
    edits,
    targets: (["loop_skill", "workspace_skill"] as const)
      .filter((target) => proposal.edits.some((edit) => edit.target === target))
      .map((target) =>
        target === "loop_skill"
          ? renderAgenticTarget("loop_skill", "inferoa-loop-skill", "Inferoa Loop Skill", proposal, existingBodies.loop_skill)
          : renderAgenticTarget("workspace_skill", "inferoa-workspace-skill", "Inferoa Workspace Skill", proposal, existingBodies.workspace_skill)
      ),
  };
}

export function modelGatewayAgenticOptimizer(config: VllmAgentConfig): AgenticProposalOptimizer | undefined {
  if (!config.model_setup.base_url || !config.model_setup.model) {
    return undefined;
  }
  const gateway = new ModelGateway(config);
  return {
    async propose(packet: AgenticEvidencePacket): Promise<AgenticSkillProposalDraft> {
      const response = await gateway.stream(modelRequest(config, packet));
      return parseAgenticProposalJson(response.content);
    },
  };
}

export function runtimeAgenticOptimizer(config: VllmAgentConfig, runtime: AgenticOptimizerRuntime, options: { signal?: AbortSignal } = {}): AgenticProposalOptimizer | undefined {
  if (!config.model_setup.base_url || !config.model_setup.model) {
    return undefined;
  }
  return {
    async propose(packet: AgenticEvidencePacket): Promise<AgenticProposalOptimizerOutput> {
      const run = await runtime.run({
        title: "self-improve optimizer",
        request_class: "background",
        visibility: "internal",
        signal: options.signal,
        max_tool_rounds: SELF_IMPROVE_OPTIMIZER_MAX_TOOL_ROUNDS,
        tool_names: [...SELF_IMPROVE_OPTIMIZER_TOOL_NAMES],
        prompt: runtimeOptimizerPrompt(packet),
      });
      return {
        draft: parseAgenticProposalJson(run.content),
        run: {
          session_id: run.session.session_id,
          run_id: run.run_id,
          title: run.session.title,
          request_class: "background",
        },
      };
    },
  };
}

export function parseAgenticProposalJson(text: string): AgenticSkillProposalDraft {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  if (!candidate) {
    throw new Error("Model did not return a JSON proposal.");
  }
  const parsed = JSON.parse(candidate) as AgenticSkillProposalDraft;
  return parsed;
}

function runtimeOptimizerPrompt(packet: AgenticEvidencePacket): string {
  return [
    "You are the Inferoa self-improve optimizer.",
    "This is a proposal-only learning session, not a coding task.",
    "Never modify workspace files, run shell commands, enable or disable skills, spawn subagents, update goals, or write notes.",
    "Use only the read-only tools exposed in this session when extra context is necessary.",
    "Return only JSON with an edits array and optional rejected_signals array.",
    "Write bounded edits, not whole skill templates.",
    "Every edit must cite source_signal_ids or source_event_ids from the evidence packet.",
    "Do not accept soft-only evidence as validation.",
    "If the evidence is insufficient, return {\"edits\":[],\"rejected_signals\":[...]} instead of attempting implementation.",
    "",
    JSON.stringify(packet, null, 2),
  ].join("\n");
}

function modelRequest(config: VllmAgentConfig, packet: AgenticEvidencePacket): ModelRequest {
  return {
    session_id: "self_improve_agentic",
    run_id: "run_self_improve_agentic",
    mode: config.model_setup.mode,
    provider_id: providerId(config),
    model: config.model_setup.model ?? "",
    request_class: "background",
    tools: [],
    temperature: 0,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: [
          "You are the Inferoa self-improve optimizer.",
          "Return only JSON matching { edits: [...], rejected_signals: [...] }.",
          "Write bounded edits, not whole skill templates.",
          "Every edit must cite source_signal_ids or source_event_ids from the packet.",
          "Do not accept soft-only evidence as validation.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(packet, null, 2),
      },
    ],
  };
}

function signalToEvidence(signal: GoalLoopLearningSignal, verifications: GoalLoopVerification[]): AgenticEvidenceSignal {
  const matchingVerification = verifications.find((verification) =>
    verification.run_id === signal.source_run_id || verification.source_run_id === signal.source_run_id
  );
  return {
    signal_id: signal.signal_id,
    tier: signalTier(signal, matchingVerification),
    target_hints: signalTargetHints(signal, matchingVerification),
    failure_mode: signalFailureMode(signal, matchingVerification),
    summary: signal.summary,
    source_event_id: signal.source_event_id,
    source_run_id: signal.source_run_id,
    evidence: signal.evidence,
  };
}

function signalTier(signal: GoalLoopLearningSignal, verification: GoalLoopVerification | undefined): LoopLearningSignalTier {
  if (signal.category === "human_feedback") {
    return "T0";
  }
  if (!verification || verification.provider === "reflection") {
    return "T2";
  }
  if (verification.provider === "research") {
    return "T0";
  }
  if (verification.provider === "command" || verification.provider === "checker" || verification.provider === "connector") {
    return "T1";
  }
  return verification.confidence === "hard" ? "T1" : "T2";
}

function signalTargetHints(signal: GoalLoopLearningSignal, verification: GoalLoopVerification | undefined): OptSkillTargetKind[] {
  const text = `${signal.summary} ${JSON.stringify(signal.evidence ?? {})}`.toLowerCase();
  const hints = new Set<OptSkillTargetKind>();
  if (verification?.provider === "command" || /\bnpm\b|\btest\b|\bdocs\b|\brelease\b|\brepo\b|\bworkspace\b/.test(text)) {
    hints.add("workspace_skill");
  }
  if (signal.category === "human_feedback" || /completion|done|blocked|partial|reflect|verify/.test(text)) {
    hints.add("loop_skill");
  }
  if (!hints.size) {
    hints.add("loop_skill");
  }
  return [...hints];
}

function signalFailureMode(signal: GoalLoopLearningSignal, verification: GoalLoopVerification | undefined): string {
  if (signal.category === "human_feedback") {
    return "human_feedback_constraint";
  }
  if (!verification || verification.provider === "reflection") {
    return "soft_or_reflection_only_evidence";
  }
  if (verification.verdict === "fail" || verification.verdict === "blocked" || verification.verdict === "partial") {
    return "non_pass_verifier";
  }
  if (verification.provider === "command") {
    return "workspace_command_verifier";
  }
  return "verified_behavior";
}

function renderAgenticTarget(
  target: OptSkillTargetKind,
  skillId: string,
  skillName: string,
  proposal: AgenticSkillProposalDraft,
  existingBody?: string,
): OptSkillTarget {
  const edits = proposal.edits.filter((edit) => edit.target === target);
  return {
    target,
    skill_id: skillId,
    skill_name: skillName,
    staged_skill_path: "",
    edit_count: edits.length,
    edits: edits.map((edit, index): OptLearningEdit => ({
      target,
      op: edit.op,
      section: edit.section,
      content: edit.content,
      rationale: edit.rationale,
      source_event_indexes: [index],
    })),
    body: renderAgenticSkillBody(skillName, target, edits, existingBody),
  };
}

function renderAgenticSkillBody(
  skillName: string,
  target: OptSkillTargetKind,
  edits: AgenticSkillEditDraft[],
  existingBody?: string,
): string {
  if (!edits.length) {
    return existingBody?.trimEnd() ?? renderEmptyAgenticSkillBody(skillName, target);
  }
  let body = existingBody?.trimEnd() ?? renderEmptyAgenticSkillBody(skillName, target);
  for (const edit of edits) {
    body = applyAgenticEdit(body, edit, Boolean(existingBody?.trim()));
  }
  return `${body.trimEnd()}\n\n${renderPatchNotes(edits)}`;
}

function renderEmptyAgenticSkillBody(skillName: string, target: OptSkillTargetKind): string {
  const title = target === "loop_skill" ? "Inferoa Loop Skill" : "Inferoa Workspace Skill";
  return [
    "---",
    `name: ${skillName}`,
    `description: Model-authored ${target === "loop_skill" ? "loop-control" : "workspace workflow"} policy learned from verified Inferoa evidence.`,
    "---",
    "",
    `# ${title}`,
    "",
    "Proposal source: model-authored self-improve optimizer.",
  ].join("\n");
}

function applyAgenticEdit(body: string, edit: AgenticSkillEditDraft, hadExistingBody: boolean): string {
  if (edit.op === "add") {
    return applyAddEdit(body, edit);
  }
  if (!hadExistingBody) {
    throw new Error(`Agentic ${edit.op} edit for ${edit.target}/${edit.section} requires an existing skill body.`);
  }
  if (!edit.anchor?.trim()) {
    throw new Error(`Agentic ${edit.op} edit for ${edit.target}/${edit.section} is missing an anchor.`);
  }
  if (!body.includes(edit.anchor)) {
    throw new Error(`Agentic ${edit.op} edit anchor not found in ${edit.target}/${edit.section}: ${edit.anchor}`);
  }
  if (edit.op === "replace") {
    return body.replace(edit.anchor, formatSkillInstruction(edit.content));
  }
  return collapseBlankLines(body.replace(edit.anchor, ""));
}

function applyAddEdit(body: string, edit: AgenticSkillEditDraft): string {
  const lines = body.split("\n");
  const heading = findMarkdownHeading(lines, edit.section);
  const instruction = formatSkillInstruction(edit.content);
  if (!heading) {
    return `${body.trimEnd()}\n\n## ${normalizeSectionTitle(edit.section)}\n\n${instruction}`;
  }
  const insertAt = findNextHeadingAtOrAbove(lines, heading.index + 1, heading.level) ?? lines.length;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const needsLeadingBlank = before.length > 0 && before.at(-1)?.trim() !== "";
  const insert = [
    ...(needsLeadingBlank ? [""] : []),
    instruction,
    "",
  ];
  return [...before, ...insert, ...after].join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd();
}

function renderPatchNotes(edits: AgenticSkillEditDraft[]): string {
  return [
    "## Self-Improve Patch Notes",
    "",
    ...edits.flatMap((edit) => [
      `- ${edit.op} ${edit.section}`,
      `  - Rationale: ${edit.rationale}`,
      `  - Expected behavior change: ${edit.expected_behavior_change}`,
      `  - Eval plan: ${edit.eval_plan}`,
      `  - Citations: signals ${edit.source_signal_ids.join(", ") || "none"}; events ${edit.source_event_ids.join(", ") || "none"}`,
    ]),
    "",
  ].join("\n");
}

function formatSkillInstruction(content: string): string {
  const trimmed = content.trim();
  if (/^(?:[-*] |\d+\. |#{1,6} |\||```)/.test(trimmed)) {
    return trimmed;
  }
  return `- ${trimmed}`;
}

function findMarkdownHeading(lines: string[], section: string): { index: number; level: number } | undefined {
  const wanted = normalizeHeadingText(section);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (match && normalizeHeadingText(match[2] ?? "") === wanted) {
      return { index, level: match[1]!.length };
    }
  }
  return undefined;
}

function findNextHeadingAtOrAbove(lines: string[], start: number, level: number): number | undefined {
  for (let index = start; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+/.exec(lines[index] ?? "");
    if (match && match[1]!.length <= level) {
      return index;
    }
  }
  return undefined;
}

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/#+$/, "").trim().toLowerCase();
}

function normalizeSectionTitle(section: string): string {
  const trimmed = section.trim().replace(/^#+\s*/, "");
  if (!trimmed) {
    return "Learned Rules";
  }
  return trimmed
    .split(/\s+/)
    .map((word) => word ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word)
    .join(" ");
}

function collapseBlankLines(text: string): string {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function editSourceIndexes(packet: AgenticEvidencePacket, edit: AgenticSkillEditDraft, fallback: number): number[] {
  const indexes = packet.source_events
    .map((event, index) => event.event_id !== undefined && edit.source_event_ids.includes(event.event_id) ? index : undefined)
    .filter((index): index is number => index !== undefined);
  return indexes.length ? indexes : [fallback];
}

function eventSummary(data: JsonObject): string {
  return Object.entries(data)
    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" · ");
}

function looksLikeWholeTemplateRewrite(content: string): boolean {
  return /^---\s*\n/.test(content) || /# Inferoa (Loop|Workspace) Skill/.test(content) || content.length > MAX_EDIT_CONTENT_LENGTH;
}

function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}
