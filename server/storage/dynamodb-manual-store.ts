import {
  ConditionalCheckFailedException,
  CreateTableCommand,
  DynamoDBClient,
  TransactionCanceledException,
  type AttributeValue,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import { fromEnv } from "@aws-sdk/credential-provider-env";
import { fromHttp } from "@aws-sdk/credential-provider-http";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
  paginateQuery,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ID_PATTERN, isSameManual } from "./manual.ts";
import type { ManualStore, SectionLease, SectionLeases, StoredManual } from "./types.ts";

/** A DynamoDB table, `rtfm-app` or `rtfm-usage`, and how to reach it. */
export interface DynamoDbTable {
  name: string;
  region: string;
  endpoint: string;
  credentials: TableCredentials;
}

/**
 * Fixed keys (DynamoDB Local's, in tests; a role's temporary ones, with their session token, for
 * the ops tools), or the Web Function's execution role, through Lambda's
 * container credentials endpoint, which hands out new ones whenever the client asks as they near
 * expiry, or the variables Lambda sets, which a running process can't see change, so those are
 * never renewed (`server/README.md` › The Web Function).
 */
export type TableCredentials =
  | { kind: "keys"; accessKeyId: string; secretAccessKey: string; sessionToken?: string }
  | { kind: "container-endpoint"; fullUri: string; authorizationToken: string | undefined }
  | { kind: "environment" };

const CREDENTIAL_CHAIN_REFUSED = "The AWS default credential chain is never used";
/** One transaction holds at most 100 items: the manual and 99 section items. */
export const MOST_SECTIONS_DELETED_AT_ONCE = 99;
export const TRANSACTION_ATTEMPTS = 8;

/** How long a section's lease lasts, and how often its holder renews it. */
export interface LeaseTiming {
  durationMs: number;
  renewEveryMs: number;
}

/** Why these lengths: `server/storage/README.md` › Section leases. */
export const SECTION_LEASE_TIMING: LeaseTiming = { durationMs: 20_000, renewEveryMs: 5_000 };
/** A holder counts its lease lost at this share of its length after its latest successful renewal was sent. */
const FENCE_AT = 0.9;
/** A section's item that still holds the lease of `:owner`, and no body. */
const LEASED_TO_OWNER = "leaseOwner = :owner AND attribute_not_exists(body)";

const LIBRARY = "LIBRARY";
const SEEDED = "SEEDED";
const MANUAL_PREFIX = "MANUAL#";
const SECTION_PREFIX = "SECTION#";

const manualKey = (manualId: string) => ({ pk: LIBRARY, sk: `${MANUAL_PREFIX}${checkedId(manualId)}` });
/** The partition of a manual's section items. */
const sectionsPartition = (manualId: string) => `${MANUAL_PREFIX}${checkedId(manualId)}`;
const sectionKey = (manualId: string, sectionId: string) => ({
  pk: sectionsPartition(manualId),
  sk: `${SECTION_PREFIX}${checkedId(sectionId)}`,
});
const seededKey = (manualId: string) => ({ pk: SEEDED, sk: `${MANUAL_PREFIX}${checkedId(manualId)}` });

interface ManualItem {
  manual: StoredManual;
  /** The ids of the manual's written sections; absent until the first is saved. */
  written?: Set<string>;
}

