export type Job = "write-section";

export interface Prompt {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface ModelRequest {
  model: string;
  maxTokens: number;
  prompt: Prompt;
  signal: AbortSignal;
}

export interface ModelClient {
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}

export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number }
  | { type: "stop"; reason: string };

export interface GatewayConfig {
  caps: { dailyUsd: number; monthlyUsd: number };
  maxConcurrentCalls: number;
  idleTimeoutMs: number;
  jobs: Record<Job, { model: string; maxTokens: number }>;
}

export type SpendingRefusal = "daily-cap" | "monthly-cap" | "kill-switch";

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
