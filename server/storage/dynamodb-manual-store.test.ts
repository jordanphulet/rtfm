import { readdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { PLAN_LIMITS } from "../agent/planner/check.ts";
import { tempDataDir, waitUntil } from "../testing.ts";
import {
  createDynamoDbManualStore,
  createDynamoDbSectionLeases,
  MOST_SECTIONS_DELETED_AT_ONCE,
  TRANSACTION_ATTEMPTS,
  type DynamoDbTable,
  type TableCredentials,
} from "./dynamodb-manual-store.ts";
import { DYNAMODB_LOCAL_CREDENTIALS, KEYS_REFUSED_BODIES, testAppTable } from "./dynamodb-testing.ts";
import { sectionsInReadingOrder } from "./manual.ts";
import { describeManualStore, manual } from "./manual-store-suite.ts";
import type { StoredManual } from "./types.ts";

describeManualStore("the DynamoDB manual store", async () => createDynamoDbManualStore(await testAppTable()));

describe("the DynamoDB manual store's table", () => {
  it("is shared by every store on it, as by every environment", async () => {
    const table = await testAppTable();
    const one = createDynamoDbManualStore(table);
    const other = createDynamoDbManualStore(table);
    await one.createManual(manual);
    await one.saveBody(manual.id, "s", "body");
    await one.markSeeded(manual.id);

    expect(await other.getManual(manual.id)).toEqual(manual);
    expect(await other.saveBody(manual.id, "s", "again")).toBe("already-written");
    expect(await other.seededManualIds()).toEqual([manual.id]);
  });

  it("deletes a manual with many written sections", async () => {
    const store = createDynamoDbManualStore(await testAppTable());
    const sectionIds = Array.from({ length: 40 }, (_, index) => `section-${index}`);
    await store.createManual(manual);
    await Promise.all(sectionIds.map((sectionId) => store.saveBody(manual.id, sectionId, sectionId)));
    expect(await store.writtenSectionIds(manual.id)).toHaveLength(40);

    await store.deleteManual(manual.id);

    expect(await store.createManual(manual)).toBe("created");
    expect(await store.writtenSectionIds(manual.id)).toEqual([]);
    expect(await store.getBody(manual.id, "section-7")).toBeUndefined();
  });

  it("can delete any manual the planner or the seed makes in one transaction", async () => {
    expect(PLAN_LIMITS.sections.max).toBeLessThanOrEqual(MOST_SECTIONS_DELETED_AT_ONCE);
    const seedDir = new URL("../seed/", import.meta.url);
    for (const folder of await readdir(seedDir)) {
      const seed = JSON.parse(await readFile(new URL(`${folder}/manual.json`, seedDir), "utf8")) as { manual: StoredManual };
      expect(sectionsInReadingOrder(seed.manual).length, folder).toBeLessThanOrEqual(MOST_SECTIONS_DELETED_AT_ONCE);
    }
  });
});

interface CapturedRequest {
  target: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

type Answer = { status: number; body: object };

/**
 * A stand-in for DynamoDB on loopback. It answers each request with `answer`, given the
 * operation (`TransactWriteItems`, …), how many of that operation it has seen and the request's
 * body, or with an empty item.
 */
async function standInDynamoDb(
  answer: (operation: string, count: number, body: Record<string, unknown>) => Answer | undefined = () => undefined,
) {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request.setEncoding("utf8")) text += chunk;
    const target = String(request.headers["x-amz-target"]).split(".")[1]!;
    const requestBody = JSON.parse(text) as Record<string, unknown>;
    requests.push({ target, headers: request.headers, body: requestBody });
    const count = requests.filter((captured) => captured.target === target).length;
    const { status, body } = answer(target, count, requestBody) ?? { status: 200, body: {} };
    response.writeHead(status, { "content-type": "application/x-amz-json-1.0" }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const table = (credentials: TableCredentials = DYNAMODB_LOCAL_CREDENTIALS): DynamoDbTable => ({
    name: "rtfm-app",
    region: "us-west-2",
    endpoint,
    credentials,
  });
  return { endpoint, requests, table, operations: (target: string) => requests.filter((r) => r.target === target) };
}

/** DynamoDB's own form of a value, for the stand-in's answers. */
function attributeValue(value: unknown): object {
  if (typeof value === "string") return { S: value };
  if (value instanceof Set) return { SS: [...value] };
  if (Array.isArray(value)) return { L: value.map(attributeValue) };
  return { M: Object.fromEntries(Object.entries(value as object).map(([key, inner]) => [key, attributeValue(inner)])) };
}

function manualItem(written: string[]): Answer {
  const item = { pk: "LIBRARY", sk: `MANUAL#${manual.id}`, manual, written: new Set(written) };
  return { status: 200, body: { Item: (attributeValue(item) as { M: object }).M } };
}

function sectionItems(sectionIds: string[]): Answer {
  const items = sectionIds.map((sectionId) => ({ pk: `MANUAL#${manual.id}`, sk: `SECTION#${sectionId}` }));
  return { status: 200, body: { Items: items.map((item) => (attributeValue(item) as { M: object }).M) } };
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

const conditionFailed: Answer = {
  status: 400,
  body: { __type: "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException", message: "failed" },
};

const throttled: Answer = {
  status: 400,
  body: { __type: "com.amazonaws.dynamodb.v20120810#ThrottlingException", message: "Rate exceeded" },
};

/** A failed condition that returns the item as it was, as `ReturnValuesOnConditionCheckFailure` asks. */
function conditionFailedOn(item: Record<string, object>): Answer {
  return { status: 400, body: { ...conditionFailed.body, Item: item } };
}

/** The lease owner a lease request sent. */
function ownerSent(request: Record<string, unknown>): string {
  return (request.ExpressionAttributeValues as Record<string, { S: string }>)[":owner"]!.S;
}

describe("the DynamoDB section leases' renewals", { timeout: 20_000 }, () => {
  /** Long enough that a loaded test run's pauses don't reach the fence by accident. */
  const timing = { durationMs: 1_500, renewEveryMs: 100 };
  const sectionItemKey = { pk: { S: `MANUAL#${manual.id}` }, sk: { S: "SECTION#s" } };

  it("count the lease lost before it expires when every renewal fails without a condition failing", async () => {
    const dynamoDb = await standInDynamoDb((operation, count) =>
      operation === "UpdateItem" && count > 1 ? throttled : undefined,
    );
    const takeSent = Date.now();
    const lease = (await createDynamoDbSectionLeases(dynamoDb.table(), timing).take(manual.id, "s"))!;
    onTestFinished(() => lease.release());

    await waitUntil(() => lease.lost.aborted);
    expect(Date.now() - takeSent).toBeGreaterThanOrEqual(timing.durationMs * 0.9);
    expect(lease.lost.reason).toEqual(new Error(`Couldn't renew the lease on ${manual.id}/s before it expired`));
    expect(dynamoDb.operations("UpdateItem").length).toBeGreaterThan(2);
  });

  it("keep the lease when a renewal succeeds after others failed", async () => {
    const dynamoDb = await standInDynamoDb((operation, count) =>
      operation === "UpdateItem" && count > 1 && count <= 3 ? throttled : undefined,
    );
    const lease = (await createDynamoDbSectionLeases(dynamoDb.table(), timing).take(manual.id, "s"))!;
    onTestFinished(() => lease.release());

    await new Promise((resolve) => setTimeout(resolve, timing.durationMs * 2));
    expect(lease.lost.aborted).toBe(false);
  });

  it("only ever move the expiry later", async () => {
    const dynamoDb = await standInDynamoDb();
    const lease = (await createDynamoDbSectionLeases(dynamoDb.table(), timing).take(manual.id, "s"))!;
    onTestFinished(() => lease.release());

    await waitUntil(() => dynamoDb.operations("UpdateItem").length > 1);
    expect(dynamoDb.operations("UpdateItem")[1]!.body).toMatchObject({
      ConditionExpression: "leaseOwner = :owner AND attribute_not_exists(body) AND leaseExpiresAt < :expiresAt",
      ReturnValuesOnConditionCheckFailure: "ALL_OLD",
    });
  });

  it("ignore a renewal refused for finding a later expiry under its own owner, as a stale retry is", async () => {
    const dynamoDb = await standInDynamoDb((operation, count, request) => {
      if (operation !== "UpdateItem" || count !== 2) return undefined;
      const later = { N: String(Date.now() + 60_000) };
      return conditionFailedOn({ ...sectionItemKey, leaseOwner: { S: ownerSent(request) }, leaseExpiresAt: later });
    });
    const lease = (await createDynamoDbSectionLeases(dynamoDb.table(), timing).take(manual.id, "s"))!;
    onTestFinished(() => lease.release());

    await waitUntil(() => dynamoDb.operations("UpdateItem").length > 3);
    expect(lease.lost.aborted).toBe(false);
  });

  it("count the lease lost when a renewal finds another owner's lease", async () => {
    const dynamoDb = await standInDynamoDb((operation, count) => {
      if (operation !== "UpdateItem" || count !== 2) return undefined;
      const later = { N: String(Date.now() + 60_000) };
      return conditionFailedOn({ ...sectionItemKey, leaseOwner: { S: "another/owner" }, leaseExpiresAt: later });
    });
    const lease = (await createDynamoDbSectionLeases(dynamoDb.table(), timing).take(manual.id, "s"))!;
    onTestFinished(() => lease.release());

    await waitUntil(() => lease.lost.aborted);
    expect(lease.lost.reason).toEqual(new Error(`The lease on ${manual.id}/s is no longer this writer's`));
    await expect(lease.saveBody("body")).rejects.toThrow(`The lease on ${manual.id}/s was lost before`);
    expect(dynamoDb.operations("TransactWriteItems")).toEqual([]);
  });
});

describe("the DynamoDB manual store's transactions", () => {
  it("saves a body again after another transaction got in its way", async () => {
    const dynamoDb = await standInDynamoDb((operation, count) =>
      operation === "TransactWriteItems" && count === 1 ? cancelled("TransactionConflict", "None") : undefined,
    );
    expect(await createDynamoDbManualStore(dynamoDb.table()).saveBody(manual.id, "s", "body")).toBe("saved");
    expect(dynamoDb.operations("TransactWriteItems")).toHaveLength(2);
  });

  it("deletes a manual again after another transaction got in its way", async () => {
    const dynamoDb = await standInDynamoDb((operation, count) => {
      if (operation === "GetItem") return manualItem(["s"]);
      if (operation === "TransactWriteItems" && count === 1) return cancelled("None", "TransactionConflict");
      return undefined;
    });
    await createDynamoDbManualStore(dynamoDb.table()).deleteManual(manual.id);
    expect(dynamoDb.operations("TransactWriteItems")).toHaveLength(2);
  });

  it(`gives up after ${TRANSACTION_ATTEMPTS} attempts that keep colliding`, async () => {
    const dynamoDb = await standInDynamoDb((operation) => {
      if (operation === "GetItem") return manualItem(["s"]);
      if (operation === "TransactWriteItems") return cancelled("TransactionConflict", "None");
      return undefined;
    });
    const store = createDynamoDbManualStore(dynamoDb.table());
    await expect(store.saveBody(manual.id, "s", "body")).rejects.toThrow("Transaction cancelled");
    expect(dynamoDb.operations("TransactWriteItems")).toHaveLength(TRANSACTION_ATTEMPTS);
    await expect(store.deleteManual(manual.id)).rejects.toThrow("Transaction cancelled");
    expect(dynamoDb.operations("TransactWriteItems")).toHaveLength(2 * TRANSACTION_ATTEMPTS);
  });

  it("deletes a manual only while its written sections are exactly those it read", async () => {
    const dynamoDb = await standInDynamoDb((operation, count) => {
      if (operation === "GetItem") return count === 1 ? manualItem(["s"]) : manualItem(["t"]);
      if (operation === "Query") return sectionItems(count === 1 ? ["s"] : ["t"]);
      if (operation === "TransactWriteItems" && count === 1) return cancelled("ConditionalCheckFailed", "None");
      return undefined;
    });
    await createDynamoDbManualStore(dynamoDb.table()).deleteManual(manual.id);

    const [first, second] = dynamoDb.operations("TransactWriteItems").map(({ body }) => body.TransactItems as object[]);
    expect(first).toEqual([
      {
        Delete: expect.objectContaining({
          ConditionExpression: "attribute_exists(pk) AND written = :written",
          ExpressionAttributeValues: { ":written": { SS: ["s"] } },
        }),
      },
      { Delete: expect.objectContaining({ Key: { pk: { S: `MANUAL#${manual.id}` }, sk: { S: "SECTION#s" } } }) },
    ]);
    expect(second).toEqual([
      { Delete: expect.objectContaining({ ExpressionAttributeValues: { ":written": { SS: ["t"] } } }) },
      { Delete: expect.objectContaining({ Key: { pk: { S: `MANUAL#${manual.id}` }, sk: { S: "SECTION#t" } } }) },
    ]);
  });

  it("counts a create as its own when a retry finds the very manual it sent", async () => {
    const dynamoDb = await standInDynamoDb((operation) => {
      if (operation === "PutItem") return conditionFailed;
      if (operation === "GetItem") return manualItem([]);
      return undefined;
    });
    const store = createDynamoDbManualStore(dynamoDb.table());
    expect(await store.createManual(manual)).toBe("created");
    expect(await store.createManual({ ...manual, title: "Another Manual" })).toBe("exists");
  });
});

/**
 * A stand-in for Lambda's container credentials endpoint, handing out a new key each time, which
 * expires in `lifetimeMs`.
 */
async function standInCredentialsEndpoint(lifetimeMs: number) {
  const authorizations: (string | undefined)[] = [];
  const server = createServer((request, response) => {
    authorizations.push(request.headers.authorization);
    const expiration = new Date(Date.now() + lifetimeMs).toISOString();
    const n = authorizations.length;
    response.end(
      JSON.stringify({ AccessKeyId: `AKIACONTAINER${n}`, SecretAccessKey: `secret-${n}`, Token: `token-${n}`, Expiration: expiration }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { fullUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}/credentials`, authorizations };
}

function signedWith(request: CapturedRequest) {
  return {
    accessKeyId: String(request.headers.authorization).match(/Credential=([^/]+)\//)?.[1],
    sessionToken: request.headers["x-amz-security-token"],
  };
}

describe("the DynamoDB client's credentials", () => {
  it("uses only the table's own keys, region and endpoint, never the environment's or a profile's", async () => {
    const dynamoDb = await standInDynamoDb();
    const decoy = await standInDynamoDb();
    const folder = await tempDataDir();
    const profile = `[default]\nregion = eu-west-1\nendpoint_url = ${decoy.endpoint}\nsdk_ua_app_id = decoy-app\n`;
    const keys = "[default]\naws_access_key_id = AKIAPROFILEKEYNOTUSED\naws_secret_access_key = profile-secret\n";
    await writeFile(path.join(folder, "config"), profile);
    await writeFile(path.join(folder, "credentials"), keys);
    vi.stubEnv("AWS_CONFIG_FILE", path.join(folder, "config"));
    vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", path.join(folder, "credentials"));
    vi.stubEnv("AWS_PROFILE", "default");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAENVKEYMUSTNOTBEUSED");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "env-secret-that-must-not-be-used");
    vi.stubEnv("AWS_SESSION_TOKEN", "env-session-token-that-must-not-be-used");
    vi.stubEnv("AWS_REGION", "eu-west-1");
    vi.stubEnv("AWS_ENDPOINT_URL", decoy.endpoint);
    vi.stubEnv("AWS_ENDPOINT_URL_DYNAMODB", decoy.endpoint);
    vi.stubEnv("AWS_SDK_UA_APP_ID", "decoy-app");
    onTestFinished(() => void vi.unstubAllEnvs());

    expect(await createDynamoDbManualStore(dynamoDb.table()).getManual(manual.id)).toBeUndefined();

    expect(decoy.requests).toEqual([]);
    expect(dynamoDb.requests).toHaveLength(1);
    const [request] = dynamoDb.requests;
    expect(signedWith(request!)).toEqual({ accessKeyId: DYNAMODB_LOCAL_CREDENTIALS.accessKeyId, sessionToken: undefined });
    expect(request!.headers.authorization).toContain("/us-west-2/dynamodb/aws4_request");
    expect(request!.headers["user-agent"]).not.toContain("decoy-app");
  });

  it("signs with a role's temporary keys and their session token", async () => {
    const dynamoDb = await standInDynamoDb();
    const credentials = { kind: "keys", accessKeyId: "ASIAROLEKEY", secretAccessKey: "x", sessionToken: "the-session" } as const;

    await createDynamoDbManualStore(dynamoDb.table(credentials)).getManual(manual.id);

    expect(dynamoDb.requests.map(signedWith)).toEqual([{ accessKeyId: "ASIAROLEKEY", sessionToken: "the-session" }]);
  });

  it("refuses fixed keys that are empty rather than looking for others", async () => {
    const dynamoDb = await standInDynamoDb();
    const credentials = { kind: "keys", accessKeyId: "", secretAccessKey: "x" } as const;
    expect(() => createDynamoDbManualStore(dynamoDb.table(credentials))).toThrow(
      "needs an access key ID and a secret access key",
    );
  });

  it("takes the execution role's from the container credentials endpoint, and keeps them while they last", async () => {
    const dynamoDb = await standInDynamoDb();
    const endpoint = await standInCredentialsEndpoint(60 * 60_000);
    const credentials = { kind: "container-endpoint", fullUri: endpoint.fullUri, authorizationToken: "the-token" } as const;
    const store = createDynamoDbManualStore(dynamoDb.table(credentials));

    await store.getManual(manual.id);
    await store.getManual(manual.id);

    expect(endpoint.authorizations).toEqual(["the-token"]);
    expect(dynamoDb.requests.map(signedWith)).toEqual([
      { accessKeyId: "AKIACONTAINER1", sessionToken: "token-1" },
      { accessKeyId: "AKIACONTAINER1", sessionToken: "token-1" },
    ]);
  });

  it("uses only the container credentials endpoint and token it is given, whatever the environment names", async () => {
    const dynamoDb = await standInDynamoDb();
    const endpoint = await standInCredentialsEndpoint(60 * 60_000);
    const folder = await tempDataDir();
    await writeFile(path.join(folder, "token"), "decoy-token-from-a-file");
    vi.stubEnv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "/decoy-relative-uri");
    vi.stubEnv("AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE", path.join(folder, "token"));
    vi.stubEnv("AWS_CONTAINER_AUTHORIZATION_TOKEN", "decoy-token");
    onTestFinished(() => void vi.unstubAllEnvs());
    const credentials = { kind: "container-endpoint", fullUri: endpoint.fullUri, authorizationToken: "the-token" } as const;

    await createDynamoDbManualStore(dynamoDb.table(credentials)).getManual(manual.id);

    expect(endpoint.authorizations).toEqual(["the-token"]);
    expect(dynamoDb.requests.map(signedWith)).toEqual([{ accessKeyId: "AKIACONTAINER1", sessionToken: "token-1" }]);
  });

  it("fetches the execution role's again from the container credentials endpoint as they near expiry", async () => {
    const dynamoDb = await standInDynamoDb();
    const endpoint = await standInCredentialsEndpoint(60_000);
    const credentials = { kind: "container-endpoint", fullUri: endpoint.fullUri, authorizationToken: "the-token" } as const;
    const store = createDynamoDbManualStore(dynamoDb.table(credentials));

    await store.getManual(manual.id);
    await store.getManual(manual.id);

    const [first, second] = dynamoDb.requests.map(signedWith);
    expect(second!.accessKeyId).not.toBe(first!.accessKeyId);
    for (const { accessKeyId, sessionToken } of [first!, second!]) {
      expect(sessionToken).toBe(accessKeyId!.replace("AKIACONTAINER", "token-"));
    }
    expect(new Set(endpoint.authorizations)).toEqual(new Set(["the-token"]));
  });

  it("takes the execution role's from the environment, read whenever the client asks", async () => {
    const dynamoDb = await standInDynamoDb();
    const store = createDynamoDbManualStore(dynamoDb.table({ kind: "environment", expiresAt: undefined }));
    onTestFinished(() => void vi.unstubAllEnvs());
    const expiringSoon = () => vi.stubEnv("AWS_CREDENTIAL_EXPIRATION", new Date(Date.now() + 60_000).toISOString());

    for (const n of [1, 2]) {
      vi.stubEnv("AWS_ACCESS_KEY_ID", `AKIAENVIRONMENT${n}`);
      vi.stubEnv("AWS_SECRET_ACCESS_KEY", `secret-${n}`);
      vi.stubEnv("AWS_SESSION_TOKEN", `token-${n}`);
      expiringSoon();
      await store.getManual(manual.id);
    }

    expect(dynamoDb.requests.map(signedWith)).toEqual([
      { accessKeyId: "AKIAENVIRONMENT1", sessionToken: "token-1" },
      { accessKeyId: "AKIAENVIRONMENT2", sessionToken: "token-2" },
    ]);
  });
});

describe("the DynamoDB client's refused keys", { timeout: 30_000 }, () => {
  for (const [name, body] of Object.entries(KEYS_REFUSED_BODIES)) {
    it(`are reported with the failed call's error, as ${name}`, async () => {
      const dynamoDb = await standInDynamoDb(() => ({ status: 400, body }));
      const onKeysRefused = vi.fn();
      const store = createDynamoDbManualStore({ ...dynamoDb.table(), onKeysRefused });

      await expect(store.getManual(manual.id)).rejects.toMatchObject({ name });
      expect(onKeysRefused).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name }));
      expect(dynamoDb.requests).toHaveLength(1);
    });
  }

  it("are reported from a lease's renewals too, which go on failing quietly", async () => {
    const dynamoDb = await standInDynamoDb((operation, count) =>
      operation === "UpdateItem" && count > 1 ? { status: 400, body: KEYS_REFUSED_BODIES.ExpiredTokenException } : undefined,
    );
    const onKeysRefused = vi.fn();
    const leases = createDynamoDbSectionLeases({ ...dynamoDb.table(), onKeysRefused }, { durationMs: 1_500, renewEveryMs: 50 });
    const lease = (await leases.take(manual.id, "s"))!;
    onTestFinished(() => lease.release());

    await waitUntil(() => onKeysRefused.mock.calls.length > 0);
    expect(onKeysRefused).toHaveBeenCalledWith(expect.objectContaining({ name: "ExpiredTokenException" }));
  });

  it("are the only failures reported", async () => {
    const dynamoDb = await standInDynamoDb(() => throttled);
    const onKeysRefused = vi.fn();
    const store = createDynamoDbManualStore({ ...dynamoDb.table(), onKeysRefused });

    await expect(store.getManual(manual.id)).rejects.toMatchObject({ name: "ThrottlingException" });
    expect(onKeysRefused).not.toHaveBeenCalled();
  });
});
