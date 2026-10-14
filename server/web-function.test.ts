import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import type { LogEntry } from "./logging/logger.ts";
import { passcodeDigest } from "./api/passcode.ts";
import { createDynamoDbManualStore, writePasscodeDigest } from "./storage/dynamodb-manual-store.ts";
import { DYNAMODB_LOCAL_CREDENTIALS, testAppTable } from "./storage/dynamodb-testing.ts";
import { SAMPLE_ID, tempDataDir, UNWRITTEN_ID, waitUntil } from "./testing.ts";

const WEB_FUNCTION = fileURLToPath(new URL("./web-function.ts", import.meta.url));
const TEST_TIMEOUT_MS = 30_000;
const PASSCODE = "brass kettle mossy heron";
/** In the environment, which the Web Function never takes its passcode from. */
const DECOY_PASSCODE = "copper lantern tidal owl";
const INDEX = "<!doctype html><title>RTFM</title>";
/** A Web Function endpoint's domain, which Lambda sends as the `Host`. */
const ENDPOINT_HOST = "abcdefghijklmnop.b7t.lambda-web.us-west-2.on.aws";
const APP_ORIGIN = "https://rtfm.moonfetus.com";
const STREAM_PATH = `/api/manuals/${SAMPLE_ID}/sections/${UNWRITTEN_ID}/stream`;

interface Answer {
  status: number;
  headers: IncomingMessage["headers"];
  text: string;
}

/**
 * Runs `web-function.ts` as Lambda would, on a stand-in `AWS_LAMBDA_HTTP_ENDPOINT` (any free port
 * on loopback), with its `/tmp` and its built app in folders of the test's own, and its own table
 * in DynamoDB Local, holding `PASSCODE`'s digest unless `passcodeStored` is false, reached with
 * stand-ins for the execution role's credentials.
 */
