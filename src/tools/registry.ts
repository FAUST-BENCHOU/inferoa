import type { JsonObject, PermissionMode, ToolCall, ToolDefinition, ToolExposure, ToolResult, VllmAgentConfig, WorkspaceIdentity } from "../types.js";
import { CodeIntelligenceHub } from "../code-intelligence/hub.js";
import { SessionStore } from "../session/store.js";
import { fail, ok, truncateText } from "../util/limit.js";
import { PermissionPolicy } from "./permissions.js";
import { configuredAllToolDefinitions, configuredToolDefinitions } from "./schemas.js";
import type { ToolExecutionContext, ToolHandler } from "./context.js";
import {
  applyPatchTool,
  editFile,
  exportResource,
  fileSearch,
  gitTool,
  globPaths,
  listDir,
  readFile,
  readResource,
  todoWrite,
  writeFile,
} from "./workspace-tools.js";
import { readProcess, runCommand, stopProcess, writeProcess } from "./process-tools.js";
import { astEdit, astGrep, lspRenameTool, lspTool } from "./code-intelligence.js";
import { webOpen, webSearch } from "./web-search.js";
import { skillTool } from "./skill-tools.js";
import { goalTool } from "./goal-tools.js";
import { planTool } from "./plan-tools.js";
import { clarifyTool } from "./clarify-tool.js";
import { subagentTool } from "./subagent-tool.js";
import { validateToolArguments } from "./schema-validation.js";
import { initExperiment, logExperiment, runExperiment, updateExperiment } from "./autoresearch-tools.js";
import {
  audioGeneration,
  audioUnderstanding,
  imageEdit,
  imageGeneration,
  speechGeneration,
  speechVoices,
  videoGeneration,
  videoUnderstanding,
  visionUnderstanding,
} from "./omni-tools.js";

const HANDLERS: Record<string, ToolHandler> = {
  apply_patch: applyPatchTool,
  ast_edit: astEdit,
  ast_grep: astGrep,
  audio_generation: audioGeneration,
  audio_understanding: audioUnderstanding,
  clarify: clarifyTool,
  edit_file: editFile,
  export_resource: exportResource,
  file_search: fileSearch,
  git: gitTool,
  glob: globPaths,
  goal: goalTool,
  image_edit: imageEdit,
  image_generation: imageGeneration,
  init_experiment: initExperiment,
  list_dir: listDir,
  log_experiment: logExperiment,
  lsp: lspTool,
  lsp_rename: lspRenameTool,
  plan: planTool,
  read_file: readFile,
  read_process: readProcess,
  read_resource: readResource,
  run_command: runCommand,
  run_experiment: runExperiment,
  skill: skillTool,
  stop_process: stopProcess,
  subagent: subagentTool,
  speech_generation: speechGeneration,
  speech_voices: speechVoices,
  todo_write: todoWrite,
  update_experiment: updateExperiment,
  video_generation: videoGeneration,
  video_understanding: videoUnderstanding,
  vision_understanding: visionUnderstanding,
  web_open: webOpen,
  web_search: webSearch,
  write_file: writeFile,
  write_process: writeProcess,
};

interface RegistryCallContext {
  session_id: string;
  run_id?: string;
  step_id?: string;
  step_index?: number;
  request_class?: ToolExecutionContext["request_class"];
  visibility?: ToolExecutionContext["visibility"];
  control_plane?: boolean;
  clarify?: ToolExecutionContext["clarify"];
  available_tools?: ToolDefinition[];
  permission_mode?: PermissionMode;
}

export class ToolRegistry {
  private readonly policy: PermissionPolicy;

  constructor(
    private readonly config: VllmAgentConfig,
    private readonly workspace: WorkspaceIdentity,
    private readonly store: SessionStore,
    private readonly codeIntelligence: CodeIntelligenceHub = new CodeIntelligenceHub(config, workspace),
  ) {
    this.policy = new PermissionPolicy(config, workspace);
  }

