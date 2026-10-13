import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOOPBACK_HOSTS, LOOPBACK_ORIGINS, type AdapterConfig } from "./api/node-adapter.ts";
import type { GatewayConfig } from "./gateway/types.ts";
import { API_PORT } from "./ports.ts";

export type ModelSource = "fake" | "bedrock";

export interface ServerConfig extends GatewayConfig, AdapterConfig {
  /** The address the server listens on. */
  host: string;
  port: number;
  dataDir: string;
  models: ModelSource;
  maxConcurrentRuns: number;
  sectionWordsRequested: number;
  sectionExpectedCharacters: number;
}

const MAX_CONCURRENT_RUNS = 3;
/** Model calls allowed beside a full set of section runs, so the librarian and the planner always have room. */
const CALLS_BESIDE_RUNS = 2;
/** Model turns a librarian reply may take; normal replies take 2 or 3. */
export const LIBRARIAN_MAX_TURNS = 8;

export const config: ServerConfig = {
  host: "127.0.0.1",
  port: portFromEnv(process.env.RTFM_PORT),
  dataDir: dataDirFromEnv(process.env.RTFM_DATA_DIR),
  models: modelsFromEnv(process.env.RTFM_MODELS),
  passcode: process.env.RTFM_PASSCODE || undefined,
  allowedHosts: LOOPBACK_HOSTS,
  allowedOrigins: LOOPBACK_ORIGINS,
  appDir: undefined,
  eventStreamHeartbeatMs: 15_000,
  maxConcurrentRuns: MAX_CONCURRENT_RUNS,
  sectionWordsRequested: 650,
  sectionExpectedCharacters: 4800,
  caps: { dailyUsd: 2, monthlyUsd: 20 },
  maxConcurrentCalls: MAX_CONCURRENT_RUNS + CALLS_BESIDE_RUNS,
  idleTimeoutMs: 30_000,
  jobs: {
    "write-section": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 2048 },
    librarian: { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 1024 },
    "plan-manual": { model: "global.anthropic.claude-haiku-4-5-20251001-v1:0", maxTokens: 4096, idleTimeoutMs: 60_000 },
  },
};

function modelsFromEnv(value = "fake"): ModelSource {
  if (value === "fake" || value === "bedrock") return value;
  throw new Error(`RTFM_MODELS must be "fake" or "bedrock", not "${value}"`);
}

/** The folder `RTFM_DATA_DIR` names, or else `<repo>/.data`, whatever the working directory. */
function dataDirFromEnv(value = ""): string {
  return value === "" ? fileURLToPath(new URL("../.data", import.meta.url)) : path.resolve(value);
}

function portFromEnv(value = String(API_PORT)): number {
  const port = Number(value);
  if (isPort(value, port)) return port;
  throw new Error(`RTFM_PORT must be a port number from 0 to 65535, not "${value}"`);
}

/** The built app the Web Function serves: the folder `RTFM_APP_DIR` names, or else `<repo>/dist`. */
export function builtAppDirFromEnv(value = process.env.RTFM_APP_DIR ?? ""): string {
  return value === "" ? fileURLToPath(new URL("../dist", import.meta.url)) : path.resolve(value);
}

/** The `host:port` a Web Function listens on, from `AWS_LAMBDA_HTTP_ENDPOINT`, which Lambda sets. */
export function httpEndpointFromEnv(value = ""): { host: string; port: number } {
  const separator = value.lastIndexOf(":");
  const host = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (separator > 0 && isPort(value.slice(separator + 1), port)) return { host, port };
  throw new Error(`AWS_LAMBDA_HTTP_ENDPOINT must be "host:port", not "${value}"`);
}

function isPort(text: string, port: number): boolean {
  return text.trim() !== "" && Number.isInteger(port) && port >= 0 && port <= 65_535;
}
