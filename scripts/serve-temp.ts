import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { ViteDevServer } from "vite";
import { startServer, type RunningServer } from "../server/app.ts";
import { config } from "../server/config.ts";
import { localUrl, startViteServer } from "./screenshots.ts";

const USAGE = "Usage: npm run serve-temp -- [--keep]";

const options = readOptions();
const dataDir = await mkdtemp(path.join(tmpdir(), "rtfm-serve-temp-"));
let apiServer: RunningServer | undefined;
let viteServer: ViteDevServer | undefined;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(0));
process.on("uncaughtException", (error) => crash(error));
process.on("unhandledRejection", (reason) => crash(reason));

try {
  apiServer = await startServer({ ...config, dataDir, port: 0, models: "fake" });
  viteServer = await startViteServer(apiServer.port);
  console.log(
    [
      `Page:        ${localUrl(viteServer)}`,
      `API:         http://127.0.0.1:${apiServer.port}`,
      `Data folder: ${dataDir}`,
      `PID:         ${process.pid}`,
      `Stop it with: kill ${process.pid}`,
    ].join("\n"),
  );
} catch (error) {
  await crash(error);
}

function readOptions(): { keep: boolean } {
  try {
    const { values } = parseArgs({ options: { keep: { type: "boolean", default: false } } });
    return { keep: values.keep };
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    process.exit(2);
  }
}

function crash(error: unknown) {
  console.error(error);
  return stop(1);
}

/**
 * Stops both servers, then deletes the data folder unless `--keep` was given. A second signal or
 * a crash while stopping exits at once.
 */
async function stop(exitCode: number) {
  if (stopping) process.exit(1);
  stopping = true;
  await viteServer?.close();
  await apiServer?.close();
  if (options.keep) console.log(`Kept the data folder ${dataDir}`);
  else await rm(dataDir, { recursive: true, force: true });
  exitOnceWritten(exitCode);
}

/** Exits once standard output has taken every line: a pipe may still be holding some. */
function exitOnceWritten(code: number) {
  process.stdout.write("", () => process.exit(code));
}