export function createDynamoDbManualStore(table: DynamoDbTable): ManualStore {
  const client = documentClient(table);
  const TableName = table.name;

  async function getManualItem(manualId: string): Promise<ManualItem | undefined> {
    const { Item } = await client.send(new GetCommand({ TableName, Key: manualKey(manualId), ConsistentRead: true }));
    return Item as ManualItem | undefined;
  }

  return {
    async listManuals() {
      const items = await queryPartition(client, TableName, LIBRARY, "manual");
      return items.map((item) => (item as unknown as ManualItem).manual);
    },

    async getManual(manualId) {
      if (!ID_PATTERN.test(manualId)) return undefined;
      return (await getManualItem(manualId))?.manual;
    },

    async createManual(manual) {
      try {
        await client.send(
          new PutCommand({
            TableName,
            Item: { ...manualKey(manual.id), manual },
            ConditionExpression: "attribute_not_exists(pk)",
          }),
        );
        return "created";
      } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException)) throw error;
        // The SDK may have retried a create whose answer was lost, and found its own manual.
        return isSameManual((await getManualItem(manual.id))?.manual, manual) ? "created" : "exists";
      }
    },

    async deleteManual(manualId) {
      for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt++) {
        const item = await getManualItem(manualId);
        if (!item) return;
        const written = [...(item.written ?? [])];
        // The written sections' items, and any unwritten section's item that holds only a lease.
        const sectionItems = await queryPartition(client, TableName, sectionsPartition(manualId), "pk, sk");
        if (sectionItems.length > MOST_SECTIONS_DELETED_AT_ONCE) {
          throw new Error(`"${manualId}" has ${sectionItems.length} section items, more than one delete can remove`);
        }
        const unchanged = written.length === 0 ? "attribute_not_exists(written)" : "written = :written";
        const cancelled = await transactWrite(client, {
          TransactItems: [
            {
              Delete: {
                TableName,
                Key: manualKey(manualId),
                ConditionExpression: `attribute_exists(pk) AND ${unchanged}`,
                ExpressionAttributeValues: written.length === 0 ? undefined : { ":written": new Set(written) },
              },
            },
            ...sectionItems.map(({ pk, sk }) => ({ Delete: { TableName, Key: { pk, sk } } })),
          ],
        });
        if (!cancelled) return;
        const [manualCheck] = cancelled.CancellationReasons ?? [];
        if (manualCheck?.Code !== "ConditionalCheckFailed") throw cancelled;
        await pause(attempt);
      }
      throw new Error(`Deleting "${manualId}" kept losing to sections being saved into it`);
    },

    async getBody(manualId, sectionId) {
      const { Item } = await client.send(
        new GetCommand({ TableName, Key: sectionKey(manualId, sectionId), ConsistentRead: true }),
      );
      return Item?.body as string | undefined;
    },

    async saveBody(manualId, sectionId, body) {
      const saved = await saveBodyIf(client, TableName, { manualId, sectionId, body });
      return saved === "refused" ? "already-written" : saved;
    },

    async writtenSectionIds(manualId) {
      return [...((await getManualItem(manualId))?.written ?? [])];
    },

    async seededManualIds() {
      const items = await queryPartition(client, TableName, SEEDED, "sk");
      return items.map(({ sk }) => (sk as string).slice(MANUAL_PREFIX.length));
    },

    async markSeeded(manualId) {
      await client.send(new PutCommand({ TableName, Item: seededKey(manualId) }));
    },
  };
}

/**
 * Section leases on the section's own item, shared by every environment on the table: a writer
 * takes one with a conditional write, renews it while it writes, and alone may save the body.
 */
