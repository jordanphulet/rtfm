import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { ViteDevServer } from "vite";
import { startServer, type RunningServer } from "../server/app.ts";
import { config } from "../server/config.ts";
import { exitOnceWritten } from "../server/exit.ts";
import { createFileLinkStore } from "../server/storage/file-link-store.ts";
import { librarySecretDigest, makeLibrarySecret } from "../server/storage/library-links.ts";
import { checkedRecipientLibraryId } from "../server/storage/library.ts";
import { localUrl, startViteServer } from "./vite-server.ts";

const USAGE = "Usage: npm run serve-temp -- [--keep] [--library <libraryId>]";

const options = readOptions();
const dataDir = await mkdtemp(path.join(tmpdir(), "rtfm-serve-temp-"));
let apiServer: RunningServer | undefined;
let viteServer: ViteDevServer | undefined;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(0));
process.on("uncaughtException", (error) => crash(error));
process.on("unhandledRejection", (reason) => crash(reason));

try {
  const secret = options.libraryId === undefined ? undefined : await createLink(options.libraryId);
  apiServer = await startServer({ ...config, dataDir, port: 0, models: "fake" });
  viteServer = await startViteServer(apiServer.port);
  const page = localUrl(viteServer);
  console.log(
    [
      `Page:        ${page}`,
      ...(secret === undefined ? [] : [`Link:        ${new URL(`/l#${secret}`, page).href}`]),
      `API:         http://127.0.0.1:${apiServer.port}`,
      `Data folder: ${dataDir}`,
      `PID:         ${process.pid}`,
      `Stop it with: kill ${process.pid}`,
    ].join("\n"),
  );
} catch (error) {
  await crash(error);
}

function readOptions(): { keep: boolean; libraryId: string | undefined } {
  try {
    const { values } = parseArgs({ options: { keep: { type: "boolean", default: false }, library: { type: "string" } } });
    const libraryId = values.library === undefined ? undefined : checkedRecipientLibraryId(values.library);
    return { keep: values.keep, libraryId };
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    process.exit(2);
  }
}

/** A link to the library in this run's data folder alone, whose secret is printed once and kept nowhere. */
async function createLink(libraryId: string): Promise<string> {
  const secret = makeLibrarySecret();
  const link = { digest: librarySecretDigest(secret), libraryId, createdAt: new Date().toISOString() };
  await createFileLinkStore(dataDir).createLink(link);
  return secret;
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
