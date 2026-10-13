import { describe, expect, it } from "vitest";
import { dynamoDbLocalEndpoint } from "../server/storage/dynamodb-testing.ts";
import { tempDataDir } from "../server/testing.ts";
import { NO_PAGE_ORIGIN, startDynamoDbLocal } from "./dynamodb-local.ts";

describe("startDynamoDbLocal", () => {
  it("says how to fetch DynamoDB Local when it isn't there", async () => {
    const empty = await tempDataDir();
    await expect(startDynamoDbLocal(empty)).rejects.toThrow(
      `DynamoDB Local isn't in ${empty}. Run \`npm run fetch-dynamodb-local\` once (it needs Java 17 or newer).`,
    );
  });

  it("lets no page in a browser call it", async () => {
    const preflight = (origin: string) =>
      fetch(dynamoDbLocalEndpoint(), {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "x-amz-target" },
      });
    expect((await preflight("http://localhost:5173")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await preflight(NO_PAGE_ORIGIN)).headers.get("access-control-allow-origin")).toBe(NO_PAGE_ORIGIN);
  });
});