export function createDynamoDbSectionLeases(table: DynamoDbTable, timing = SECTION_LEASE_TIMING): SectionLeases {
  const client = documentClient(table);
  const TableName = table.name;
  const environment = randomUUID();

  /**
   * A lease taken with a write sent at `takenAt`. It counts itself lost a tenth of its length before
   * it would expire unrenewed, so its holder has stopped before another writer can take it.
   */
  function heldLease(manualId: string, sectionId: string, owner: string, takenAt: number): SectionLease {
    const Key = sectionKey(manualId, sectionId);
    const name = `${manualId}/${sectionId}`;
    const lost = new AbortController();
    let renewing: NodeJS.Timeout | undefined = setInterval(renew, timing.renewEveryMs);
    let latestSentAt = takenAt;
    let fencing = fenceAfter(takenAt);
    /** Once the body is saved, it has replaced the lease on the item, and there is nothing to release. */
    let bodySaved = false;

    /** Loses the lease once the write sent at `sentAt` would let it expire, unless a later one succeeds. */
    function fenceAfter(sentAt: number): NodeJS.Timeout {
      const expiring = new Error(`Couldn't renew the lease on ${name} before it expired`);
      return setTimeout(() => lose(expiring), sentAt + timing.durationMs * FENCE_AT - Date.now());
    }

    function stopRenewing() {
      clearInterval(renewing);
      clearTimeout(fencing);
      renewing = undefined;
    }

    /** Whether the item, as a failed condition returned it, still holds this owner's lease and no body. */
    function stillOwned(item: Record<string, AttributeValue> | undefined): boolean {
      return item?.leaseOwner?.S === owner && item.body === undefined;
    }

    function lose(reason: Error) {
      if (renewing === undefined) return;
      stopRenewing();
      lost.abort(reason);
    }

    /**
     * Moves the expiry later, never earlier: the SDK resends a renewal's expiry as it was first
     * sent, so a retry that arrives after a later renewal must not shorten the lease.
     */
    async function renew() {
      const sentAt = Date.now();
      try {
        await client.send(
          new UpdateCommand({
            TableName,
            Key,
            UpdateExpression: "SET leaseExpiresAt = :expiresAt",
            ConditionExpression: `${LEASED_TO_OWNER} AND leaseExpiresAt < :expiresAt`,
            ExpressionAttributeValues: { ":owner": owner, ":expiresAt": sentAt + timing.durationMs },
            ReturnValuesOnConditionCheckFailure: "ALL_OLD",
          }),
        );
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException && !stillOwned(error.Item)) {
          lose(new Error(`The lease on ${name} is no longer this writer's`));
        }
        // A later expiry under this owner was a stale retry. Any other failure is tried again at
        // the next renewal, until the fence.
        return;
      }
      if (renewing === undefined || sentAt <= latestSentAt) return;
      latestSentAt = sentAt;
      clearTimeout(fencing);
      fencing = fenceAfter(sentAt);
    }

    return {
      lost: lost.signal,

      async saveBody(body) {
        stopRenewing();
        if (lost.signal.aborted) throw new Error(`The lease on ${name} was lost before its body was saved`);
        const saved = await saveBodyIf(client, TableName, { manualId, sectionId, body, leaseOwner: owner });
        if (saved === "refused" && !(await bodyIsStored(client, TableName, manualId, sectionId))) {
          throw new Error(`The lease on ${name} was lost before its body was saved`);
        }
        bodySaved = true;
        // Refused with a body stored: one saved without a lease, as the seed saves.
        return saved === "refused" ? "already-written" : saved;
      },

      async release() {
        stopRenewing();
        if (bodySaved) return;
        try {
          await client.send(
            new DeleteCommand({
              TableName,
              Key,
              ConditionExpression: LEASED_TO_OWNER,
              ExpressionAttributeValues: { ":owner": owner },
            }),
          );
        } catch (error) {
          if (!(error instanceof ConditionalCheckFailedException)) throw error;
        }
      },
    };
  }

  return {
    async take(manualId, sectionId) {
      const owner = `${environment}/${randomUUID()}`;
      const now = Date.now();
      try {
        await client.send(
          new UpdateCommand({
            TableName,
            Key: sectionKey(manualId, sectionId),
            UpdateExpression: "SET leaseOwner = :owner, leaseExpiresAt = :expiresAt",
            // Its own owner too, in case the SDK retried a take whose answer was lost.
            ConditionExpression:
              "attribute_not_exists(body) AND " +
              "(attribute_not_exists(leaseOwner) OR leaseExpiresAt < :now OR leaseOwner = :owner)",
            ExpressionAttributeValues: { ":owner": owner, ":expiresAt": now + timing.durationMs, ":now": now },
          }),
        );
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return undefined;
        throw error;
      }
      return heldLease(manualId, sectionId, owner, now);
    },

    async heldElsewhere(manualId) {
      // Expired as a take reads it: `leaseExpiresAt < :now`. A written section's item has no lease.
      const items = await queryPartition(client, TableName, sectionsPartition(manualId), "sk", {
        FilterExpression: "leaseExpiresAt >= :now AND NOT begins_with(leaseOwner, :environment)",
        ExpressionAttributeValues: { ":now": Date.now(), ":environment": `${environment}/` },
      });
      return items.map(({ sk }) => (sk as string).slice(SECTION_PREFIX.length));
    },
  };
}

/** The items of a partition that the filter keeps (all of them without one), read consistently, page by page. */
async function queryPartition(
  client: DynamoDBDocumentClient,
  TableName: string,
  pk: string,
  ProjectionExpression: string,
  filter?: { FilterExpression: string; ExpressionAttributeValues: Record<string, unknown> },
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  const pages = paginateQuery(
    { client },
    {
      TableName,
      KeyConditionExpression: "pk = :pk",
      ProjectionExpression,
      FilterExpression: filter?.FilterExpression,
      ExpressionAttributeValues: { ":pk": pk, ...filter?.ExpressionAttributeValues },
      ConsistentRead: true,
    },
  );
  for await (const page of pages) items.push(...(page.Items ?? []));
  return items;
}

/**
 * Saves a section's body and adds its id to the manual's `written` set, in one transaction, on the
 * condition that the section's item has no body and, given an owner, holds that owner's lease:
 * "refused" if it doesn't. Throws if the manual doesn't exist.
 */
