import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { LOCK_FILE_NAME } from "./storage/lock.ts";
import { tempDataDir } from "./testing.ts";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));
const LISTENING = /API server on http:\/\/127\.0\.0\.1:(\d+) \(fake models\)/;
const TEST_TIMEOUT_MS = 30_000;

/** Runs `npm run server`'s main.ts on its own data folder, with the fake models and any free port. */
function startMain(dataDir: string) {
  const child = spawn(process.execPath, [MAIN], {
    env: { ...process.env, RTFM_DATA_DIR: dataDir, RTFM_PORT: "0", RTFM_MODELS: "fake" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  onTestFinished(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  const listening = () =>
    new Promise<number>((resolve, reject) => {
      const resolveOnceListening = () => {
        const match = stdout.match(LISTENING);
        if (match) resolve(Number(match[1]));
      };
      resolveOnceListening();
      child.stdout.on("data", resolveOnceListening);
      void exited.then(() => reject(new Error(`main.ts exited before listening:\n${stderr}`)));
    });
  return { child, listening, exited, stderr: () => stderr };
}

describe("main.ts", () => {
  it("holds the data folder while it runs, and releases it and exits on SIGTERM", { timeout: TEST_TIMEOUT_MS }, async () => {
    const dataDir = await tempDataDir();
    const main = startMain(dataDir);
    const port = await main.listening();

    expect(await readFile(path.join(dataDir, LOCK_FILE_NAME), "utf8")).toBe(String(main.child.pid));
    expect((await fetch(`http://127.0.0.1:${port}/api/manuals`)).status).toBe(200);

    main.child.kill("SIGTERM");
    expect(await main.exited).toBe(0);
    expect(await readdir(dataDir)).not.toContain(LOCK_FILE_NAME);
  });

  it("refuses a second server on the same folder with a message and exit code 1", { timeout: TEST_TIMEOUT_MS }, async () => {
    const dataDir = await tempDataDir();
    const first = startMain(dataDir);
    await first.listening();

    const second = startMain(dataDir);
    expect(await second.exited).toBe(1);
    expect(second.stderr()).toContain(`Another server (PID ${first.child.pid}) is using the data folder ${dataDir}.`);

    first.child.kill("SIGTERM");
    expect(await first.exited).toBe(0);
  });
});
