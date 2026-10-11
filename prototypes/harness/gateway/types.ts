import type { GatewayConfig as ServerGatewayConfig, ModelEvent as ServerModelEvent } from "../../../server/gateway/types.ts";

export type Job = "write-section" | "librarian";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface PromptMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface Prompt {
  system: string;
  tools?: ToolDefinition[];
  messages: PromptMessage[];
}

export type ModelEvent = ServerModelEvent | { type: "tool-use"; id: string; name: string; input: unknown };

export interface ModelRequest {
  model: string;
  maxTokens: number;
  prompt: Prompt;
  signal: AbortSignal;
}

export interface ModelClient {
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}

export interface GatewayConfig extends Omit<ServerGatewayConfig, "jobs"> {
  jobs: Record<Job, { model: string; maxTokens: number }>;
}
