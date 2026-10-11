import { fileURLToPath } from "node:url";
import type { GatewayConfig } from "./gateway/types.ts";

export const API_PORT = 8787;

export type WriterName = "fake";

export interface ServerConfig {
  port: number;
  dataDir: string;
  writer: WriterName;
  maxConcurrentRuns: number;
}

export const config: ServerConfig & GatewayConfig = {
  port: API_PORT,
  dataDir: fileURLToPath(new URL("../.data", import.meta.url)),
  writer: writerFromEnv(process.env.RTFM_WRITER),
  maxConcurrentRuns: 3,
  caps: { dailyUsd: 2, monthlyUsd: 20 },
  maxConcurrentCalls: 3,
  idleTimeoutMs: 30_000,
  jobs: {
    "write-section": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 2048 },
  },
};

function writerFromEnv(value: string | undefined): WriterName {
  if (value === undefined || value === "fake") return "fake";
  throw new Error(`RTFM_WRITER must be "fake", not "${value}"`);
}
