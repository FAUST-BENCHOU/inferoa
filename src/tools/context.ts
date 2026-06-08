import type { ClarifyRequest, ClarifyResponse, JsonObject, ToolResult, VllmAgentConfig, WorkspaceIdentity } from "../types.js";
import { SessionStore } from "../session/store.js";

export interface ToolExecutionContext {
  config: VllmAgentConfig;
  workspace: WorkspaceIdentity;
  session_id: string;
  run_id?: string;
  store: SessionStore;
  clarify?: (request: ClarifyRequest) => Promise<ClarifyResponse>;
}

export type ToolHandler = (args: JsonObject, context: ToolExecutionContext) => Promise<ToolResult>;
