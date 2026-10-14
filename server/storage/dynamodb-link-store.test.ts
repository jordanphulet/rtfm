import { describe, expect, it } from "vitest";
import { createDynamoDbLinkStore } from "./dynamodb-link-store.ts";
import { documentClient, queryPartition } from "./dynamodb-manual-store.ts";
import { testAppTable } from "./dynamodb-testing.ts";
import { librarySecretDigest, makeLibrarySecret } from "./library-links.ts";
import { describeLinkStore, newLink } from "./link-store-suite.ts";

describeLinkStore(
  "the DynamoDB link store",
  async () => createDynamoDbLinkStore(await testAppTable()),
  async () => createDynamoDbLinkStore({ ...(await testAppTable()), name: "rtfm-test-no-such-table" }),
);

describe("the DynamoDB link store's items", { timeout: 20_000 }, () => {
  it("keeps links in the partition LINK by digest, and activity in ACTIVITY by library, holding no secret", async () => {
    const table = await testAppTable();
    const store = createDynamoDbLinkStore(table);
    const secret = makeLibrarySecret();
    const digest = librarySecretDigest(secret);
    await store.createLink(newLink("acme", { digest }));
    await store.recordOpen("acme", "2026-10-14T10:00:00.000Z");
    await store.revokeLink("acme", "2026-10-15T09:00:00.000Z");

    const client = documentClient(table);
    const links = await queryPartition(client, table.name, "LINK", "pk, sk, libraryId, label, createdAt, revokedAt");
    const activity = await queryPartition(client, table.name, "ACTIVITY", "pk, sk, firstUsedAt, opens");
    expect(links).toEqual([expect.objectContaining({ pk: "LINK", sk: digest, libraryId: "acme" })]);
    expect(activity).toEqual([{ pk: "ACTIVITY", sk: "acme", firstUsedAt: "2026-10-14T10:00:00.000Z", opens: 1 }]);
    expect(JSON.stringify([links, activity])).not.toContain(secret);
  });

  it("is shared by every store on the table, as by every environment", async () => {
    const table = await testAppTable();
    const link = newLink("acme");
    await createDynamoDbLinkStore(table).createLink(link);
    await createDynamoDbLinkStore(table).count("acme", "sectionsWritten");

    const other = createDynamoDbLinkStore(table);
    expect(await other.findLink(link.digest)).toEqual(link);
    expect((await other.getActivity("acme")).sectionsWritten).toBe(1);
  });
});
