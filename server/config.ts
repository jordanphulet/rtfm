import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOOPBACK_HOSTS, LOOPBACK_ORIGINS, type AdapterConfig } from "./api/node-adapter.ts";
import { passcodeDigest } from "./api/passcode.ts";
import type { AwsCredentials } from "./gateway/credentials.ts";
import type { GatewayConfig } from "./gateway/types.ts";
import { API_PORT } from "./ports.ts";
import type { DynamoDbTable, TableCredentials } from "./storage/dynamodb-manual-store.ts";

export type ModelSource = "fake" | "bedrock";

/** Where the manuals are kept: files in the data folder, or a DynamoDB table shaped as `rtfm-app`. */
export type ManualStorage = { kind: "files" } | { kind: "dynamodb"; table: DynamoDbTable };

/**
 * The table Bedrock's spending is kept in, from this machine too. Without an `endpoint` (DynamoDB
 * Local's, in tests), it is DynamoDB's own in the region `.env.local` names.
 */
export interface UsageTableLocation {
  name: string;
  endpoint: string | undefined;
}

/**
 * Where the passcode's digest comes from: a fixed one (`RTFM_PASSCODE`'s, hashed when the server
 * starts), or the one stored in the manuals' table, as on the Web Function.
 */
export type PasscodeSource = { kind: "digest"; digest: string } | { kind: "stored" };

export interface ServerConfig extends GatewayConfig, AdapterConfig {
  /** The address the server listens on. */
  host: string;
  port: number;
  dataDir: string;
  manualStorage: ManualStorage;
  models: ModelSource;
  /** Undefined means no passcode gate (`server/api/README.md` › The passcode). */
  passcode: PasscodeSource | undefined;
  /** Used only with Bedrock; the fake models' spending stays in the data folder. */
  usageTable: UsageTableLocation;
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
  manualStorage: { kind: "files" },
  models: modelsFromEnv(process.env.RTFM_MODELS),
  usageTable: { name: "rtfm-usage", endpoint: undefined },
  passcode: fixedPasscode(process.env.RTFM_PASSCODE),
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

/** A passcode as the server keeps it, as its digest alone; empty or unset means no gate. */
export function fixedPasscode(passcode = ""): PasscodeSource | undefined {
  return passcode === "" ? undefined : { kind: "digest", digest: passcodeDigest(passcode) };
}

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

/** The usage table, reached with `rtfm-local`'s keys from `.env.local`, in their region. */
export function usageTableWith({ name, endpoint }: UsageTableLocation, credentials: AwsCredentials): DynamoDbTable {
  const { accessKeyId, secretAccessKey, region } = credentials;
  return {
    name,
    region,
    endpoint: endpoint ?? `https://dynamodb.${region}.amazonaws.com`,
    credentials: { kind: "keys", accessKeyId, secretAccessKey },
  };
}

/**
 * The table the Web Function keeps the manuals in: `RTFM_APP_TABLE`, which `RtfmApp` sets, in
 * `AWS_REGION`, reached as the execution role (`executionRoleCredentialsFromEnv`). Only
 * `web-function.ts` calls this; on this machine the server reads AWS keys from `.env.local` alone.
 * `RTFM_DYNAMODB_ENDPOINT` points it at DynamoDB Local, for its test.
 */
export function webFunctionTableFromEnv(): DynamoDbTable {
  const name = process.env.RTFM_APP_TABLE;
  const region = process.env.AWS_REGION;
  if (!name) throw new Error("The Web Function needs RTFM_APP_TABLE, which RtfmApp sets");
  if (!region) throw new Error("The Web Function needs AWS_REGION, which Lambda sets");
  return {
    name,
    region,
    endpoint: process.env.RTFM_DYNAMODB_ENDPOINT || `https://dynamodb.${region}.amazonaws.com`,
    credentials: executionRoleCredentialsFromEnv(),
  };
}

/**
 * Where the execution role's temporary credentials come from, by the names Lambda sets: its
 * container credentials endpoint (`AWS_CONTAINER_CREDENTIALS_FULL_URI`, with
 * `AWS_CONTAINER_AUTHORIZATION_TOKEN`) when it gives one, or else `AWS_ACCESS_KEY_ID`,
 * `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`. It reads no key itself: the DynamoDB store
 * reads the chosen source each time its credentials need refreshing.
 */
function executionRoleCredentialsFromEnv(): TableCredentials {
  const fullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  if (fullUri) {
    return { kind: "container-endpoint", fullUri, authorizationToken: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN };
  }
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SESSION_TOKEN) {
    return { kind: "environment" };
  }
  throw new Error(
    "The Web Function needs its execution role's credentials: AWS_CONTAINER_CREDENTIALS_FULL_URI, " +
      "or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN, which Lambda sets",
  );
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
