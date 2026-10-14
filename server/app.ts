import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fakeModel } from "./agent/fake-model.ts";
import { clientErrorsRoute } from "./api/client-errors.ts";
import { deleteManualRoute } from "./api/delete-manual.ts";
import { librarianRoute } from "./api/librarian.ts";
import { libraryRoute } from "./api/library.ts";
import { manualRoute } from "./api/manual.ts";
import { createRequestHandler } from "./api/node-adapter.ts";
import { passcodeRoute } from "./api/passcode.ts";
import { sectionStreamRoute } from "./api/section-stream.ts";
import { sectionRoute } from "./api/section.ts";
import { usageTableWith, type ManualStorage, type ServerConfig } from "./config.ts";
import { exitOnceWritten } from "./exit.ts";
import { createBedrockClient } from "./gateway/bedrock-client.ts";
import { ENV_LOCAL_FILE, readAwsCredentials } from "./gateway/credentials.ts";
import { createDynamoDbSpendingLedger } from "./gateway/dynamodb-spending-ledger.ts";
import { openFileSpendingLedger } from "./gateway/file-spending-ledger.ts";
import { createGateway, type Gateway, type RunningGateway } from "./gateway/gateway.ts";
import { prices } from "./gateway/prices.ts";
import type { SpendingLedger } from "./gateway/spending-ledger.ts";
import { FAKE_MODEL, type Job, type ModelClient } from "./gateway/types.ts";
import { toLogFile } from "./logging/log-file.ts";
import { createLogger, type LogFields, type Logger } from "./logging/logger.ts";
import { createDynamoDbManualStore, createDynamoDbSectionLeases } from "./storage/dynamodb-manual-store.ts";
import { createFileLedger } from "./storage/file-ledger.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { createInProcessLeases } from "./storage/in-process-leases.ts";
import { DataFolderInUse, lockDataFolder, type DataFolderLock } from "./storage/lock.ts";
import { seedStore } from "./storage/seed.ts";
import type { ManualStore, SectionLeases } from "./storage/types.ts";
import { createBedrockWriter } from "./writer/bedrock.ts";
import { createFakeWriter } from "./writer/fake.ts";
import { createRuns } from "./writer/runs.ts";
import type { SectionWriter } from "./writer/types.ts";

export interface RunningServer {
  port: number;
  /**
   * Stops taking connections, lets the open requests end for up to `graceMs`, then cuts any still
   * open, and resolves once every model call is settled. A later call may cut them sooner.
   */
  close(graceMs?: number): Promise<void>;
}

/** Who writes sections, who answers as the librarian, and when their model calls have all been recorded. */
export interface Models {
  writer: SectionWriter;
  librarian: Gateway;
  /** Resolves once no model call is running and every one is settled in the ledger. */
  idle(): Promise<void>;
}

/** Parts of the server a caller may supply in place of the configured ones. */
export type Replaced = Partial<Models> & { logger?: Logger };

const nothingToSettle = async () => {};

/**
 * Runs the server as this whole process, for `main.ts` and `web-function.ts`: it stops on SIGINT
 * or SIGTERM and exits with 0, or exits with 1 if the server can't start or crashes, each time
 * once standard output has taken every line. It gives back the started server.
 */
export async function runServerProcess(config: ServerConfig, logger: Logger): Promise<RunningServer | undefined> {
  // A closed pipe on standard output (EPIPE) would otherwise be an unhandled error that stops the server.
  process.stdout.on("error", () => {});
  process.on("uncaughtException", (error) => crash(logger, "An uncaught exception stopped the server", error));
  process.on("unhandledRejection", (reason) => crash(logger, "An unhandled rejection stopped the server", reason));
  const started = startServer(config, { logger });
  // Listening first, so a signal that comes while the server starts stops it once it has started.
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => started.then(stop, () => {}));
  try {
    return await started;
  } catch {
    exitOnceWritten(1);
    return undefined;
  }
}

async function stop(server: RunningServer) {
  await server.close();
  exitOnceWritten(0);
}

function crash(logger: Logger, message: string, error: unknown) {
  logger.error("server.crashed", message, {}, error);
  exitOnceWritten(1);
}

/**
 * Starts the server on the configured data folder and port. Without a logger of its own, it logs
 * to the data folder's log file only; `main.ts` and `web-function.ts` log to standard output.
 */
export async function startServer(config: ServerConfig, replaced: Replaced = {}): Promise<RunningServer> {
  const logger = replaced.logger ?? createLogger([toLogFile(config.dataDir)]);
  const lock = await lockOrLogRefusal(config.dataDir, logger);
  let served: { server: Server; models: Models };
  try {
    served = await serve(config, replaced, logger);
  } catch (error) {
    logger.error("server.start-failed", "The API server couldn't start", { dataDir: config.dataDir }, error);
    await lock.release();
    throw error;
  }
  const { server, models } = served;
  const port = (server.address() as AddressInfo).port;
  logger.info("server.started", `API server on http://${config.host}:${port} (${config.models} models)`, {
    host: config.host,
    port,
    models: config.models,
    dataDir: config.dataDir,
    manualStorage: config.manualStorage.kind,
    ...credentialsLogged(config.manualStorage),
    passcodeGate: config.passcode !== undefined,
  });

  const closed = new Promise<void>((resolve) => server.once("close", resolve));
  let stopped: Promise<void> | undefined;
  return {
    port,
    close(graceMs = 0) {
      if (server.listening) {
        // Kept-alive connections would otherwise go on taking requests, and stay open idle for
        // seconds, while the open requests end.
        server.prependListener("request", (_request, response) => response.setHeader("connection", "close"));
        server.keepAliveTimeout = 1;
        server.close();
      }
      const cuttingOff = setTimeout(() => server.closeAllConnections(), graceMs);
      void closed.then(() => clearTimeout(cuttingOff));
      stopped ??= closed.then(async () => {
        await models.idle();
        await lock.release();
        logger.info("server.stopped", "API server stopped", { port });
      });
      return stopped;
    },
  };
}

