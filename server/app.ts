import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fakeModel } from "./agent/fake-model.ts";
import { clientErrorsRoute } from "./api/client-errors.ts";
import { deleteManualRoute } from "./api/delete-manual.ts";
import { librarianRoute } from "./api/librarian.ts";
import { libraryRoute } from "./api/library.ts";
import { manualRoute } from "./api/manual.ts";
import { createRequestHandler } from "./api/node-adapter.ts";
import { cachedDigest, passcodeRoute, type CurrentDigest } from "./api/passcode.ts";
import type { Library } from "./api/route.ts";
import { sectionStreamRoute } from "./api/section-stream.ts";
import { sectionRoute } from "./api/section.ts";
import { tableWith, type ManualStorage, type ModelAccess, type ServerConfig } from "./config.ts";
import { exitOnceWritten } from "./exit.ts";
import { createBedrockClient } from "./gateway/bedrock-client.ts";
import { ENV_LOCAL_FILE, readAwsAccess, type AwsAccess } from "./gateway/credentials.ts";
import { createDynamoDbSpendingLedger } from "./gateway/dynamodb-spending-ledger.ts";
import { openFileSpendingLedger } from "./gateway/file-spending-ledger.ts";
import { createGateway, type Gateway, type RunningGateway } from "./gateway/gateway.ts";
import { prices } from "./gateway/prices.ts";
import type { SpendingLedger } from "./gateway/spending-ledger.ts";
import { FAKE_MODEL, type Job, type ModelClient } from "./gateway/types.ts";
import { toLogFile } from "./logging/log-file.ts";
import { createLogger, type LogFields, type Logger } from "./logging/logger.ts";
import {
  createDynamoDbManualStore,
  createDynamoDbSectionLeases,
  readPasscodeDigest,
  SECTION_LEASE_TIMING,
} from "./storage/dynamodb-manual-store.ts";
import { createFileLedger } from "./storage/file-ledger.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { createInProcessLeases } from "./storage/in-process-leases.ts";
import { ADMIN_LIBRARY_ID } from "./storage/library.ts";
import { DataFolderInUse, lockDataFolder, type DataFolderLock } from "./storage/lock.ts";
import { seedStore } from "./storage/seed.ts";
import type { ManualStore, SectionLeases } from "./storage/types.ts";
import { createBedrockWriter } from "./writer/bedrock.ts";
import { createFakeWriter } from "./writer/fake.ts";
import { createRuns, type LibraryScope } from "./writer/runs.ts";
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
  /** The section writer for a library's manuals, which the Bedrock writer reads its example section from. */
  writerFor(store: ManualStore): SectionWriter;
  librarian: Gateway;
  /** Resolves once no model call is running and every one is settled in the ledger. */
  idle(): Promise<void>;
}

/**
 * Parts of the server a caller may supply in place of the configured ones: a section writer for
 * every library, the librarian's gateway and its `idle`, the logger, `now`, the clock the stored
 * passcode's digest is kept by, in milliseconds, and `libraryIdOf`, which library a request is in,
 * where the gate gives every request the admin's.
 */
export interface Replaced {
  writer?: SectionWriter;
  librarian?: Gateway;
  idle?: () => Promise<void>;
  logger?: Logger;
  now?: () => number;
  libraryIdOf?: (request: IncomingMessage) => string;
}

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
  const currentDigest = passcodeDigestSource(config, replaced.now ?? Date.now);
  const models = await modelsFor(config, replaced, logger);
  const libraryFor = await createLibraries(config, models, logger);
  const libraryIdOf = replaced.libraryIdOf ?? (() => ADMIN_LIBRARY_ID);
  const routes = [
    libraryRoute,
    manualRoute,
    deleteManualRoute,
    sectionRoute,
    sectionStreamRoute,
    librarianRoute(logger),
    clientErrorsRoute(logger),
  ];
  if (currentDigest) routes.push(passcodeRoute(currentDigest, logger));

  const libraryOf = async (request: IncomingMessage) => libraryFor(libraryIdOf(request));
  const server = createServer(createRequestHandler(routes, logger, config, { currentDigest, libraryOf }));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  return { server, models };
}

/**
 * The `Library` of each library id, built the first time it is asked for and kept, so each has one
 * store, one set of leases and one writer, bound to the one shared runs and gateway. The admin's is
 * built and seeded at once.
 */
async function createLibraries(config: ServerConfig, models: Models, logger: Logger): Promise<(libraryId: string) => Library> {
  const scopeOf = (libraryId: string): LibraryScope => {
    const { store, leases } = createStorage(config, logger, libraryId);
    return { libraryId, store, leases, writer: models.writerFor(store) };
  };
  const admin = scopeOf(ADMIN_LIBRARY_ID);
  await seedStore(admin.store);
  const runs = createRuns({ ...admin, maxConcurrentRuns: config.maxConcurrentRuns, logger });
  const libraryOn = (scope: LibraryScope): Library => ({ ...scope, runs: runs.forLibrary(scope), gateway: models.librarian });

  const libraries = new Map([[ADMIN_LIBRARY_ID, libraryOn(admin)]]);
  return (libraryId) => {
    let library = libraries.get(libraryId);
    if (!library) {
      library = libraryOn(scopeOf(libraryId));
      libraries.set(libraryId, library);
    }
    return library;
  };
}

