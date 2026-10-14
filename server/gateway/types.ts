/** The fake model's id in the gateway, the price table (at $0) and the ledger: never a Bedrock model id. */
export const FAKE_MODEL = "fake-model";

export type Job = "write-section" | "librarian" | "plan-manual";

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: { type: "object"; [keyword: string]: unknown };
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface PromptMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ModelPrompt {
  system: string;
  tools?: ToolDefinition[];
  messages: PromptMessage[];
}

export interface Prompt extends ModelPrompt {
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface ModelRequest {
  /** What the call is for. Bedrock doesn't need it; the fake model answers by it. */
  job: Job;
  model: string;
  maxTokens: number;
  prompt: ModelPrompt;
  signal: AbortSignal;
}

export interface ModelClient {
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}

export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "tool-use"; id: string; name: string; input: unknown }
  | { type: "tool-input"; json: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number }
  | { type: "stop"; reason: string };

export interface GatewayConfig {
  /** UTC. Every library's calls count toward the daily and monthly caps, a recipient library's toward its own daily cap too. */
  caps: { dailyUsd: number; monthlyUsd: number; libraryDailyUsd: number };
  maxConcurrentCalls: number;
  idleTimeoutMs: number;
  /** A job's own `idleTimeoutMs`, if it has one, replaces the shared one for its calls. */
  jobs: Record<Job, { model: string; maxTokens: number; idleTimeoutMs?: number }>;
}

export type SpendingRefusal = "kill-switch" | "daily-cap" | "monthly-cap" | "library-cap";

export class SpendingRefused extends Error {
  reason: SpendingRefusal;

  constructor(reason: SpendingRefusal) {
    super(`Model call refused: ${reason}`);
    this.reason = reason;
  }
}

export class GatewayBusy extends Error {
  constructor(maxConcurrentCalls: number) {
    super(`Model call refused: ${maxConcurrentCalls} calls are already running`);
  }
}

export class ModelStalled extends Error {
  constructor(idleTimeoutMs: number) {
    super(`Model call stopped after ${idleTimeoutMs}ms with no event`);
  }
}

export class ModelStreamIncomplete extends Error {
  constructor() {
    super("Model stream ended without a stop reason");
  }
}

export class ModelNotPriced extends Error {
  constructor(model: string) {
    super(`Model "${model}" is not in the price table`);
  }
}
