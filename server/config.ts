import { fileURLToPath } from "node:url";
import type { GatewayConfig } from "./gateway/types.ts";

export const API_PORT = 8787;

export type ModelSource = "fake" | "bedrock";

export interface ServerConfig extends GatewayConfig {
  port: number;
  dataDir: string;
  models: ModelSource;
  maxConcurrentRuns: number;
  sectionWordsRequested: number;
  sectionExpectedCharacters: number;
}

export const config: ServerConfig = {
  port: API_PORT,
  dataDir: fileURLToPath(new URL("../.data", import.meta.url)),
  models: modelsFromEnv(process.env.RTFM_MODELS),
  maxConcurrentRuns: 3,
  sectionWordsRequested: 650,
  sectionExpectedCharacters: 4800,
  caps: { dailyUsd: 2, monthlyUsd: 20 },
  maxConcurrentCalls: 3,
  idleTimeoutMs: 30_000,
  jobs: {
    "write-section": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 2048 },
    librarian: { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 1024 },
  },
};

function modelsFromEnv(value = "fake"): ModelSource {
  if (value === "fake" || value === "bedrock") return value;
  throw new Error(`RTFM_MODELS must be "fake" or "bedrock", not "${value}"`);
}
