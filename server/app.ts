import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { manualRoute } from "./api/manual.ts";
import { createRequestHandler } from "./api/node-adapter.ts";
import { sectionStreamRoute } from "./api/section-stream.ts";
import { sectionRoute } from "./api/section.ts";
import type { ServerConfig } from "./config.ts";
import { createBedrockClient } from "./gateway/bedrock-client.ts";
import { ENV_LOCAL_FILE, readAwsCredentials } from "./gateway/credentials.ts";
import { createGateway, type Gateway } from "./gateway/gateway.ts";
import { prices } from "./gateway/prices.ts";
import { ModelNotPriced } from "./gateway/types.ts";
import { createFileLedger } from "./storage/file-ledger.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
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

export async function startServer(config: ServerConfig, writer?: SectionWriter): Promise<RunningServer> {
  const store = createFileManualStore(config.dataDir);
  writer ??= await createWriter(config, store);
  await seedStore(store);
  const runs = createRuns({ store, writer, maxConcurrentRuns: config.maxConcurrentRuns });
  const routes = [manualRoute(store, runs), sectionRoute(store, runs), sectionStreamRoute(store, runs)];

  const server = createServer(createRequestHandler(routes));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, resolve);
  });

  return {
    port: (server.address() as AddressInfo).port,
    close() {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      return closed;
    },
  };
}

export async function createWriter(
  config: ServerConfig,
  store: ManualStore,
  credentialsFile: URL = ENV_LOCAL_FILE,
): Promise<SectionWriter> {
  switch (config.writer) {
    case "fake":
      return createFakeWriter();
    case "bedrock":
      return createBedrockWriter({
        gateway: await createBedrockGateway(config, credentialsFile),
        store,
        wordsRequested: config.sectionWordsRequested,
        expectedCharacters: config.sectionExpectedCharacters,
      });
  }
}

function createBedrockGateway(config: ServerConfig, credentialsFile: URL): Promise<Gateway> {
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
