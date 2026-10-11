import { fileURLToPath } from "node:url";
import type { GatewayConfig } from "./gateway/types.ts";

export const API_PORT = 8787;

export type WriterName = "fake" | "bedrock";

export interface ServerConfig extends GatewayConfig {
  port: number;
  dataDir: string;
  writer: WriterName;
  maxConcurrentRuns: number;
  sectionTargetCharacters: number;
}

export const config: ServerConfig = {
  port: API_PORT,
  dataDir: fileURLToPath(new URL("../.data", import.meta.url)),
  writer: writerFromEnv(process.env.RTFM_WRITER),
  maxConcurrentRuns: 3,
  sectionTargetCharacters: 3800,
  caps: { dailyUsd: 2, monthlyUsd: 20 },
  maxConcurrentCalls: 3,
  idleTimeoutMs: 30_000,
  jobs: {
    "write-section": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 2048 },
  },
};

function writerFromEnv(value = "fake"): WriterName {
  if (value === "fake" || value === "bedrock") return value;
  throw new Error(`RTFM_WRITER must be "fake" or "bedrock", not "${value}"`);
}