/** Which credentials reach the table, and when the environment's keys expire: never a key. */
function credentialsLogged(storage: ManualStorage): LogFields {
  if (storage.kind === "files") return {};
  const { credentials } = storage.table;
  if (credentials.kind !== "environment") return { credentials: credentials.kind };
  return { credentials: credentials.kind, credentialsExpireAt: credentials.expiresAt?.toISOString() ?? "unset" };
}

async function lockOrLogRefusal(dataDir: string, logger: Logger): Promise<DataFolderLock> {
  try {
    return await lockDataFolder(dataDir);
  } catch (error) {
    if (error instanceof DataFolderInUse) logger.warn("server.refused", error.message, { dataDir, pid: error.pid });
    else logger.error("server.start-failed", "The API server couldn't lock its data folder", { dataDir }, error);
    throw error;
  }
}

async function serve(
  config: ServerConfig,
  replaced: Replaced,
  logger: Logger,
): Promise<{ server: Server; models: Models }> {
  const { store, leases } = createStorage(config, logger);
  const models = await modelsFor(config, store, replaced, logger);
  const { writer, librarian } = models;
  await seedStore(store);
  const runs = createRuns({ store, leases, writer, maxConcurrentRuns: config.maxConcurrentRuns, logger });
  const routes = [
    libraryRoute(store),
    manualRoute(store, runs),
    deleteManualRoute(store, runs),
    sectionRoute(store, runs),
    sectionStreamRoute(store, runs),
    librarianRoute(store, librarian, logger),
    clientErrorsRoute(logger),
  ];
  if (config.passcode !== undefined) routes.push(passcodeRoute(config.passcode, logger));

  const server = createServer(createRequestHandler(routes, logger, config));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  return { server, models };
}

/** The manuals, and the section leases that keep one writer per section among the servers sharing them. */
function createStorage(config: ServerConfig, logger: Logger): { store: ManualStore; leases: SectionLeases } {
  switch (config.manualStorage.kind) {
    case "files": {
      const store = createFileManualStore(config.dataDir, logger);
      return { store, leases: createInProcessLeases(store) };
    }
    case "dynamodb": {
      const { table } = config.manualStorage;
      return { store: createDynamoDbManualStore(table), leases: createDynamoDbSectionLeases(table) };
    }
  }
}

/** The models passed in, and the configured ones for any that weren't. */
async function modelsFor(config: ServerConfig, store: ManualStore, replaced: Replaced, logger: Logger): Promise<Models> {
  const { writer, librarian, idle } = replaced;
  if (writer && librarian) return { writer, librarian, idle: idle ?? nothingToSettle };
  const configured = await createModels(config, store, logger);
  return {
    writer: writer ?? configured.writer,
    librarian: librarian ?? configured.librarian,
    async idle() {
      await idle?.();
      await configured.idle();
    },
  };
}

/**
 * The writer and the librarian share one gateway, with the fake model or with Bedrock, so one set
 * of caps, the kill switch and the ledger cover every job.
 */
export async function createModels(
  config: ServerConfig,
  store: ManualStore,
  logger: Logger,
  credentialsFile: URL = ENV_LOCAL_FILE,
): Promise<Models> {
  switch (config.models) {
    case "fake": {
      const openSpendingLedger = () =>
        openFileSpendingLedger({ ledger: createFileLedger(config.dataDir, logger), dataDir: config.dataDir });
      const gateway = await createModelGateway(withFakeModel(config), () => fakeModel(), openSpendingLedger, logger);
      return { writer: createFakeWriter(gateway), librarian: gateway, idle: gateway.idle };
    }
    case "bedrock": {
      const createClient = () =>
        createBedrockClient(readAwsCredentials(credentialsFile), { timeoutMs: config.idleTimeoutMs });
      const openSpendingLedger = async () =>
        createDynamoDbSpendingLedger(usageTableWith(config.usageTable, readAwsCredentials(credentialsFile)));
      const gateway = await createModelGateway(config, createClient, openSpendingLedger, logger);
      const writer = createBedrockWriter({
        gateway,
        store,
        wordsRequested: config.sectionWordsRequested,
        expectedCharacters: config.sectionExpectedCharacters,
      });
      return { writer, librarian: gateway, idle: gateway.idle };
    }
  }
}

/** Every job on the fake model, keeping its `maxTokens` and idle timeout. */
function withFakeModel(config: ServerConfig): ServerConfig {
  const jobs = { ...config.jobs };
  for (const job of Object.keys(jobs) as Job[]) jobs[job] = { ...jobs[job], model: FAKE_MODEL };
  return { ...config, jobs };
}

function createModelGateway(
  config: ServerConfig,
  createClient: () => ModelClient,
  openSpendingLedger: () => Promise<SpendingLedger>,
  logger: Logger,
): Promise<RunningGateway> {
  return createGateway({ createClient, openSpendingLedger, config, prices, logger });
}