async function saveBodyIf(
  client: DynamoDBDocumentClient,
  TableName: string,
  { manualId, sectionId, body, leaseOwner }: { manualId: string; sectionId: string; body: string; leaseOwner?: string },
): Promise<"saved" | "refused"> {
  const cancelled = await transactWrite(client, {
    TransactItems: [
      {
        Update: {
          TableName,
          Key: manualKey(manualId),
          UpdateExpression: "ADD written :section",
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeValues: { ":section": new Set([sectionId]) },
        },
      },
      {
        Put: {
          TableName,
          Item: { ...sectionKey(manualId, sectionId), body },
          ...(leaseOwner === undefined
            ? { ConditionExpression: "attribute_not_exists(body)" }
            : {
                ConditionExpression: LEASED_TO_OWNER,
                ExpressionAttributeValues: { ":owner": leaseOwner },
              }),
        },
      },
    ],
  });
  if (!cancelled) return "saved";
  const [manualCheck, sectionCheck] = cancelled.CancellationReasons ?? [];
  if (manualCheck?.Code === "ConditionalCheckFailed") {
    throw new Error(`There is no manual "${manualId}" to save a section into`);
  }
  if (sectionCheck?.Code === "ConditionalCheckFailed") return "refused";
  throw cancelled;
}

async function bodyIsStored(client: DynamoDBDocumentClient, TableName: string, manualId: string, sectionId: string) {
  const { Item } = await client.send(
    new GetCommand({ TableName, Key: sectionKey(manualId, sectionId), ConsistentRead: true }),
  );
  return Item?.body !== undefined;
}

/** Runs a transaction again while another one touching the same items gets in its way. */
async function transactWrite(
  client: DynamoDBDocumentClient,
  input: TransactWriteCommandInput,
): Promise<TransactionCanceledException | undefined> {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.send(new TransactWriteCommand(input));
      return undefined;
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const conflicted = error.CancellationReasons?.some(({ Code }) => Code === "TransactionConflict");
      if (!conflicted || attempt === TRANSACTION_ATTEMPTS) return error;
      await pause(attempt);
    }
  }
}

/** Creates an empty table shaped as `rtfm-app`, for DynamoDB Local; `RtfmApp` creates the real one. */
export async function createAppTable(table: DynamoDbTable): Promise<void> {
  await dynamoDbClient(table).send(
    new CreateTableCommand({
      TableName: table.name,
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
    }),
  );
}

export function documentClient(table: DynamoDbTable): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(dynamoDbClient(table), { marshallOptions: { removeUndefinedValues: true } });
}

/**
 * The client with every setting the SDK would otherwise look up in the environment or `~/.aws`
 * given here: the table's own credentials, region and endpoint, and a credential chain that throws.
 */
function dynamoDbClient({ region, endpoint, credentials }: DynamoDbTable): DynamoDBClient {
  return new DynamoDBClient({
    region,
    endpoint,
    credentials: credentialsFor(credentials),
    credentialDefaultProvider: () => async () => {
      throw new Error(CREDENTIAL_CHAIN_REFUSED);
    },
    defaultsMode: "standard",
    retryMode: "standard",
    maxAttempts: 3,
    accountIdEndpointMode: "disabled",
    authSchemePreference: [],
    useDualstackEndpoint: false,
    useFipsEndpoint: false,
    endpointDiscoveryEnabled: false,
    userAgentAppId: "rtfm",
    requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 },
  });
}

/**
 * Fixed keys as they are; the execution role's as a provider, which the client calls again
 * whenever the credentials it holds near their expiry.
 */
function credentialsFor(credentials: TableCredentials): DynamoDBClientConfig["credentials"] {
  switch (credentials.kind) {
    case "keys":
      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        throw new Error("A DynamoDB table needs an access key ID and a secret access key");
      }
      return {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      };
    case "container-endpoint":
      // Empty, not absent, so the environment's relative URI and token file can't take their place.
      return fromHttp({
        awsContainerCredentialsFullUri: credentials.fullUri,
        awsContainerAuthorizationToken: credentials.authorizationToken,
        awsContainerCredentialsRelativeUri: "",
        awsContainerAuthorizationTokenFile: "",
      });
    case "environment":
      return fromEnv();
  }
}

/** A short, growing, jittered pause before trying a transaction again. */
export function pause(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * 20 * attempt));
}

function checkedId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Not a valid id: "${id}"`);
  return id;
}
