import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runServerProcess } from "./app.ts";
import {
  builtAppDirFromEnv,
  config,
  httpEndpointFromEnv,
  tableWith,
  webFunctionAwsFromEnv,
  type ServerConfig,
  type WebFunctionAws,
} from "./config.ts";
import { exitOnceWritten } from "./exit.ts";
import { createLogger, toStandardOutput } from "./logging/logger.ts";
import { environmentReplacement } from "./replacement.ts";

/** Lambda sends the endpoint's own domain as the `Host`, since it routes on it. */
const ENDPOINT_HOSTS = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.lambda-web\.[a-z0-9-]+\.on\.aws$/;
const APP_ORIGIN = /^https:\/\/rtfm\.moonfetus\.com$/;

/**
 * The deployed app on a Lambda Web Function (`server/README.md` › The Web Function): the server
 * with the models `RTFM_MODELS` names, reaching AWS as the execution role, keeping the manuals in
 * the table `RTFM_APP_TABLE` names, Bedrock's spending in the one `RTFM_USAGE_TABLE` names and the
 * rest in a new data folder in this environment's `/tmp`, behind the passcode whose digest the
 * manuals' table holds (never `RTFM_PASSCODE`), answering only the app's own origin, and serving
 * the built app (`dist/`, or the folder `RTFM_APP_DIR` names) beside the API. Each service that
 * refuses the role's keys is told to `onKeysRefused`.
 */
function webFunctionConfig(
  { access, appTable, usageTable, bedrockEndpoint }: WebFunctionAws,
  onKeysRefused: (service: string, error: Error) => void,
): ServerConfig {
  const table = { ...tableWith(appTable, access), onKeysRefused: (error: Error) => onKeysRefused("DynamoDB", error) };
  return {
    ...config,
    ...httpEndpointFromEnv(process.env.AWS_LAMBDA_HTTP_ENDPOINT),
    dataDir: mkdtempSync(path.join(tmpdir(), "rtfm-data-")),
    manualStorage: { kind: "dynamodb", table },
    usageTable,
    modelAccess: { kind: "execution-role", access, bedrockEndpoint, onKeysRefused },
    passcode: { kind: "stored" },
    allowedHosts: ENDPOINT_HOSTS,
    allowedOrigins: APP_ORIGIN,
    appDir: builtAppDirFromEnv(),
  };
}

const logger = createLogger([toStandardOutput]);
const replacement = environmentReplacement(logger);
try {
  const aws = webFunctionAwsFromEnv();
  const server = await runServerProcess(webFunctionConfig(aws, replacement.keysRefused), logger);
  const { credentials } = aws.access;
  const keysExpireAt = credentials.kind === "environment" ? credentials.expiresAt : undefined;
  if (server) replacement.serving(server, keysExpireAt);
} catch (error) {
  logger.error("server.start-failed", "The Web Function couldn't start", {}, error);
  exitOnceWritten(1);
}
