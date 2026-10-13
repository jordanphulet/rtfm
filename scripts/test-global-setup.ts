import type { TestProject } from "vitest/node";
import type { DynamoDbLocalContext } from "../server/storage/dynamodb-testing.ts";
import { startDynamoDbLocal } from "./dynamodb-local.ts";

/**
 * Vitest's global setup: DynamoDB Local for the whole run, stopped after it. When it can't start,
 * the tests that need it fail with the reason, which says how to fetch it when it's missing.
 */
export default async function setup(project: TestProject): Promise<(() => Promise<void>) | undefined> {
  let context: DynamoDbLocalContext;
  let stop: (() => Promise<void>) | undefined;
  try {
    const dynamoDbLocal = await startDynamoDbLocal();
    context = { endpoint: dynamoDbLocal.endpoint };
    stop = dynamoDbLocal.stop;
  } catch (error) {
    context = { unavailable: (error as Error).message };
  }
  project.provide("dynamoDbLocal", context);
  return stop;
}