async function startWebFunction(env: NodeJS.ProcessEnv = {}, { passcodeStored = true } = {}) {
  const tmp = await tempDataDir();
  const table = await testAppTable();
  if (passcodeStored) await writePasscodeDigest(table, passcodeDigest(PASSCODE));
  const appDir = path.join(tmp, "dist");
  await mkdir(appDir);
  await writeFile(path.join(appDir, "index.html"), INDEX);
  const child = spawn(process.execPath, [WEB_FUNCTION], {
    env: {
      ...process.env,
      AWS_LAMBDA_HTTP_ENDPOINT: "127.0.0.1:0",
      RTFM_APP_DIR: appDir,
      RTFM_MODELS: undefined,
      RTFM_PASSCODE: DECOY_PASSCODE,
      RTFM_DATA_DIR: undefined,
      RTFM_APP_TABLE: table.name,
      RTFM_DYNAMODB_ENDPOINT: table.endpoint,
      AWS_REGION: table.region,
      AWS_ACCESS_KEY_ID: DYNAMODB_LOCAL_CREDENTIALS.accessKeyId,
      AWS_SECRET_ACCESS_KEY: DYNAMODB_LOCAL_CREDENTIALS.secretAccessKey,
      AWS_SESSION_TOKEN: "a stand-in session token",
      AWS_CONTAINER_CREDENTIALS_FULL_URI: undefined,
      AWS_CONTAINER_AUTHORIZATION_TOKEN: undefined,
      TMPDIR: tmp,
      ...env,
    },
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
  const entries = () => stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as LogEntry);
  const listening = () =>
    new Promise<number>((resolve, reject) => {
      const resolveOnceListening = () => {
        const started = entries().find(({ event }) => event === "server.started");
        if (started) resolve(started.port as number);
      };
      resolveOnceListening();
      child.stdout.on("data", resolveOnceListening);
      void exited.then(() => reject(new Error(`web-function.ts exited before listening:\n${stdout}${stderr}`)));
    });
  return { child, tmp, table, exited, entries, listening };
}

/** Sends exactly these headers, Host included, which fetch won't let a caller set. */
function send(port: number, method: string, path: string, headers: OutgoingHttpHeaders, body?: unknown) {
  return new Promise<Answer>((resolve, reject) => {
    const json = body === undefined ? undefined : JSON.stringify(body);
    const contentType = json === undefined ? {} : { "content-type": "application/json" };
    const sent = httpRequest({ host: "127.0.0.1", port, method, path, headers: { ...headers, ...contentType }, setHost: false });
    sent.on("error", reject);
    sent.on("response", async (response) => {
      let text = "";
      for await (const chunk of response.setEncoding("utf8")) text += chunk;
      resolve({ status: response.statusCode!, headers: response.headers, text });
    });
    sent.end(json);
  });
}

/** What the app's page sends, through CloudFront, once the passcode is entered. */
async function enterPasscode(port: number) {
  const entered = await send(port, "POST", "/api/passcode", { host: ENDPOINT_HOST, origin: APP_ORIGIN }, { passcode: PASSCODE });
  expect(entered.status).toBe(204);
  const [cookie] = entered.headers["set-cookie"]!;
  expect(cookie).toMatch(/; Secure$/);
  return { host: ENDPOINT_HOST, origin: APP_ORIGIN, cookie: cookie.split(";")[0] };
}

describe("web-function.ts", () => {
  it("listens on AWS_LAMBDA_HTTP_ENDPOINT with the fake models, keeping the manuals in the table it seeds", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const port = await webFunction.listening();

    expect(webFunction.entries()[0]).toMatchObject({
      event: "server.started",
      host: "127.0.0.1",
      models: "fake",
      manualStorage: "dynamodb",
      credentials: "environment",
      passcodeGate: true,
    });
    expect(await createDynamoDbManualStore(webFunction.table).getManual(SAMPLE_ID)).toBeDefined();
    const [dataFolder] = (await readdir(webFunction.tmp)).filter((name) => name.startsWith("rtfm-data-"));
    expect(await readdir(path.join(webFunction.tmp, dataFolder!))).not.toContain("manuals");

    const manuals = await send(port, "GET", "/api/manuals", await enterPasscode(port));
    expect(JSON.parse(manuals.text)).toContainEqual(expect.objectContaining({ id: SAMPLE_ID }));
  });

  it("opens with the cookie holding the stored digest, never with RTFM_PASSCODE", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const port = await webFunction.listening();
    const page = { host: ENDPOINT_HOST, origin: APP_ORIGIN };

    const { cookie } = await enterPasscode(port);
    expect(cookie).toBe(`rtfm_passcode=${passcodeDigest(PASSCODE)}`);
    expect((await send(port, "POST", "/api/passcode", page, { passcode: DECOY_PASSCODE })).status).toBe(401);
    expect((await send(port, "GET", "/api/manuals", { ...page, cookie: `rtfm_passcode=${passcodeDigest(DECOY_PASSCODE)}` })).status).toBe(401);
    expect(JSON.stringify(webFunction.entries())).not.toContain(passcodeDigest(PASSCODE));
  });

  it("refuses every API request, and every passcode, while no digest is stored", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction({}, { passcodeStored: false });
    const port = await webFunction.listening();
    const page = { host: ENDPOINT_HOST, origin: APP_ORIGIN };

    expect((await send(port, "GET", "/", page)).status).toBe(200);
    expect((await send(port, "GET", "/api/manuals", page)).status).toBe(401);
    expect((await send(port, "GET", "/api/manuals", { ...page, cookie: `rtfm_passcode=${passcodeDigest(PASSCODE)}` })).status).toBe(401);
    for (const passcode of [PASSCODE, DECOY_PASSCODE]) {
      const entered = await send(port, "POST", "/api/passcode", page, { passcode });
      expect(entered.status, passcode).toBe(401);
      expect(entered.headers["set-cookie"]).toBeUndefined();
    }
    expect(webFunction.entries().map(({ event }) => event)).toContain("passcode.unset");
  });

  it("serves the built app for every page route, without the passcode", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const port = await webFunction.listening();
    for (const page of ["/", `/read/${SAMPLE_ID}`]) {
      const answer = await send(port, "GET", page, { host: ENDPOINT_HOST });
      expect(answer.status, page).toBe(200);
      expect(answer.text).toBe(INDEX);
    }
  });

  it("answers only its endpoint's Host and the app's origin", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const port = await webFunction.listening();
    for (const host of [`127.0.0.1:${port}`, "localhost:5173", "rtfm.moonfetus.com", `${ENDPOINT_HOST}.evil.example`]) {
      expect((await send(port, "GET", "/", { host })).status, host).toBe(403);
    }
    for (const origin of ["http://localhost:5173", "http://rtfm.moonfetus.com", "https://evil.example"]) {
      expect((await send(port, "GET", "/", { host: ENDPOINT_HOST, origin })).status, origin).toBe(403);
    }
    expect((await send(port, "GET", "/", { host: ENDPOINT_HOST, origin: APP_ORIGIN })).status).toBe(200);
  });

  it("streams the librarian's reply to a POST", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const port = await webFunction.listening();
    const conversation = { messages: [{ role: "user", text: "Good morning" }] };
    const reply = await send(port, "POST", "/api/librarian", await enterPasscode(port), conversation);

    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("text/event-stream");
    expect(reply.text).toMatch(/event: text\n/);
    expect(reply.text).toMatch(/event: done\ndata: \{\}\n\n$/);
  });

  it("streams a section, and stops writing it once its only reader disconnects", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const port = await webFunction.listening();
    const headers = await enterPasscode(port);

    await new Promise<void>((resolve, reject) => {
      const sent = httpRequest({ host: "127.0.0.1", port, path: STREAM_PATH, headers, setHost: false });
      sent.on("error", reject);
      sent.on("response", (response) => {
        expect(response.statusCode).toBe(200);
        response.setEncoding("utf8").on("data", (chunk: string) => {
          if (!chunk.includes("event: append")) return;
          sent.destroy();
          resolve();
        });
      });
      sent.end();
    });

    await waitUntil(() => webFunction.entries().some(({ event }) => event === "section.aborted"), 5000);
    expect(webFunction.entries().map(({ event }) => event)).not.toContain("section.finished");
  });

  it("stops on SIGTERM", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    await webFunction.listening();
    webFunction.child.kill("SIGTERM");
    expect(await webFunction.exited).toBe(0);
    expect(webFunction.entries().at(-1)).toMatchObject({ event: "server.stopped" });
  });

  it("refuses to start with the Bedrock models", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction({ RTFM_MODELS: "bedrock" });
    expect(await webFunction.exited).toBe(1);
    expect(webFunction.entries()).toEqual([
      expect.objectContaining({
        level: "ERROR",
        event: "server.start-failed",
        error: expect.objectContaining({ message: expect.stringContaining('not RTFM_MODELS="bedrock"') }),
      }),
    ]);
  });

  it("refuses to start without the execution role's credentials, naming where they could come from", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction({ AWS_SESSION_TOKEN: undefined });
    expect(await webFunction.exited).toBe(1);
    expect(webFunction.entries()).toEqual([
      expect.objectContaining({
        event: "server.start-failed",
        error: expect.objectContaining({ message: expect.stringContaining("needs its execution role's credentials") }),
      }),
    ]);
  });

  it("refuses to start without AWS_LAMBDA_HTTP_ENDPOINT", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction({ AWS_LAMBDA_HTTP_ENDPOINT: undefined });
    expect(await webFunction.exited).toBe(1);
    expect(webFunction.entries()).toEqual([
      expect.objectContaining({ event: "server.start-failed", error: expect.objectContaining({ message: expect.stringContaining("AWS_LAMBDA_HTTP_ENDPOINT") }) }),
    ]);
  });
});
