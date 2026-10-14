import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runServerProcess } from "./app.ts";
import { builtAppDirFromEnv, config, httpEndpointFromEnv, webFunctionTableFromEnv, type ServerConfig } from "./config.ts";
import { exitOnceWritten } from "./exit.ts";
import { createLogger, toStandardOutput } from "./logging/logger.ts";
import { environmentReplacement } from "./replacement.ts";
import type { DynamoDbTable } from "./storage/dynamodb-manual-store.ts";

/** Lambda sends the endpoint's own domain as the `Host`, since it routes on it. */
const ENDPOINT_HOSTS = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.lambda-web\.[a-z0-9-]+\.on\.aws$/;
const APP_ORIGIN = /^https:\/\/rtfm\.moonfetus\.com$/;

/**
 * The deployed app on a Lambda Web Function (`server/README.md` › The Web Function): the server
 * with the fake models, keeping the manuals in the table `RTFM_APP_TABLE` names and the rest in a
 * new data folder in this environment's `/tmp`, behind the passcode whose digest that table holds
 * (never `RTFM_PASSCODE`), answering only the app's own origin, and serving the built app
 * (`dist/`, or the folder `RTFM_APP_DIR` names) beside the API.
 */
function webFunctionConfig(table: DynamoDbTable): ServerConfig {
  if (config.models !== "fake") {
    throw new Error(`The Web Function runs only the fake models, not RTFM_MODELS="${config.models}"`);
  }
  return {
    ...config,
    ...httpEndpointFromEnv(process.env.AWS_LAMBDA_HTTP_ENDPOINT),
    dataDir: mkdtempSync(path.join(tmpdir(), "rtfm-data-")),
    manualStorage: { kind: "dynamodb", table },
    passcode: { kind: "stored" },
    allowedHosts: ENDPOINT_HOSTS,
    allowedOrigins: APP_ORIGIN,
    appDir: builtAppDirFromEnv(),
  };
}

const logger = createLogger([toStandardOutput]);
const replacement = environmentReplacement(logger);
try {
  const onKeysRefused = (error: Error) => replacement.keysRefused("DynamoDB", error);
  const table = { ...webFunctionTableFromEnv(), onKeysRefused };
  const server = await runServerProcess(webFunctionConfig(table), logger);
  const keysExpireAt = table.credentials.kind === "environment" ? table.credentials.expiresAt : undefined;
  if (server) replacement.serving(server, keysExpireAt);
} catch (error) {
  logger.error("server.start-failed", "The Web Function couldn't start", {}, error);
  exitOnceWritten(1);
}
