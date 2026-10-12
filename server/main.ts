import { startServer } from "./app.ts";
import { config } from "./config.ts";
import { DataFolderInUse } from "./storage/lock.ts";

const server = await startServer(config).catch((error: unknown) => {
  if (!(error instanceof DataFolderInUse)) throw error;
  console.error(error.message);
  process.exit(1);
});
console.log(`API server on http://127.0.0.1:${server.port} (${config.models} models)`);

async function stop() {
  await server.close();
  process.exit();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