  list(): ToolDefinition[] {
    return [...configuredToolDefinitions(this.config), ...this.codeIntelligence.toolDefinitions()]
      .filter((tool) => toolExposure(tool) === "direct")
      .sort(compareToolsByName);
  }

  private listAll(): ToolDefinition[] {
    return [...configuredAllToolDefinitions(this.config), ...this.codeIntelligence.toolDefinitions()].sort(compareToolsByName);
  }

  async call(call: ToolCall, context: RegistryCallContext): Promise<ToolResult> {
    const definition = (context.available_tools ?? this.listAll()).find((tool) => tool.name === call.name);
    if (!definition) {
      const result = fail("unknown_tool", `Unknown tool: ${call.name}`);
      this.recordCall(context, call);
      this.recordResult(context, call, result);
      return result;
    }
    this.recordCall(context, call);
    if (!context.control_plane) {
      const invalidArguments = validateToolArguments(definition, call.arguments);
      if (invalidArguments) {
        this.recordResult(context, call, invalidArguments);
        return invalidArguments;
      }
    }
    let result: ToolResult;
    if (call.name === "tool_search") {
      result = this.searchCapabilities(call.arguments);
      this.recordResult(context, call, result);
      return result;
    }
    if (call.name === "capability_call") {
      result = await this.callCapability(call, context);
      this.recordResult(context, call, result);
      return result;
    }
    result = await this.executeRegisteredTool(definition, call, context);
    this.recordResult(context, call, result);
    return result;
  }

