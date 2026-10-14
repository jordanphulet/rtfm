import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, onTestFinished } from "vitest";
import { silentLogger } from "../logging/logger.ts";
import { TRANSACTION_ATTEMPTS, type DynamoDbTable } from "../storage/dynamodb-manual-store.ts";
import { DYNAMODB_LOCAL_CREDENTIALS } from "../storage/dynamodb-testing.ts";
import type { ReserveEntry, SettleEntry } from "../storage/types.ts";
import { collect, TEST_MODEL, TEST_PRICES, testGatewayConfig, waitUntil } from "../testing.ts";
import { createDynamoDbSpendingLedger, setKillSwitch } from "./dynamodb-spending-ledger.ts";
import { testUsageTable } from "./dynamodb-testing.ts";
import { createGateway } from "./gateway.ts";
import { callsFrom } from "./ledger-calls.ts";
import { describeSpendingLedger } from "./spending-ledger-suite.ts";
import { SpendingRefused, type ModelClient, type ModelRequest, type Prompt } from "./types.ts";

describeSpendingLedger("the table rtfm-usage's spending ledger", async () => {
  const table = await testUsageTable();
  return {
    open: async () => createDynamoDbSpendingLedger(table),
    openRacing: async () => [createDynamoDbSpendingLedger(table), createDynamoDbSpendingLedger(table)],
    setKillSwitch: (on) => setKillSwitch(table, on),
  };
});

const RESERVED_AT = "2026-10-11T08:00:00.000Z";
const CAPS = { dailyUsd: 1, monthlyUsd: 2 };

function reserve(callId: string, worstCaseUsd: number, reservedAt = RESERVED_AT): ReserveEntry {
  return { kind: "reserve", callId, reservedAt, job: "write-section", model: TEST_MODEL, worstCaseUsd };
}

function settle({ callId, reservedAt, job, model }: ReserveEntry, usd: number): SettleEntry {
  return {
    kind: "settle",
    callId,
    reservedAt,
    at: reservedAt,
    job,
    model,
    inputTokens: 100,
    outputTokens: 200,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    usd,
    outcome: "complete",
    estimated: false,
  };
}

describe("two servers with Bedrock", () => {
  it("share the caps through rtfm-usage: of the calls both start at once, only those the cap allows reach the model", async () => {
    const table = await testUsageTable();
    const requests: ModelRequest[] = [];
    const hangsUntilAborted: ModelClient = {
      async *stream(request) {
        requests.push(request);
        await new Promise((_, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason)));
      },
    };
    const prompt: Prompt = { system: "", messages: [{ role: "user", content: "" }] };
    const jobs = testGatewayConfig().jobs;
    const config = testGatewayConfig({
      maxConcurrentCalls: 10,
      jobs: { ...jobs, librarian: { model: TEST_MODEL, maxTokens: 100_000 } },
    });
    const worstCaseUsd = ((100 + 10) * 1.25 + 100_000 * 5) / 1_000_000;
    const callsTheCapAllows = Math.floor(config.caps.dailyUsd / worstCaseUsd);
    expect(callsTheCapAllows).toBe(3);

    const servers = await Promise.all(
      [1, 2].map(() =>
        createGateway({
          createClient: () => hangsUntilAborted,
          openSpendingLedger: async () => createDynamoDbSpendingLedger(table),
          config,
          prices: TEST_PRICES,
          logger: silentLogger,
        }),
      ),
    );
    const controller = new AbortController();
    const calls = servers.flatMap((gateway) =>
      Array.from({ length: 4 }, () => collect(gateway.stream("librarian", prompt, controller.signal))),
    );
    const refusals = calls.map((call) => call.catch((error: unknown) => error));
    await waitUntil(() => requests.length === callsTheCapAllows, 5000);

    controller.abort();
    const outcomes = await Promise.all(refusals);
    expect(requests).toHaveLength(callsTheCapAllows);
    expect(outcomes.filter((outcome) => outcome instanceof SpendingRefused && outcome.reason === "daily-cap")).toHaveLength(
      8 - callsTheCapAllows,
    );
    await Promise.all(servers.map((gateway) => gateway.idle()));
    const settled = callsFrom(await createDynamoDbSpendingLedger(table).entriesForMonth(new Date().toISOString().slice(0, 7)));
    expect(settled.map((call) => call.settle?.outcome)).toEqual(Array(callsTheCapAllows).fill("aborted"));
  });
});

describe("importing calls into rtfm-usage", () => {
  it("copies a call with what it was charged, whatever the caps, and leaves one already there as it is", async () => {
    const ledger = createDynamoDbSpendingLedger(await testUsageTable());
    const settled = reserve("settled", 0.75);
    const unsettled = reserve("unsettled", 0.5);
    const importedCalls = callsFrom([settled, settle(settled, 0.25), unsettled]);

    expect(await Promise.all(importedCalls.map((call) => ledger.importCall(call)))).toEqual(["imported", "imported"]);
    expect(await ledger.importCall(importedCalls[0]!)).toBe("already-there");
    expect(await ledger.entriesForMonth("2026-10")).toEqual(expect.arrayContaining([settled, settle(settled, 0.25), unsettled]));

    await expect(ledger.reserve(reserve("over", 0.375), CAPS)).rejects.toMatchObject({ reason: "daily-cap" });
    await ledger.reserve(reserve("fits", 0.25), CAPS);
  });
});

type Answer = { status: number; body: object };

