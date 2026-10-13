import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = fileURLToPath(new URL("./serve-temp.ts", import.meta.url));
const START_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 60_000;
const DEV_PORTS = [5173, 8787];

type Started = { child: ChildProcess; pageUrl: string; apiUrl: string; dataDir: string; pid: number };

const running = new Set<ChildProcess>();
const keptFolders: string[] = [];

afterEach(async () => {
  await Promise.all([...running].map(stopAndWait));
  running.clear();
  for (const folder of keptFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
}, 2 * STOP_TIMEOUT_MS);

function serveTemp(...args: string[]): Promise<Started> {
  const env = { ...process.env };
  delete env.RTFM_PASSCODE;
  const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  running.add(child);
  let output = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve-temp didn't start:\n${output}`)), START_TIMEOUT_MS);
    child.stderr?.on("data", (chunk) => (output += chunk));
    child.stdout?.on("data", (chunk) => {
      output += chunk;
      const started = parseStarted(output);
      if (!started) return;
      clearTimeout(timer);
      resolve({ child, ...started });
    });
    child.on("exit", () => reject(new Error(`serve-temp exited:\n${output}`)));
  });
}

function parseStarted(output: string) {
  const line = (label: string) => output.match(new RegExp(`^${label}:\\s+(.+)$`, "m"))?.[1];
  const pid = line("PID");
  if (!pid) return undefined;
  return { pageUrl: line("Page")!, apiUrl: line("API")!, dataDir: line("Data folder")!, pid: Number(pid) };
}

/** Stops the child with SIGTERM, or with SIGKILL if it hasn't exited after a while. */
function stopAndWait(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => {
    const forceStop = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
    child.once("exit", (code) => {
      clearTimeout(forceStop);
      resolve(code);
    });
    child.kill("SIGTERM");
  });
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    return false;
  }
}

const portOf = (url: string) => Number(new URL(url).port);

describe("serve-temp", () => {
  it(
    "starts the page and the API on free ports, with a new data folder outside .data/",
    async () => {
      const server = await serveTemp();

      expect(server.pid).toBe(server.child.pid);
      expect(DEV_PORTS).not.toContain(portOf(server.pageUrl));
      expect(DEV_PORTS).not.toContain(portOf(server.apiUrl));
      expect(realpathSync(server.dataDir).startsWith(realpathSync(tmpdir()))).toBe(true);
      expect(existsSync(path.join(server.dataDir, "server.lock"))).toBe(true);
      expect(await answers(server.pageUrl)).toBe(true);
      expect(await answers(`${server.apiUrl}/api/manuals`)).toBe(true);
      expect(await answers(new URL("/api/manuals", server.pageUrl).href)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "frees its ports and deletes its data folder when stopped",
    async () => {
      const server = await serveTemp();

      expect(await stopAndWait(server.child)).toBe(0);

      expect(await answers(server.pageUrl)).toBe(false);
      expect(await answers(`${server.apiUrl}/api/manuals`)).toBe(false);
      expect(existsSync(server.dataDir)).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps its data folder when stopped with --keep",
    async () => {
      const server = await serveTemp("--keep");
      keptFolders.push(server.dataDir);

      expect(await stopAndWait(server.child)).toBe(0);

      expect(await answers(`${server.apiUrl}/api/manuals`)).toBe(false);
      expect(existsSync(path.join(server.dataDir, "manuals"))).toBe(true);
      expect(existsSync(path.join(server.dataDir, "server.lock"))).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "runs two copies at once without colliding",
    async () => {
      const [first, second] = await Promise.all([serveTemp(), serveTemp()]);

      const ports = [first.pageUrl, first.apiUrl, second.pageUrl, second.apiUrl].map(portOf);
      expect(new Set(ports).size).toBe(4);
      expect(first.dataDir).not.toBe(second.dataDir);
      for (const server of [first, second]) {
        expect(await answers(server.pageUrl)).toBe(true);
        expect(await answers(`${server.apiUrl}/api/manuals`)).toBe(true);
      }

      await stopAndWait(first.child);

      expect(await answers(`${first.apiUrl}/api/manuals`)).toBe(false);
      expect(await answers(second.pageUrl)).toBe(true);
      expect(await answers(`${second.apiUrl}/api/manuals`)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it("refuses an unknown option", async () => {
    const child = spawn(process.execPath, [SCRIPT, "--models", "bedrock"], { cwd: ROOT, stdio: "ignore" });
    running.add(child);
    expect(await new Promise((resolve) => child.once("exit", resolve))).toBe(2);
  });
});