  private searchCapabilities(args: JsonObject): ToolResult {
    const query = stringField(args.query)?.trim() ?? "";
    if (!query) {
      return fail("invalid_tool_search", "tool_search requires a non-empty query.");
    }
    const exposure = stringField(args.exposure);
    if (exposure !== undefined && exposure !== "deferred" && exposure !== "mode") {
      return fail("invalid_tool_search", "tool_search exposure must be deferred or mode.");
    }
    const limit = clampSearchLimit(args.limit);
    const tokens = toolSearchTokens(query);
    const candidates = this.listAll().filter((tool) => {
      const toolLayer = toolExposure(tool);
      return toolLayer !== "direct" && (!exposure || toolLayer === exposure);
    });
    const results = candidates
      .map((tool) => ({ tool, score: toolSearchScore(tool, query, tokens) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
      .slice(0, limit)
      .map((item) => toolSearchResult(item.tool));
    return ok(`Found ${results.length} tool ${results.length === 1 ? "capability" : "capabilities"}`, {
      query,
      exposure: exposure ?? "any-hidden",
      no_match: results.length === 0,
      hint: results.length === 0 ? toolSearchNoMatchHint(tokens) : undefined,
      tools: results as unknown as JsonObject[],
    });
  }

  private async callCapability(call: ToolCall, context: RegistryCallContext): Promise<ToolResult> {
    const targetName = stringField(call.arguments.name);
    const targetArguments = objectField(call.arguments.arguments);
    if (!targetName) {
      return fail("invalid_capability_call", "capability_call requires a target name.");
    }
    if (!targetArguments) {
      return fail("invalid_capability_call", "capability_call arguments must be an object.");
    }
    if (targetName === "tool_search" || targetName === "capability_call") {
      return fail("invalid_capability_call", `Capability wrapper cannot call ${targetName}.`);
    }
    const target = this.listAll().find((tool) => tool.name === targetName);
    if (!target) {
      return fail("unknown_capability", `Unknown capability: ${targetName}`);
    }
    if (toolExposure(target) === "direct") {
      return fail("capability_direct_tool", `Use direct tool ${targetName} by name instead of capability_call.`);
    }
    if (!context.control_plane) {
      const invalidArguments = validateToolArguments(target, targetArguments);
      if (invalidArguments) {
        return invalidArguments;
      }
    }
    return this.executeRegisteredTool(target, { ...call, name: targetName, arguments: targetArguments }, context, {
      parentToolName: "capability_call",
      wrapperToolCallId: call.id,
      reason: stringField(call.arguments.reason),
    });
  }

  private async executeRegisteredTool(
    definition: ToolDefinition,
    call: ToolCall,
    context: RegistryCallContext,
    parent?: { parentToolName: string; wrapperToolCallId: string; reason?: string },
  ): Promise<ToolResult> {
    const decision = this.policy.decide(definition, call.arguments, { request_class: context.request_class, permission_mode: context.permission_mode });
    if (decision.status !== "allow") {
      this.store.appendEvent({
        session_id: context.session_id,
        run_id: context.run_id,
        type: decision.status === "ask" ? "permission.requested" : "permission.denied",
        data: {
          tool_call_id: call.id,
          tool_name: call.name,
          step_id: context.step_id,
          step_index: context.step_index,
          request_class: context.request_class,
          visibility: context.visibility,
          decision: decision as unknown as JsonObject,
          arguments: call.arguments,
          parent_tool_name: parent?.parentToolName,
          wrapper_tool_call_id: parent?.wrapperToolCallId,
          reason: parent?.reason,
        },
      });
      return fail(
        decision.status === "ask" ? "permission_required" : "permission_denied",
        `Tool ${call.name} blocked: ${decision.reason}`,
      );
    }
    this.store.appendEvent({
      session_id: context.session_id,
      run_id: context.run_id,
      type: "permission.resolved",
      data: {
        tool_call_id: call.id,
        tool_name: call.name,
        step_id: context.step_id,
        step_index: context.step_index,
        request_class: context.request_class,
        visibility: context.visibility,
        decision: decision as unknown as JsonObject,
        arguments: call.arguments,
        parent_tool_name: parent?.parentToolName,
        wrapper_tool_call_id: parent?.wrapperToolCallId,
        reason: parent?.reason,
      },
    });
    const execContext: ToolExecutionContext = {
      config: this.config,
      workspace: this.workspace,
      session_id: context.session_id,
      run_id: context.run_id,
      step_id: context.step_id,
      step_index: context.step_index,
      request_class: context.request_class,
      visibility: context.visibility,
      control_plane: context.control_plane,
      tool_call_id: call.id,
      tool_name: call.name,
      store: this.store,
      clarify: context.clarify,
    };
    let result: ToolResult;
    try {
      if (this.codeIntelligence.handlesTool(call.name)) {
        result = await this.codeIntelligence.callTool(call.name, call.arguments);
      } else {
        const handler = HANDLERS[call.name];
        if (!handler) {
          result = fail("tool_not_implemented", `Tool schema exists but handler is not implemented: ${call.name}`);
        } else {
          result = await handler(call.arguments, execContext);
        }
      }
    } catch (error) {
      result = fail("tool_exception", error instanceof Error ? error.message : String(error));
    }
    const serialized = JSON.stringify(result);
    if (serialized.length > 30_000 && !result.resource_uri) {
      const resource = this.store.putResource(context.session_id, `tool.${call.name}.result`, serialized, {
        tool_name: call.name,
        tool_call_id: call.id,
        parent_tool_name: parent?.parentToolName,
        wrapper_tool_call_id: parent?.wrapperToolCallId,
      });
      const truncated = truncateText(serialized, 12_000);
      result = {
        ok: result.ok,
        summary: result.summary,
        data: { truncated_result: truncated.text },
        resource_uri: resource.uri,
        error: result.error,
      };
    }
    return result;
  }

  private recordCall(
    context: {
      session_id: string;
      run_id?: string;
      step_id?: string;
      step_index?: number;
      request_class?: ToolExecutionContext["request_class"];
      visibility?: ToolExecutionContext["visibility"];
    },
    call: ToolCall,
  ): void {
    this.store.appendEvent({
      session_id: context.session_id,
      run_id: context.run_id,
      type: "tool.call",
      data: {
        tool_call_id: call.id,
        tool_name: call.name,
        step_id: context.step_id,
        step_index: context.step_index,
        request_class: context.request_class,
        visibility: context.visibility,
        arguments: call.arguments,
      },
    });
  }

  private recordResult(
    context: {
      session_id: string;
      run_id?: string;
      step_id?: string;
      step_index?: number;
      request_class?: ToolExecutionContext["request_class"];
      visibility?: ToolExecutionContext["visibility"];
    },
    call: ToolCall,
    result: ToolResult,
  ): void {
    this.store.appendEvent({
      session_id: context.session_id,
      run_id: context.run_id,
      type: "tool.result",
      data: {
        tool_call_id: call.id,
        tool_name: call.name,
        step_id: context.step_id,
        step_index: context.step_index,
        request_class: context.request_class,
        visibility: context.visibility,
        result: result as unknown as JsonObject,
      },
    });
  }
}

function compareToolsByName(left: ToolDefinition, right: ToolDefinition): number {
  return left.name.localeCompare(right.name);
}

function toolExposure(tool: ToolDefinition): ToolExposure {
  return tool.exposure ?? "direct";
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function objectField(value: unknown): JsonObject | undefined {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function clampSearchLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 8;
  }
  return Math.max(1, Math.min(12, Math.trunc(value)));
}

function toolSearchResult(tool: ToolDefinition): JsonObject {
  return {
    name: tool.name,
    exposure: toolExposure(tool),
    permission: tool.permission,
    description: tool.description,
    parameters: tool.parameters,
  };
}

const TOOL_SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "available",
  "builtin",
  "built",
  "by",
  "capabilities",
  "capability",
  "configured",
  "current",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "tool",
  "tools",
  "to",
  "use",
  "using",
  "with",
]);

const SPECIALIZED_CAPABILITY_TOKENS = new Set([
  "audio",
  "browser",
  "computer",
  "connector",
  "figma",
  "image",
  "mcp",
  "omni",
  "plugin",
  "screenshot",
  "speech",
  "video",
  "vision",
]);

function toolSearchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_:-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !TOOL_SEARCH_STOPWORDS.has(token));
}

