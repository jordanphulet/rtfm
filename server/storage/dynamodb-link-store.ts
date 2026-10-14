import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { documentClient, queryPartition, type DynamoDbTable } from "./dynamodb-manual-store.ts";
import {
  checkedDigest,
  isSameLink,
  noActivity,
  type LibraryActivity,
  type LibraryLink,
  type LinkStore,
} from "./library-links.ts";
import { checkedRecipientLibraryId } from "./library.ts";

const LINK = "LINK";
const ACTIVITY = "ACTIVITY";
const LINK_ATTRIBUTES = "sk, libraryId, label, createdAt, revokedAt";
const ACTIVITY_ATTRIBUTES =
  "sk, firstUsedAt, lastUsedAt, opens, sectionsRead, librarianMessages, manualsCreated, sectionsWritten";

const linkKey = (digest: string) => ({ pk: LINK, sk: checkedDigest(digest) });
const activityKey = (libraryId: string) => ({ pk: ACTIVITY, sk: checkedRecipientLibraryId(libraryId) });

/** An item, a key or expression values, as the document client takes and gives them. */
type Item = Record<string, unknown>;

const linkFrom = ({ pk: _, sk, ...link }: Item) => ({ digest: sk, ...link }) as LibraryLink;
const activityFrom = ({ pk: _, sk, ...activity }: Item): LibraryActivity => ({
  ...noActivity(sk as string),
  ...activity,
});

/** Links in the partition `LINK` of `rtfm-app`, by digest, and activity in `ACTIVITY`, by library. */
export function createDynamoDbLinkStore(table: DynamoDbTable): LinkStore {
  const client = documentClient(table);
  const TableName = table.name;

  async function getItem(Key: Item): Promise<Item | undefined> {
    return (await client.send(new GetCommand({ TableName, Key, ConsistentRead: true }))).Item;
  }

  async function findLink(digest: string): Promise<LibraryLink | undefined> {
    const item = await getItem(linkKey(digest));
    return item === undefined ? undefined : linkFrom(item);
  }

  async function updateActivity(
    libraryId: string,
    UpdateExpression: string,
    values: Item,
    names?: Record<string, string>,
  ) {
    await client.send(
      new UpdateCommand({
        TableName,
        Key: activityKey(libraryId),
        UpdateExpression,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: names,
      }),
    );
  }

  return {
    async createLink(link) {
      const { digest, ...stored } = link;
      try {
        await client.send(
          new PutCommand({
            TableName,
            Item: { ...linkKey(digest), ...stored, libraryId: checkedRecipientLibraryId(link.libraryId) },
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
        return "created";
      } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException)) throw error;
        // The SDK may have retried a create whose answer was lost, and found its own link.
        return isSameLink(await findLink(digest), link) ? "created" : "exists";
      }
    },

    findLink,

    async listLinks() {
      return (await queryPartition(client, TableName, LINK, LINK_ATTRIBUTES)).map(linkFrom);
    },

    async revokeLink(libraryId, revokedAt) {
      const links = await queryPartition(client, TableName, LINK, "sk", {
        FilterExpression: "libraryId = :libraryId",
        ExpressionAttributeValues: { ":libraryId": checkedRecipientLibraryId(libraryId) },
      });
      if (links.length === 0) return "no-link";
      let revoked = false;
      for (const { sk } of links) {
        try {
          await client.send(
            new UpdateCommand({
              TableName,
              Key: { pk: LINK, sk },
              UpdateExpression: "SET revokedAt = :revokedAt",
              ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(revokedAt)",
              ExpressionAttributeValues: { ":revokedAt": revokedAt },
            }),
          );
          revoked = true;
        } catch (error) {
          if (!(error instanceof ConditionalCheckFailedException)) throw error;
        }
      }
      return revoked ? "revoked" : "already-revoked";
    },

    async recordOpen(libraryId, at) {
      await updateActivity(libraryId, "SET firstUsedAt = if_not_exists(firstUsedAt, :at) ADD opens :one", {
        ":at": at,
        ":one": 1,
      });
    },

    async recordLastUse(libraryId, at) {
      try {
        await client.send(
          new UpdateCommand({
            TableName,
            Key: activityKey(libraryId),
            UpdateExpression: "SET lastUsedAt = :at",
            ConditionExpression: "attribute_not_exists(lastUsedAt) OR lastUsedAt < :at",
            ExpressionAttributeValues: { ":at": at },
          }),
        );
      } catch (error) {
        // A later use is already kept.
        if (!(error instanceof ConditionalCheckFailedException)) throw error;
      }
    },

    async count(libraryId, counter) {
      await updateActivity(libraryId, "ADD #counter :one", { ":one": 1 }, { "#counter": counter });
    },

    async getActivity(libraryId) {
      const item = await getItem(activityKey(libraryId));
      return item === undefined ? noActivity(libraryId) : activityFrom(item);
    },

    async listActivity() {
      return (await queryPartition(client, TableName, ACTIVITY, ACTIVITY_ATTRIBUTES)).map(activityFrom);
    },
  };
}
