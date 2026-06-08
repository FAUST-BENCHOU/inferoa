import path from "node:path";
import type { ToolDefinition, VllmAgentConfig, WorkspaceIdentity } from "../types.js";

export interface PermissionDecision {
  status: "allow" | "ask" | "deny";
  reason: string;
}

const destructivePatterns = [
  /\brm\s+-rf\s+(\/|\*|~)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\s+/,
  /\bgit\s+clean\s+-[^\s]*f/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
];

export class PermissionPolicy {
  constructor(
    private readonly config: VllmAgentConfig,
    private readonly workspace: WorkspaceIdentity,
  ) {}

  decide(tool: ToolDefinition, args: Record<string, unknown>): PermissionDecision {
    if (tool.name === "run_command" && typeof args.command === "string" && isDestructiveCommand(args.command)) {
      return {
        status: this.config.permissions.mode === "full_access" ? "ask" : "deny",
        reason: "destructive shell command requires explicit approval",
      };
    }
    if ((tool.permission === "write" || tool.permission === "external_path") && pathEscapesWorkspace(args.path, this.workspace.root)) {
      return {
        status: this.config.permissions.mode === "full_access" ? "ask" : "deny",
        reason: "path is outside workspace",
      };
    }
    switch (this.config.permissions.mode) {
      case "full_access":
        return { status: "allow", reason: "full_access" };
      case "auto_approve":
        if (tool.permission === "destructive" || tool.permission === "external_path") {
          return { status: "ask", reason: "auto_approve requires approval for risky operations" };
        }
        return { status: "allow", reason: "auto_approve" };
      case "ask":
        if (tool.permission === "read") {
          return { status: "allow", reason: "read allowed" };
        }
        return { status: "ask", reason: "ask mode" };
      case "custom":
        return customDecision(this.config.permissions.custom, tool);
      default:
        return { status: "deny", reason: "unknown permission mode" };
    }
  }
}

function customDecision(custom: unknown, tool: ToolDefinition): PermissionDecision {
  if (!custom || typeof custom !== "object") {
    return { status: "ask", reason: "custom policy missing rules" };
  }
  const record = custom as Record<string, unknown>;
  const tools = record.tools as Record<string, unknown> | undefined;
  const value = tools?.[tool.name] ?? tools?.[tool.permission];
  if (value === "allow" || value === "ask" || value === "deny") {
    return { status: value, reason: "custom policy" };
  }
  return { status: "ask", reason: "custom policy default" };
}

function isDestructiveCommand(command: string): boolean {
  return destructivePatterns.some((pattern) => pattern.test(command));
}

function pathEscapesWorkspace(value: unknown, workspaceRoot: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  // Resolve relative paths to detect path traversal (e.g. ../../etc/passwd)
  const resolved = path.resolve(workspaceRoot, value);
  const relative = path.relative(workspaceRoot, resolved);
  return relative.startsWith("..") || path.isAbsolute(relative);
}
