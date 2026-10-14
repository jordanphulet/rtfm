import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOOPBACK_HOSTS, LOOPBACK_ORIGINS, type AdapterConfig } from "./api/node-adapter.ts";
import { passcodeDigest } from "./api/passcode.ts";
import type { AwsAccess } from "./gateway/credentials.ts";
import type { GatewayConfig } from "./gateway/types.ts";
import { API_PORT } from "./ports.ts";
import type { DynamoDbTable, ExecutionRoleCredentials } from "./storage/dynamodb-manual-store.ts";

export type ModelSource = "fake" | "bedrock";

/** Where the manuals are kept: files in the data folder, or a DynamoDB table shaped as `rtfm-app`. */
export type ManualStorage = { kind: "files" } | { kind: "dynamodb"; table: DynamoDbTable };

/**
 * A DynamoDB table by name. Without an `endpoint` (DynamoDB Local's, in tests), it is DynamoDB's
 * own in the region of whatever reaches it.
 */
export interface TableLocation {
  name: string;
  endpoint: string | undefined;
}

/** The Web Function's execution role, in its region. */
export interface ExecutionRoleAccess {
  region: string;
  credentials: ExecutionRoleCredentials;
}

/**
 * How the Bedrock models reach AWS, Bedrock and the table `rtfm-usage` alike: with `rtfm-local`'s
 * keys from `.env.local`, read only once the Bedrock models are built; or as the Web Function's
 * execution role, telling `onKeysRefused` which service refused its keys.
 */
export type ModelAccess =
  | { kind: "env-local" }
  | {
      kind: "execution-role";
      access: ExecutionRoleAccess;
      /** Bedrock's endpoint in the region unless given: a stand-in's, in tests. */
      bedrockEndpoint: string | undefined;
      onKeysRefused: (service: string, error: Error) => void;
    };

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
  usageTable: TableLocation;
  /** Used only with Bedrock. */
  modelAccess: ModelAccess;
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
  modelAccess: { kind: "env-local" },
  passcode: fixedPasscode(process.env.RTFM_PASSCODE),
  allowedHosts: LOOPBACK_HOSTS,
  allowedOrigins: LOOPBACK_ORIGINS,
  appDir: undefined,
  eventStreamHeartbeatMs: 15_000,
  maxConcurrentRuns: MAX_CONCURRENT_RUNS,
  sectionWordsRequested: 650,
  sectionExpectedCharacters: 4800,
  caps: { dailyUsd: 2, monthlyUsd: 20, libraryDailyUsd: 0.5 },
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

/** A table reached with the given access, in its region. */
export function tableWith({ name, endpoint }: TableLocation, { region, credentials }: AwsAccess): DynamoDbTable {
  return { name, region, endpoint: endpoint ?? `https://dynamodb.${region}.amazonaws.com`, credentials };
}

/** How the Web Function reaches AWS (`webFunctionAwsFromEnv`). */
export interface WebFunctionAws {
  access: ExecutionRoleAccess;
  /** The manuals' table, `rtfm-app`. */
  appTable: TableLocation;
  /** Bedrock's spending ledger, `rtfm-usage`. */
  usageTable: TableLocation;
  bedrockEndpoint: string | undefined;
}

/**
 * How the Web Function reaches AWS, from the environment Lambda and `RtfmApp` give it: as the
 * execution role (`executionRoleCredentialsFromEnv`) in `AWS_REGION`, the tables `RTFM_APP_TABLE`
 * and `RTFM_USAGE_TABLE` name. Only `web-function.ts` calls this; on this machine the server reads
 * AWS keys from `.env.local` alone. `RTFM_DYNAMODB_ENDPOINT` and `RTFM_BEDROCK_ENDPOINT` point it
 * at DynamoDB Local and a stand-in for Bedrock, for its test.
 */
export function webFunctionAwsFromEnv(): WebFunctionAws {
  const appTable = process.env.RTFM_APP_TABLE;
  const usageTable = process.env.RTFM_USAGE_TABLE;
  const region = process.env.AWS_REGION;
  if (!appTable) throw new Error("The Web Function needs RTFM_APP_TABLE, which RtfmApp sets");
  if (!usageTable) throw new Error("The Web Function needs RTFM_USAGE_TABLE, which RtfmApp sets");
  if (!region) throw new Error("The Web Function needs AWS_REGION, which Lambda sets");
  const endpoint = process.env.RTFM_DYNAMODB_ENDPOINT || undefined;
  return {
    access: { region, credentials: executionRoleCredentialsFromEnv() },
    appTable: { name: appTable, endpoint },
    usageTable: { name: usageTable, endpoint },
    bedrockEndpoint: process.env.RTFM_BEDROCK_ENDPOINT || undefined,
  };
}

/**
 * Where the execution role's temporary credentials come from, by the names Lambda sets: its
 * container credentials endpoint (`AWS_CONTAINER_CREDENTIALS_FULL_URI`, with
 * `AWS_CONTAINER_AUTHORIZATION_TOKEN`) when it gives one, or else `AWS_ACCESS_KEY_ID`,
 * `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`, which expire at `AWS_CREDENTIAL_EXPIRATION` when
 * Lambda sets it. It reads no key itself: the DynamoDB store reads the chosen source each time its
 * credentials need refreshing, and the Bedrock client at each call.
 */
function executionRoleCredentialsFromEnv(): ExecutionRoleCredentials {
  const fullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  if (fullUri) {
    return { kind: "container-endpoint", fullUri, authorizationToken: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN };
  }
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SESSION_TOKEN) {
    return { kind: "environment", expiresAt: expiryFromEnv(process.env.AWS_CREDENTIAL_EXPIRATION) };
  }
  throw new Error(
    "The Web Function needs its execution role's credentials: AWS_CONTAINER_CREDENTIALS_FULL_URI, " +
      "or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN, which Lambda sets",
  );
}

/** An ISO 8601 date and time with its offset, as `2026-10-13T21:30:00Z`. */
const ISO_8601_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function expiryFromEnv(value = ""): Date | undefined {
  if (value === "") return undefined;
  const expiresAt = new Date(value);
  if (ISO_8601_TIME.test(value) && !Number.isNaN(expiresAt.getTime())) return expiresAt;
  throw new Error(`AWS_CREDENTIAL_EXPIRATION must be an ISO 8601 time, not "${value}"`);
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
