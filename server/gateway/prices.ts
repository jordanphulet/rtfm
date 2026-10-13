import { FAKE_MODEL } from "./types.ts";

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  toolUseSystemPromptTokens: number;
}

export interface PriceTable {
  checkedOn: string;
  models: Record<string, ModelPrice>;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export const prices: PriceTable = {
  checkedOn: "2026-10-11",
  models: {
    [FAKE_MODEL]: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, toolUseSystemPromptTokens: 0 },
    "global.anthropic.claude-haiku-4-5-20251001-v1:0": {
      input: 1.0,
      output: 5.0,
      cacheWrite: 1.25,
      cacheRead: 0.1,
      toolUseSystemPromptTokens: 588,
    },
    "us.anthropic.claude-haiku-4-5-20251001-v1:0": {
      input: 1.1,
      output: 5.5,
      cacheWrite: 1.375,
      cacheRead: 0.11,
      toolUseSystemPromptTokens: 588,
    },
  },
};

const TOKENS_PER_PRICE_UNIT = 1_000_000;

export function costUsd(price: ModelPrice, tokens: TokenCounts): number {
  const total =
    tokens.inputTokens * price.input +
    tokens.outputTokens * price.output +
    tokens.cacheWriteTokens * price.cacheWrite +
    tokens.cacheReadTokens * price.cacheRead;
  return total / TOKENS_PER_PRICE_UNIT;
}

export function worstCaseCostUsd(price: ModelPrice, inputBound: number, maxTokens: number): number {
  const inputPrice = Math.max(price.input, price.cacheWrite, price.cacheRead);
  return (inputBound * inputPrice + maxTokens * price.output) / TOKENS_PER_PRICE_UNIT;
}
