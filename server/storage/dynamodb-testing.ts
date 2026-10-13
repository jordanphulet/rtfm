import { randomUUID } from "node:crypto";
import { inject } from "vitest";
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
