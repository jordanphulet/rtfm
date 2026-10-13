import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect, createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mainCheckoutRoot } from "../server/gateway/credentials.ts";

export interface DynamoDbLocalRelease {
  url: string;
  sha256: string;
}

/** AWS's archive of 2026-07-31, DynamoDB Local 3.3.1, which needs Java 17 or newer. */
export const DYNAMODB_LOCAL_RELEASE: DynamoDbLocalRelease = {
  url: "https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_2026-07-31.tar.gz",
  sha256: "f80bcec477f85f57e2c77f8d54aa6b672a8403fceff0c450560aee1cf6c21163",
};

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
/** In the main checkout, so every worktree shares the one copy. Gitignored. */
export const DYNAMODB_LOCAL_DIR = path.join(mainCheckoutRoot(REPO_ROOT), ".dynamodb-local", "2026-07-31");
export const FETCH_DYNAMODB_LOCAL = "npm run fetch-dynamodb-local";
const LAUNCHER = fileURLToPath(new URL("./DynamoDbLocalOnLoopback.java", import.meta.url));
const STARTUP_TIMEOUT_MS = 30_000;
/**
 * The one origin DynamoDB Local allows cross-origin requests from: no page has it, so no page in a
 * browser can reach DynamoDB Local during a test run, whatever its default allow-list becomes.
 */
export const NO_PAGE_ORIGIN = "https://no-page.invalid";

export interface RunningDynamoDbLocal {
  endpoint: string;
  stop(): Promise<void>;
}

/**
 * Starts DynamoDB Local from `dir`, in memory, on a free port on 127.0.0.1 only, and resolves
 * once it accepts connections. It throws, saying how to fetch it, when it isn't there.
 */
export async function startDynamoDbLocal(dir = DYNAMODB_LOCAL_DIR): Promise<RunningDynamoDbLocal> {
  const jar = path.join(dir, "DynamoDBLocal.jar");
  if (!existsSync(jar)) {
    throw new Error(`DynamoDB Local isn't in ${dir}. Run \`${FETCH_DYNAMODB_LOCAL}\` once (it needs Java 17 or newer).`);
  }
  const libraries = path.join(dir, "DynamoDBLocal_lib");
  const port = await freePort();
  const args = [`-Djava.library.path=${libraries}`, "-cp", `${jar}${path.delimiter}${libraries}/*`, LAUNCHER];
  const options = ["-inMemory", "-disableTelemetry", "-cors", NO_PAGE_ORIGIN, "-port", String(port)];
  const child = spawn("java", [...args, ...options], {
    env: { ...process.env, DDB_LOCAL_TELEMETRY: "0" },
    stdio: ["pipe", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const failed = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(new Error(`Couldn't run java for DynamoDB Local: ${error.message}`)));
    void exited.then(() => reject(new Error(`DynamoDB Local stopped as it started (it needs Java 17 or newer):\n${stderr}`)));
  });

  const stop = async () => {
    child.stdin.end();
    child.kill();
    await exited;
  };
  try {
    await Promise.race([acceptsConnections(port), failed]);
  } catch (error) {
    await stop();
    throw error;
  }
  return { endpoint: `http://127.0.0.1:${port}`, stop };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function acceptsConnections(port: number): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!(await connects(port))) {
    if (Date.now() > deadline) throw new Error(`DynamoDB Local didn't listen on 127.0.0.1:${port} within ${STARTUP_TIMEOUT_MS}ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function connects(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}
