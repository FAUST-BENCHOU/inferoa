import type { PlanRecord } from "../plans/state.js";
import { bgLine, fg256, truncateToWidth, visibleWidth } from "./ansi.js";
import { renderMarkdown } from "./markdown.js";

export interface PlanDocumentSurfaceOptions {
  width: number;
  maxBodyLines?: number;
  includeHeader?: boolean;
}

export function renderPlanDocumentSurface(plan: PlanRecord, options: PlanDocumentSurfaceOptions): string[] {
  const width = Math.max(36, options.width);
  const contentWidth = Math.max(16, width - 4);
  const rows = planBodyRows(plan, contentWidth, options.maxBodyLines ?? 18);
  const lines = [
    ...(options.includeHeader === false ? [] : [headerLine(plan, contentWidth), ""]),
    ...rows,
  ];
  return lines.map((line) => bgLine(236, `  ${line}`, width));
}

function headerLine(plan: PlanRecord, width: number): string {
  const detail = plan.summary ? fg256(244, ` · ${truncateToWidth(plan.summary, Math.max(12, Math.floor(width * 0.55)))}`) : "";
  return `${fg256(75, "▌")} ${fg256(252, planTitle(plan))}${detail}`;
}

export function planTitle(plan: PlanRecord): string {
  switch (plan.status) {
    case "approved":
      return "Approved Plan";
    case "paused":
      return "Plan paused";
    case "dropped":
      return "Plan dropped";
    default:
      return plan.body?.trim() ? "Proposed Plan" : "Plan draft";
  }
}

function planBodyRows(plan: PlanRecord, width: number, maxLines: number): string[] {
  const body = plan.body?.trim();
  if (!body) {
    return [
      `${fg256(39, "objective")} ${fg256(252, truncateToWidth(plan.objective, Math.max(12, width - 10)))}`,
      fg256(244, "Waiting for context, questions, and a written plan."),
    ];
  }
  const rendered = renderMarkdown(body, { width }).replace(/\n$/, "");
  const lines = rendered.length ? rendered.split("\n") : [""];
  if (lines.length <= maxLines) {
    return lines;
  }
  const remaining = lines.length - maxLines;
  return [...lines.slice(0, maxLines), fg256(244, `... ${remaining} more line${remaining === 1 ? "" : "s"}`)];
}
