import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fakeLibrarianModel } from "./agent/librarian/fake-model.ts";
import { clientErrorsRoute } from "./api/client-errors.ts";
import { deleteManualRoute } from "./api/delete-manual.ts";
import { librarianRoute } from "./api/librarian.ts";
import { libraryRoute } from "./api/library.ts";
import { manualRoute } from "./api/manual.ts";
import { createRequestHandler } from "./api/node-adapter.ts";
import { sectionStreamRoute } from "./api/section-stream.ts";
import { sectionRoute } from "./api/section.ts";
import type { ServerConfig } from "./config.ts";
import { createBedrockClient } from "./gateway/bedrock-client.ts";
import { ENV_LOCAL_FILE, readAwsCredentials } from "./gateway/credentials.ts";
import { createGateway, type Gateway, type RunningGateway } from "./gateway/gateway.ts";
import { prices } from "./gateway/prices.ts";
import { toLogFile } from "./logging/log-file.ts";
import { createLogger, type Logger } from "./logging/logger.ts";
import { createFileLedger } from "./storage/file-ledger.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { DataFolderInUse, lockDataFolder, type DataFolderLock } from "./storage/lock.ts";
import { seedStore } from "./storage/seed.ts";
import type { ManualStore } from "./storage/types.ts";
import { createBedrockWriter } from "./writer/bedrock.ts";
import { createFakeWriter } from "./writer/fake.ts";
import { createRuns } from "./writer/runs.ts";
import type { SectionWriter } from "./writer/types.ts";

export interface RunningServer {
  port: number;
  close(): Promise<void>;
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
 * Starts the server on the configured data folder and port. Without a logger of its own, it logs
 * to the data folder's log file only; `main.ts` also logs to standard output.
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
  logger.info("server.started", `API server on http://127.0.0.1:${port} (${config.models} models)`, {
    port,
    models: config.models,
    dataDir: config.dataDir,
  });

  return {
    port,
    async close() {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
      await models.idle();
      await lock.release();
      logger.info("server.stopped", "API server stopped", { port });
    },
  };
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
  const store = createFileManualStore(config.dataDir, logger);
  const models = await modelsFor(config, store, replaced, logger);
  const { writer, librarian } = models;
  await seedStore(store);
  const runs = createRuns({ store, writer, maxConcurrentRuns: config.maxConcurrentRuns, logger });
  const routes = [
    libraryRoute(store),
    manualRoute(store, runs),
    deleteManualRoute(store, runs),
    sectionRoute(store, runs),
    sectionStreamRoute(store, runs),
    librarianRoute(store, librarian, logger),
    clientErrorsRoute(logger),
  ];

  const server = createServer(createRequestHandler(routes, logger));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", resolve);
  });
  return { server, models };
}

/** The models passed in, and the configured ones for any that weren't. */
async function modelsFor(config: ServerConfig, store: ManualStore, replaced: Replaced, logger: Logger): Promise<Models> {
  const { writer, librarian, idle } = replaced;
  if (writer && librarian) return { writer, librarian, idle: idle ?? nothingToSettle };
  const configured = await createModels(config, store, logger);
  return {
    writer: writer ?? configured.writer,
    librarian: librarian ?? configured.librarian,
    idle: idle ?? configured.idle,
  };
}

/** With Bedrock, the writer and the librarian share one gateway, so one set of caps covers both. */
export async function createModels(
  config: ServerConfig,
  store: ManualStore,
  logger: Logger,
  credentialsFile: URL = ENV_LOCAL_FILE,
): Promise<Models> {
  switch (config.models) {
    case "fake":
      return { writer: createFakeWriter(), librarian: fakeLibrarianModel(), idle: nothingToSettle };
    case "bedrock": {
      const gateway = await createBedrockGateway(config, logger, credentialsFile);
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

function createBedrockGateway(config: ServerConfig, logger: Logger, credentialsFile: URL): Promise<RunningGateway> {
  return createGateway({
    createClient: () => createBedrockClient(readAwsCredentials(credentialsFile), { timeoutMs: config.idleTimeoutMs }),
    ledger: createFileLedger(config.dataDir, logger),
    config,
    prices,
    dataDir: config.dataDir,
    logger,
  });
}