/** A library's manuals, and the section leases that keep one writer per section among the servers sharing them. */
function createStorage(config: ServerConfig, logger: Logger, libraryId: string): { store: ManualStore; leases: SectionLeases } {
  switch (config.manualStorage.kind) {
    case "files": {
      const store = createFileManualStore(config.dataDir, logger, libraryId);
      return { store, leases: createInProcessLeases(store) };
    }
    case "dynamodb": {
      const { table } = config.manualStorage;
      return {
        store: createDynamoDbManualStore(table, libraryId),
        leases: createDynamoDbSectionLeases(table, SECTION_LEASE_TIMING, libraryId),
      };
    }
  }
}

/**
 * Where the gate finds the passcode's digest: the fixed one, or the one stored beside the manuals,
 * read again at most once a minute. Undefined means no gate.
 */
function passcodeDigestSource(config: ServerConfig, now: () => number): CurrentDigest | undefined {
  switch (config.passcode?.kind) {
    case undefined:
      return undefined;
    case "digest": {
      const { digest } = config.passcode;
      return async () => digest;
    }
    case "stored": {
      if (config.manualStorage.kind !== "dynamodb") throw new Error("A stored passcode needs the manuals in DynamoDB");
      const { table } = config.manualStorage;
      return cachedDigest(() => readPasscodeDigest(table), now);
    }
  }
}

/** The models passed in, and the configured ones for any that weren't. */
async function modelsFor(config: ServerConfig, replaced: Replaced, logger: Logger): Promise<Models> {
  const { writer, librarian, idle } = replaced;
  if (writer && librarian) return { writerFor: () => writer, librarian, idle: idle ?? nothingToSettle };
  const configured = await createModels(config, logger);
  return {
    writerFor: writer ? () => writer : configured.writerFor,
    librarian: librarian ?? configured.librarian,
    async idle() {
      await idle?.();
      await configured.idle();
    },
  };
}

/**
 * Every library's writer and the librarian share one gateway, with the fake model or with Bedrock,
 * so one set of caps, the kill switch and the ledger cover every job.
 */
export async function createModels(config: ServerConfig, logger: Logger, credentialsFile: URL = ENV_LOCAL_FILE): Promise<Models> {
  switch (config.models) {
    case "fake": {
      const openSpendingLedger = () =>
        openFileSpendingLedger({ ledger: createFileLedger(config.dataDir, logger), dataDir: config.dataDir });
      const gateway = await createModelGateway(withFakeModel(config), () => fakeModel(), openSpendingLedger, logger);
      const writer = createFakeWriter(gateway);
      return { writerFor: () => writer, librarian: gateway, idle: gateway.idle };
    }
    case "bedrock": {
      const aws = () => modelAws(config.modelAccess, credentialsFile);
      const createClient = () => {
        const { access, bedrockEndpoint, keysRefusedBy } = aws();
        const onKeysRefused = keysRefusedBy("Bedrock");
        return createBedrockClient(access, { timeoutMs: config.idleTimeoutMs, baseURL: bedrockEndpoint, onKeysRefused });
      };
      const openSpendingLedger = async () => {
        const { access, keysRefusedBy } = aws();
        return createDynamoDbSpendingLedger({ ...tableWith(config.usageTable, access), onKeysRefused: keysRefusedBy("DynamoDB") });
      };
      const gateway = await createModelGateway(config, createClient, openSpendingLedger, logger);
      const writerFor = (store: ManualStore) =>
        createBedrockWriter({
          gateway,
          store,
          wordsRequested: config.sectionWordsRequested,
          expectedCharacters: config.sectionExpectedCharacters,
        });
      return { writerFor, librarian: gateway, idle: gateway.idle };
    }
  }
}

interface ModelAws {
  access: AwsAccess;
  bedrockEndpoint: string | undefined;
  /** What to tell when the service refuses the keys, if anything is to be told. */
  keysRefusedBy(service: string): ((error: Error) => void) | undefined;
}

/**
 * How the Bedrock models reach AWS: `rtfm-local`'s keys from `.env.local`, read now, with Bedrock's
 * own endpoint and nothing told of refused keys; or the Web Function's execution role.
 */
function modelAws(modelAccess: ModelAccess, credentialsFile: URL): ModelAws {
  if (modelAccess.kind === "env-local") {
    return { access: readAwsAccess(credentialsFile), bedrockEndpoint: undefined, keysRefusedBy: () => undefined };
  }
  const { access, bedrockEndpoint, onKeysRefused } = modelAccess;
  return { access, bedrockEndpoint, keysRefusedBy: (service) => (error) => onKeysRefused(service, error) };
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
