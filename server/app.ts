import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fakeLibrarianModel } from "./agent/librarian/fake-model.ts";
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
import { ModelNotPriced } from "./gateway/types.ts";
import { createFileLedger } from "./storage/file-ledger.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { lockDataFolder } from "./storage/lock.ts";
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

const nothingToSettle = async () => {};

export async function startServer(config: ServerConfig, replaced: Partial<Models> = {}): Promise<RunningServer> {
  const lock = await lockDataFolder(config.dataDir);
  let served: { server: Server; models: Models };
  try {
    served = await serve(config, replaced);
  } catch (error) {
    await lock.release();
    throw error;
  }
  const { server, models } = served;

  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
      await models.idle();
      await lock.release();
    },
  };
}

async function serve(config: ServerConfig, replaced: Partial<Models>): Promise<{ server: Server; models: Models }> {
  const store = createFileManualStore(config.dataDir);
  const models = await modelsFor(config, store, replaced);
  const { writer, librarian } = models;
  await seedStore(store);
  const runs = createRuns({ store, writer, maxConcurrentRuns: config.maxConcurrentRuns });
  const routes = [
    libraryRoute(store),
    manualRoute(store, runs),
    deleteManualRoute(store, runs),
    sectionRoute(store, runs),
    sectionStreamRoute(store, runs),
    librarianRoute(store, librarian),
  ];

  const server = createServer(createRequestHandler(routes));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", resolve);
  });
  return { server, models };
}

/** The models passed in, and the configured ones for any that weren't. */
async function modelsFor(config: ServerConfig, store: ManualStore, replaced: Partial<Models>): Promise<Models> {
  const { writer, librarian, idle = nothingToSettle } = replaced;
  if (writer && librarian) return { writer, librarian, idle };
  return { ...(await createModels(config, store)), ...replaced };
}

/** With Bedrock, the writer and the librarian share one gateway, so one set of caps covers both. */
export async function createModels(
  config: ServerConfig,
  store: ManualStore,
  credentialsFile: URL = ENV_LOCAL_FILE,
): Promise<Models> {
  switch (config.models) {
    case "fake":
      return { writer: createFakeWriter(), librarian: fakeLibrarianModel(), idle: nothingToSettle };
    case "bedrock": {
      const gateway = await createBedrockGateway(config, credentialsFile);
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

function createBedrockGateway(config: ServerConfig, credentialsFile: URL): Promise<RunningGateway> {
  for (const { model } of Object.values(config.jobs)) {
    if (!(model in prices.models)) throw new ModelNotPriced(model);
  }
  return createGateway({
    client: createBedrockClient(readAwsCredentials(credentialsFile), { timeoutMs: config.idleTimeoutMs }),
    ledger: createFileLedger(config.dataDir),
    config,
    prices,
    dataDir: config.dataDir,
  });
}
