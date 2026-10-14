import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import type { LogEntry } from "./logging/logger.ts";
import { passcodeDigest } from "./api/passcode.ts";
import { answerKeysRefused, startEventStream } from "./gateway/bedrock-testing.ts";
import { createDynamoDbSpendingLedger } from "./gateway/dynamodb-spending-ledger.ts";
import { testUsageTable } from "./gateway/dynamodb-testing.ts";
import { createDynamoDbLinkStore } from "./storage/dynamodb-link-store.ts";
import { createDynamoDbManualStore, writePasscodeDigest } from "./storage/dynamodb-manual-store.ts";
import { DYNAMODB_LOCAL_CREDENTIALS, keyRefusingDynamoDb, testAppTable } from "./storage/dynamodb-testing.ts";
import { monthOf } from "./storage/file-ledger.ts";
import { librarySecretDigest } from "./storage/library-links.ts";
import { createTestLink, SAMPLE_ID, tempDataDir, UNWRITTEN_ID, waitUntil } from "./testing.ts";

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

/** A librarian's reply in one turn, as Claude streams it. */
const REPLY_EVENTS = [
  {
    type: "message_start",
    message: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Good morning to you." } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 6 } },
  { type: "message_stop" },
];

/** A stand-in for Bedrock on loopback, answering every call with `respond` and keeping each call's headers. */
async function standInBedrock(respond: (response: ServerResponse) => void) {
  const received: IncomingHttpHeaders[] = [];
  const server = createServer(async (request, response) => {
    for await (const _ of request);
    received.push(request.headers);
    respond(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, received };
}

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
      RTFM_USAGE_TABLE: "rtfm-usage",
      RTFM_DYNAMODB_ENDPOINT: table.endpoint,
      RTFM_BEDROCK_ENDPOINT: undefined,
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
      credentialsExpireAt: "unset",
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

  it("opens two libraries by their links, each with its own manuals in the table, without the passcode", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const links = createDynamoDbLinkStore(webFunction.table);
    const secrets = { acme: await createTestLink(links, "acme"), globex: await createTestLink(links, "globex") };
    const port = await webFunction.listening();
    const page = { host: ENDPOINT_HOST, origin: APP_ORIGIN };
    const openLink = async (secret: string) => {
      const opened = await send(port, "POST", "/api/link", page, { secret });
      expect(opened.status).toBe(204);
      const [libraryCookie, passcodeCleared] = opened.headers["set-cookie"]!;
      expect(libraryCookie).toMatch(/^rtfm_library=.*; Max-Age=31536000; Secure$/);
      expect(passcodeCleared).toMatch(/^rtfm_passcode=; .*; Max-Age=0; Secure$/);
      return { ...page, cookie: libraryCookie!.split(";")[0] };
    };
    const manualIds = async (headers: OutgoingHttpHeaders) =>
      (JSON.parse((await send(port, "GET", "/api/manuals", headers)).text) as { id: string }[]).map(({ id }) => id).toSorted();
    const acme = await openLink(secrets.acme);
    const globex = await openLink(secrets.globex);

    expect(await manualIds(acme)).toEqual(["negotiating-with-geese", "the-haunt-that-listens"]);
    expect((await send(port, "DELETE", `/api/manuals/${SAMPLE_ID}`, acme)).status).toBe(204);
    expect(await manualIds(acme)).toEqual(["negotiating-with-geese"]);
    expect(await manualIds(globex)).toEqual(["negotiating-with-geese", "the-haunt-that-listens"]);
    expect(await manualIds(await enterPasscode(port))).toHaveLength(7);
    expect(await createDynamoDbManualStore(webFunction.table, "acme").getManual(SAMPLE_ID)).toBeUndefined();
    expect(await links.getActivity("globex")).toMatchObject({ opens: 1 });

    const logged = JSON.stringify(webFunction.entries());
    expect(webFunction.entries().filter(({ event }) => event === "link.accepted").map(({ libraryId }) => libraryId)).toEqual([
      "acme",
      "globex",
    ]);
    for (const secret of Object.values(secrets)) {
      expect(logged).not.toContain(secret);
      expect(logged).not.toContain(librarySecretDigest(secret));
    }
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

  it("streams the librarian's reply to a POST, logged in the admin's library", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    const port = await webFunction.listening();
    const conversation = { messages: [{ role: "user", text: "Good morning" }] };
    const reply = await send(port, "POST", "/api/librarian", await enterPasscode(port), conversation);

    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("text/event-stream");
    expect(reply.text).toMatch(/event: text\n/);
    expect(reply.text).toMatch(/event: done\ndata: \{\}\n\n$/);
    const librarianRequest = () => webFunction.entries().find(({ event, path }) => event === "request" && path === "/api/librarian");
    await waitUntil(() => librarianRequest() !== undefined, 5000);
    expect(librarianRequest()).toMatchObject({ libraryId: "admin", status: 200 });
    expect(webFunction.entries().find(({ event }) => event === "librarian.reply")).toMatchObject({ libraryId: "admin" });
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

  it("logs when its keys expire, when Lambda says, and never a key", { timeout: TEST_TIMEOUT_MS }, async () => {
    const keysExpireAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    const webFunction = await startWebFunction({ AWS_CREDENTIAL_EXPIRATION: keysExpireAt });
    await webFunction.listening();

    const [started] = webFunction.entries();
    expect(started).toMatchObject({ event: "server.started", credentials: "environment", credentialsExpireAt: keysExpireAt });
    expect(JSON.stringify(started)).not.toMatch(/stand-in session token|AKIA/);
  });

  it("exits with 1 once DynamoDB refuses its keys, so Lambda replaces the environment", { timeout: TEST_TIMEOUT_MS }, async () => {
    const table = await testAppTable();
    await writePasscodeDigest(table, passcodeDigest(PASSCODE));
    const dynamoDb = await keyRefusingDynamoDb(table);
    const webFunction = await startWebFunction({ RTFM_APP_TABLE: table.name, RTFM_DYNAMODB_ENDPOINT: dynamoDb.endpoint });
    const port = await webFunction.listening();
    const headers = await enterPasscode(port);

    dynamoDb.refuseKeys();
    expect((await send(port, "GET", "/api/manuals", headers)).status).toBe(500);

    expect(await webFunction.exited).toBe(1);
    expect(webFunction.entries().map(({ event }) => event)).toEqual(
      expect.arrayContaining(["server.keys-refused", "server.stopped"]),
    );
    expect(webFunction.entries().find(({ event }) => event === "server.keys-refused")).toMatchObject({
      level: "WARN",
      error: expect.objectContaining({ name: "ExpiredTokenException" }),
    });
  });

  it("answers 500 when a link can't be read, logging neither its secret nor its digest", { timeout: TEST_TIMEOUT_MS }, async () => {
    const table = await testAppTable();
    await writePasscodeDigest(table, passcodeDigest(PASSCODE));
    const secret = await createTestLink(createDynamoDbLinkStore(table), "acme");
    const dynamoDb = await keyRefusingDynamoDb(table);
    const webFunction = await startWebFunction({ RTFM_APP_TABLE: table.name, RTFM_DYNAMODB_ENDPOINT: dynamoDb.endpoint });
    const port = await webFunction.listening();

    dynamoDb.refuseKeys();
    const page = { host: ENDPOINT_HOST, origin: APP_ORIGIN };
    expect((await send(port, "GET", "/api/manuals", { ...page, cookie: `rtfm_library=${secret}` })).status).toBe(500);

    expect(await webFunction.exited).toBe(1);
    expect(webFunction.entries().find(({ event }) => event === "request.failed")).toMatchObject({
      error: expect.objectContaining({ message: "Couldn't look up a library link (ExpiredTokenException)" }),
    });
    const logged = JSON.stringify(webFunction.entries());
    for (const kept of [secret, librarySecretDigest(secret)]) expect(logged).not.toContain(kept);
  });

  it("stops on SIGTERM", { timeout: TEST_TIMEOUT_MS }, async () => {
    const webFunction = await startWebFunction();
    await webFunction.listening();
    webFunction.child.kill("SIGTERM");
    expect(await webFunction.exited).toBe(0);
    expect(webFunction.entries().at(-1)).toMatchObject({ event: "server.stopped" });
  });

  it("runs the Bedrock models as the execution role, reserving each call in RTFM_USAGE_TABLE", { timeout: TEST_TIMEOUT_MS }, async () => {
    const bedrock = await standInBedrock((response) => {
      startEventStream(response, REPLY_EVENTS);
      response.end();
    });
    const usageTable = await testUsageTable();
    const webFunction = await startWebFunction({
      RTFM_MODELS: "bedrock",
      RTFM_USAGE_TABLE: usageTable.name,
      RTFM_BEDROCK_ENDPOINT: bedrock.endpoint,
    });
    const port = await webFunction.listening();
    expect(webFunction.entries()[0]).toMatchObject({ event: "server.started", models: "bedrock" });

    const conversation = { messages: [{ role: "user", text: "Good morning" }] };
    const reply = await send(port, "POST", "/api/librarian", await enterPasscode(port), conversation);
    expect(reply.text).toMatch(/event: done\ndata: \{\}\n\n$/);

    expect(bedrock.received).toHaveLength(1);
    expect(bedrock.received[0]!.authorization).toContain(`Credential=${DYNAMODB_LOCAL_CREDENTIALS.accessKeyId}/`);
    expect(bedrock.received[0]!["x-amz-security-token"]).toBe("a stand-in session token");
    const entries = await createDynamoDbSpendingLedger(usageTable).entriesForMonth(monthOf(new Date().toISOString()));
    expect(entries).toMatchObject([
      { kind: "reserve", job: "librarian" },
      { kind: "settle", job: "librarian", outcome: "complete" },
    ]);
  });

  it("exits with 1 once Bedrock refuses its keys, so Lambda replaces the environment", { timeout: TEST_TIMEOUT_MS }, async () => {
    const bedrock = await standInBedrock((response) => answerKeysRefused(response, "ExpiredTokenException"));
    const usageTable = await testUsageTable();
    const webFunction = await startWebFunction({
      RTFM_MODELS: "bedrock",
      RTFM_USAGE_TABLE: usageTable.name,
      RTFM_BEDROCK_ENDPOINT: bedrock.endpoint,
    });
    const port = await webFunction.listening();

    const conversation = { messages: [{ role: "user", text: "Good morning" }] };
    const reply = await send(port, "POST", "/api/librarian", await enterPasscode(port), conversation);
    expect(reply.text).toMatch(/event: failed\n/);

    expect(await webFunction.exited).toBe(1);
    expect(webFunction.entries().find(({ event }) => event === "server.keys-refused")).toMatchObject({
      level: "WARN",
      service: "Bedrock",
    });
    expect(webFunction.entries().at(-1)).toMatchObject({ event: "server.stopped" });
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
