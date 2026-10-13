import { startServer, type RunningServer } from "./app.ts";
import { config } from "./config.ts";
import { toLogFile } from "./logging/log-file.ts";
import { createLogger, toStandardOutput } from "./logging/logger.ts";

const logger = createLogger([toStandardOutput, toLogFile(config.dataDir)]);

// A closed pipe on standard output (EPIPE) would otherwise be an unhandled error that stops the server.
process.stdout.on("error", () => {});

process.on("uncaughtException", (error) => crash("An uncaught exception stopped the server", error));
process.on("unhandledRejection", (reason) => crash("An unhandled rejection stopped the server", reason));

try {
  const server = await startServer(config, { logger });
  process.on("SIGINT", () => stop(server));
  process.on("SIGTERM", () => stop(server));
} catch {
  exitOnceWritten(1);
}

async function stop(server: RunningServer) {
  await server.close();
  exitOnceWritten(0);
}

function crash(message: string, error: unknown) {
  logger.error("server.crashed", message, {}, error);
  exitOnceWritten(1);
}

/** Exits once standard output has taken every line: a pipe may still be holding some. */
function exitOnceWritten(code: number) {
  process.stdout.write("", () => process.exit(code));
}
