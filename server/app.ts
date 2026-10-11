import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { manualRoute } from "./api/manual.ts";
import { createRequestHandler } from "./api/node-adapter.ts";
import { sectionStreamRoute } from "./api/section-stream.ts";
import { sectionRoute } from "./api/section.ts";
import type { ServerConfig, WriterName } from "./config.ts";
import { createFileManualStore } from "./storage/file-manual-store.ts";
import { seedStore } from "./storage/seed.ts";
import { createFakeWriter } from "./writer/fake.ts";
import { createRuns } from "./writer/runs.ts";
import type { SectionWriter } from "./writer/types.ts";

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export async function startServer(
  config: ServerConfig,
  writer: SectionWriter = createWriter(config.writer),
): Promise<RunningServer> {
  const store = createFileManualStore(config.dataDir);
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

function createWriter(name: WriterName): SectionWriter {
  switch (name) {
    case "fake":
      return createFakeWriter();
  }
}