function toolSearchNoMatchHint(tokens: string[]): string {
  const specialized = tokens.filter((token) => SPECIALIZED_CAPABILITY_TOKENS.has(token));
  if (specialized.length) {
    return `No configured hidden capability matched specialized query token(s): ${specialized.join(", ")}. The capability may be unconfigured, disabled, or not installed in this session.`;
  }
  return "No hidden capability matched this query. Try a concrete tool family such as lsp, ast, web, resource, skill, plan, goal, or omni.";
}

function toolSearchScore(tool: ToolDefinition, query: string, tokens: string[]): number {
  const normalizedQuery = query.toLowerCase();
  if (!tokens.length) {
    return 0;
  }
  const name = tool.name.toLowerCase();
  const description = tool.description.toLowerCase();
  const parameters = schemaPropertyNames(tool.parameters).join(" ").toLowerCase();
  let score = 0;
  if (name === normalizedQuery) score += 200;
  if (name.startsWith(normalizedQuery)) score += 120;
  if (name.includes(normalizedQuery)) score += 80;
  if (description.includes(normalizedQuery)) score += 40;
  if (parameters.includes(normalizedQuery)) score += 20;
  for (const token of tokens) {
    if (name === token) score += 80;
    if (name.includes(token)) score += 40;
    if (description.includes(token)) score += 15;
    if (parameters.includes(token)) score += 8;
  }
  return score;
}

function schemaPropertyNames(schema: JsonObject): string[] {
  const names: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    const object = value as JsonObject;
    if (object.properties && typeof object.properties === "object" && !Array.isArray(object.properties)) {
      for (const [name, property] of Object.entries(object.properties)) {
        names.push(name);
        visit(property);
      }
    }
    if (object.items) {
      visit(object.items);
    }
    if (Array.isArray(object.oneOf)) {
      object.oneOf.forEach(visit);
    }
  };
  visit(schema);
  return names;
}
