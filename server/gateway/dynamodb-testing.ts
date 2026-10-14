import { randomUUID } from "node:crypto";
import type { DynamoDbTable } from "../storage/dynamodb-manual-store.ts";
import { DYNAMODB_LOCAL_CREDENTIALS, DYNAMODB_LOCAL_REGION, dynamoDbLocalEndpoint } from "../storage/dynamodb-testing.ts";
import { createUsageTable } from "./dynamodb-spending-ledger.ts";

/** A new, empty table shaped as `rtfm-usage` in DynamoDB Local, of this test's own. */
export async function testUsageTable(): Promise<DynamoDbTable> {
  const table = {
    name: `rtfm-test-usage-${randomUUID()}`,
    region: DYNAMODB_LOCAL_REGION,
    endpoint: dynamoDbLocalEndpoint(),
    credentials: DYNAMODB_LOCAL_CREDENTIALS,
  };
  await createUsageTable(table);
  return table;
}
