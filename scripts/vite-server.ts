import { createLogger, createServer, type Logger, type ViteDevServer } from "vite";

/**
 * Starts Vite on a free port, with `vite.config.ts` merged under these options: its `/api` proxy
 * keeps every setting but the target, which becomes this run's API server.
 */
export async function startViteServer(apiPort: number): Promise<ViteDevServer> {
  const server = await createServer({
    server: {
      port: 0,
      forwardConsole: false,
      proxy: { "/api": { target: `http://127.0.0.1:${apiPort}` } },
    },
    clearScreen: false,
    customLogger: createLoggerWithoutRepeatedErrors(),
  });
  await server.listen();
  return server;
}

export function localUrl(server: ViteDevServer): string {
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite isn't listening on a local address");
  return url;
}

function createLoggerWithoutRepeatedErrors(): Logger {
  const logger = createLogger("warn");
  const loggedErrors = new Set<string>();
  const logError = logger.error;
  logger.error = (message, options) => {
    const key = options?.error?.message ?? message;
    if (loggedErrors.has(key)) return;
    loggedErrors.add(key);
    logError(message, options);
  };
  return logger;
}
