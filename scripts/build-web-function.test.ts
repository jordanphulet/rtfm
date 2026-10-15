import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { passcodeDigest } from "../server/api/passcode.ts";
import { writePasscodeDigest } from "../server/storage/dynamodb-manual-store.ts";
import { DYNAMODB_LOCAL_CREDENTIALS, testAppTable } from "../server/storage/dynamodb-testing.ts";
import { WEB_FUNCTION_ENTRYPOINT } from "./build-web-function.ts";
import { NOTICES_FILE } from "./third-party-notices.ts";

const SCRIPT = fileURLToPath(new URL("./build-web-function.ts", import.meta.url));
const TEST_TIMEOUT_MS = 60_000;
const PASSCODE = "brass kettle mossy heron";
const ENDPOINT_HOST = "abcdefghijklmnop.b7t.lambda-web.us-west-2.on.aws";

async function tempFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "rtfm-build-test-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true, maxRetries: 3 }));
  return folder;
}

function build(outDir: string) {
  return spawnSync(process.execPath, [SCRIPT, outDir], { encoding: "utf8" });
}

/**
 * Runs the package as Lambda does: its entry, from the package's root, on a stand-in endpoint,
 * with a table of its own in DynamoDB Local, holding the passcode's digest.
 */
async function runPackage(packageDir: string, tmp: string) {
  const table = await testAppTable();
  await writePasscodeDigest(table, passcodeDigest(PASSCODE));
  const child = spawn(process.execPath, [WEB_FUNCTION_ENTRYPOINT], {
    cwd: packageDir,
    env: {
      ...process.env,
      AWS_LAMBDA_HTTP_ENDPOINT: "127.0.0.1:0",
      RTFM_MODELS: undefined,
      RTFM_APP_TABLE: table.name,
      RTFM_USAGE_TABLE: "rtfm-usage",
      RTFM_DYNAMODB_ENDPOINT: table.endpoint,
      AWS_REGION: table.region,
      AWS_ACCESS_KEY_ID: DYNAMODB_LOCAL_CREDENTIALS.accessKeyId,
      AWS_SECRET_ACCESS_KEY: DYNAMODB_LOCAL_CREDENTIALS.secretAccessKey,
      AWS_SESSION_TOKEN: "a stand-in session token",
      AWS_CONTAINER_CREDENTIALS_FULL_URI: undefined,
      AWS_CONTAINER_AUTHORIZATION_TOKEN: undefined,
      TMPDIR: tmp,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  onTestFinished(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });
  let output = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
  return new Promise<number>((resolve, reject) => {
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
      const port = output.match(/"event":"server\.started".*?"port":(\d+)/)?.[1];
      if (port) resolve(Number(port));
    });
    child.on("exit", () => reject(new Error(`The package exited before listening:\n${output}`)));
  });
}

function get(port: number, pathname: string, cookie?: string) {
  return new Promise<{ status: number; contentType: string | undefined; text: string }>((resolve, reject) => {
    const headers = { host: ENDPOINT_HOST, ...(cookie ? { cookie } : {}) };
    const sent = httpRequest({ host: "127.0.0.1", port, path: pathname, headers, setHost: false });
    sent.on("error", reject);
    sent.on("response", async (response) => {
      let text = "";
      for await (const chunk of response.setEncoding("utf8")) text += chunk;
      resolve({ status: response.statusCode!, contentType: response.headers["content-type"], text });
    });
    sent.end();
  });
}

describe("build-web-function.ts", () => {
  it("builds a package that serves the built app, its third-party notices and the seeded library", { timeout: TEST_TIMEOUT_MS }, async () => {
    const packageDir = await tempFolder();
    const built = build(packageDir);
    expect(built.status, built.stderr).toBe(0);
    expect((await readdir(packageDir)).sort()).toEqual(["dist", "seed", "server"]);
    expect((await readdir(path.join(packageDir, "server"))).sort()).toEqual([NOTICES_FILE, path.basename(WEB_FUNCTION_ENTRYPOINT)]);

    const port = await runPackage(packageDir, await tempFolder());
    const page = await get(port, "/read/the-haunt-that-listens");
    expect(page.status).toBe(200);
    expect(page.text).toContain('<div id="root">');
    const manuals = await get(port, "/api/manuals", `rtfm_passcode=${passcodeDigest(PASSCODE)}`);
    expect(JSON.parse(manuals.text)).toContainEqual(expect.objectContaining({ id: "the-haunt-that-listens", writtenCount: 7 }));

    const notices = await get(port, `/${NOTICES_FILE}`);
    expect(notices.status).toBe(200);
    expect(notices.contentType).toBe("text/plain; charset=utf-8");
    expect(notices.text).toMatch(/^react@\d[^ ]* \(MIT\)$/m);
    expect(notices.text).toMatch(/^katex@\d[^ ]* \(MIT\)$/m);
    expect(notices.text).not.toMatch(/^@aws-sdk\//m);

    const serverNotices = await readFile(path.join(packageDir, "server", NOTICES_FILE), "utf8");
    expect(serverNotices).toMatch(/^@aws-sdk\/client-dynamodb@\d[^ ]* \(Apache-2\.0\)$/m);
    expect(serverNotices).toMatch(/^@anthropic-ai\/bedrock-sdk@\d[^ ]* \(MIT\)$/m);
  });

  it("refuses an output folder that isn't empty", async () => {
    const outDir = await tempFolder();
    await writeFile(path.join(outDir, "left-behind.txt"), "");
    const built = build(outDir);
    expect(built.status).toBe(2);
    expect(built.stderr).toContain("isn't empty");
  });
});
