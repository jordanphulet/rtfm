import { randomUUID } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { inject, onTestFinished } from "vitest";
import { createAppTable, type DynamoDbTable } from "./dynamodb-manual-store.ts";

/** What `scripts/test-global-setup.ts` provides: DynamoDB Local's endpoint, or why it isn't running. */
export type DynamoDbLocalContext = { endpoint: string } | { unavailable: string };

declare module "vitest" {
  export interface ProvidedContext {
    dynamoDbLocal: DynamoDbLocalContext;
  }
}

/** DynamoDB Local takes any key; these never reach AWS. */
export const DYNAMODB_LOCAL_CREDENTIALS = {
  kind: "keys",
  accessKeyId: "AKIADYNAMODBLOCAL",
  secretAccessKey: "dynamodb-local-secret",
} as const;
export const DYNAMODB_LOCAL_REGION = "us-west-2";

/** DynamoDB Local's endpoint for this test run, or an error saying why it isn't running. */
export function dynamoDbLocalEndpoint(): string {
  const dynamoDbLocal = inject("dynamoDbLocal");
  if ("unavailable" in dynamoDbLocal) throw new Error(dynamoDbLocal.unavailable);
  return dynamoDbLocal.endpoint;
}

/** A new, empty table shaped as `rtfm-app` in DynamoDB Local, of this test's own. */
export async function testAppTable(): Promise<DynamoDbTable> {
  const table = {
    name: `rtfm-test-${randomUUID()}`,
    region: DYNAMODB_LOCAL_REGION,
    endpoint: dynamoDbLocalEndpoint(),
    credentials: DYNAMODB_LOCAL_CREDENTIALS,
  };
  await createAppTable(table);
  return table;
}

/** What DynamoDB answers, with status 400, a request signed with an expired session token, and with keys it doesn't know. */
export const KEYS_REFUSED_BODIES = {
  ExpiredTokenException: {
    __type: "com.amazon.coral.service#ExpiredTokenException",
    message: "The security token included in the request is expired",
  },
  UnrecognizedClientException: {
    __type: "com.amazon.coral.service#UnrecognizedClientException",
    message: "The security token included in the request is invalid.",
  },
};

/**
 * A stand-in for DynamoDB on loopback that passes each request on to the table's DynamoDB Local
 * until `refuseKeys()`, and from then on answers each as DynamoDB answers an expired session token.
 */
export async function keyRefusingDynamoDb(table: DynamoDbTable) {
  let refusing = false;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request.setEncoding("utf8")) body += chunk;
    const answer = refusing
      ? { status: 400, text: JSON.stringify(KEYS_REFUSED_BODIES.ExpiredTokenException) }
      : await passOn(table.endpoint, request.headers, body);
    response.writeHead(answer.status, { "content-type": "application/x-amz-json-1.0" }).end(answer.text);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    refuseKeys: () => void (refusing = true),
  };
}

/** DynamoDB Local keeps a database for each access key, which it reads from the signature. */
async function passOn(endpoint: string, headers: IncomingHttpHeaders, body: string) {
  const names = ["authorization", "content-type", "x-amz-date", "x-amz-security-token", "x-amz-target"];
  const passed = await fetch(endpoint, {
    method: "POST",
    headers: Object.fromEntries(names.filter((name) => headers[name]).map((name) => [name, String(headers[name])])),
    body,
  });
  return { status: passed.status, text: await passed.text() };
}