/** A stand-in for DynamoDB on loopback, answering each request in turn from `answers`, then with `{}`. */
async function standInDynamoDb(answers: Answer[]) {
  const requests: { target: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request.setEncoding("utf8")) text += chunk;
    requests.push({ target: String(request.headers["x-amz-target"]).split(".")[1]!, body: JSON.parse(text) });
    const { status, body } = answers.shift() ?? { status: 200, body: {} };
    response.writeHead(status, { "content-type": "application/x-amz-json-1.0" }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const table: DynamoDbTable = {
    name: "rtfm-usage",
    region: "us-west-2",
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    credentials: DYNAMODB_LOCAL_CREDENTIALS,
  };
  return { requests, ledger: createDynamoDbSpendingLedger(table) };
}

function cancelled(...codes: string[]): Answer {
  return {
    status: 400,
    body: {
      __type: "com.amazonaws.dynamodb.v20120810#TransactionCanceledException",
      message: "Transaction cancelled",
      CancellationReasons: codes.map((Code) => ({ Code })),
    },
  };
}

const conflict = cancelled("None", "TransactionConflict", "None", "None");

describe("the table rtfm-usage's transactions", () => {
  it("reserves in one transaction: the kill switch is off, each total stays within its cap, and the call is new", async () => {
    const { requests, ledger } = await standInDynamoDb([]);
    await ledger.reserve(reserve("call", 0.25), CAPS);

    expect(requests.map(({ target }) => target)).toEqual(["TransactWriteItems"]);
    const [killSwitch, day, month, call] = requests[0]!.body.TransactItems as Record<string, Record<string, unknown>>[];
    expect(killSwitch!.ConditionCheck).toMatchObject({
      Key: { pk: { S: "KILL_SWITCH" }, sk: { S: "KILL_SWITCH" } },
      ConditionExpression: "attribute_not_exists(pk)",
    });
    for (const [update, sk, limit] of [
      [day, "2026-10-11", "0.75"],
      [month, "2026-10", "1.75"],
    ] as const) {
      expect(update!.Update).toMatchObject({
        Key: { pk: { S: "TOTAL" }, sk: { S: sk } },
        UpdateExpression: "ADD committedUsd :usd",
        ConditionExpression: "attribute_not_exists(committedUsd) OR committedUsd <= :limit",
        ExpressionAttributeValues: { ":usd": { N: "0.25" }, ":limit": { N: limit } },
      });
    }
    expect(call!.Put).toMatchObject({
      Item: { pk: { S: "LEDGER#2026-10" }, sk: { S: `${RESERVED_AT}#call` } },
      ConditionExpression: "attribute_not_exists(pk)",
    });
  });

  it("settles in one transaction: the settlement once, and what the call cost less its worst case on each total", async () => {
    const { requests, ledger } = await standInDynamoDb([]);
    const call = reserve("call", 0.75);
    await ledger.settle(settle(call, 0.25), call.worstCaseUsd);

    const [settlement, day, month] = requests[0]!.body.TransactItems as Record<string, Record<string, unknown>>[];
    expect(settlement!.Update).toMatchObject({
      Key: { pk: { S: "LEDGER#2026-10" }, sk: { S: `${RESERVED_AT}#call` } },
      UpdateExpression: "SET settle = :settle",
      ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(settle)",
    });
    for (const [update, sk] of [
      [day, "2026-10-11"],
      [month, "2026-10"],
    ] as const) {
      expect(update!.Update).toMatchObject({
        Key: { pk: { S: "TOTAL" }, sk: { S: sk } },
        UpdateExpression: "ADD committedUsd :usd",
        ExpressionAttributeValues: { ":usd": { N: "-0.5" } },
      });
    }
  });

  it("keeps one ClientRequestToken across the SDK's own retries, so DynamoDB applies a reservation at most once", async () => {
    const serverError = { status: 500, body: { __type: "com.amazonaws.dynamodb.v20120810#InternalServerError", message: "Try again" } };
    const { requests, ledger } = await standInDynamoDb([serverError]);
    await ledger.reserve(reserve("call", 0.25), CAPS);

    const [first, retried] = requests.map(({ body }) => body.ClientRequestToken);
    expect(requests).toHaveLength(2);
    expect(first).toEqual(expect.any(String));
    expect(retried).toBe(first);
  });

  it("reserves and settles again after another transaction got in their way", async () => {
    const { requests, ledger } = await standInDynamoDb([conflict, conflict]);
    const call = reserve("call", 0.25);
    await ledger.reserve(call, CAPS);
    await ledger.settle(settle(call, 0.125), call.worstCaseUsd);
    expect(requests.map(({ target }) => target)).toEqual(Array(4).fill("TransactWriteItems"));
  });

  it(`gives up after ${TRANSACTION_ATTEMPTS} attempts that keep colliding`, async () => {
    const { requests, ledger } = await standInDynamoDb(Array(TRANSACTION_ATTEMPTS).fill(conflict));
    await expect(ledger.reserve(reserve("call", 0.25), CAPS)).rejects.toThrow("Transaction cancelled");
    expect(requests).toHaveLength(TRANSACTION_ATTEMPTS);
  });

  it("names the refusal by the condition that failed, the kill switch first", async () => {
    const { ledger } = await standInDynamoDb([
      cancelled("ConditionalCheckFailed", "ConditionalCheckFailed", "None", "None"),
      cancelled("None", "ConditionalCheckFailed", "ConditionalCheckFailed", "None"),
      cancelled("None", "None", "ConditionalCheckFailed", "None"),
    ]);
    for (const reason of ["kill-switch", "daily-cap", "monthly-cap"]) {
      await expect(ledger.reserve(reserve(reason, 0.25), CAPS)).rejects.toMatchObject({ reason });
    }
  });
});
