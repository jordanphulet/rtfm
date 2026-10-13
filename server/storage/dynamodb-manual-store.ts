import {
  ConditionalCheckFailedException,
  CreateTableCommand,
  DynamoDBClient,
  TransactionCanceledException,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import { fromEnv } from "@aws-sdk/credential-provider-env";
import { fromHttp } from "@aws-sdk/credential-provider-http";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  paginateQuery,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { ID_PATTERN, isSameManual } from "./manual.ts";
import type { ManualStore, StoredManual } from "./types.ts";

/** A table shaped as `rtfm-app` (`server/storage/README.md` › The table `rtfm-app`), and how to reach it. */
export interface DynamoDbTable {
  name: string;
  region: string;
  endpoint: string;
  credentials: TableCredentials;
}

/**
 * Fixed keys (DynamoDB Local's, in tests), or the Web Function's execution role, through Lambda's
 * container credentials endpoint, which hands out new ones whenever the client asks as they near
 * expiry, or the variables Lambda sets, which a running process can't see change, so those are
 * never renewed (`server/README.md` › The Web Function).
 */
export type TableCredentials =
  | { kind: "keys"; accessKeyId: string; secretAccessKey: string }
  | { kind: "container-endpoint"; fullUri: string; authorizationToken: string | undefined }
  | { kind: "environment" };

const CREDENTIAL_CHAIN_REFUSED = "The AWS default credential chain is never used";
/** One transaction holds at most 100 items: the manual and 99 sections. */
export const MOST_SECTIONS_DELETED_AT_ONCE = 99;
export const TRANSACTION_ATTEMPTS = 8;

const LIBRARY = "LIBRARY";
const SEEDED = "SEEDED";
const MANUAL_PREFIX = "MANUAL#";
const SECTION_PREFIX = "SECTION#";

const manualKey = (manualId: string) => ({ pk: LIBRARY, sk: `${MANUAL_PREFIX}${checkedId(manualId)}` });
const sectionKey = (manualId: string, sectionId: string) => ({
  pk: `${MANUAL_PREFIX}${checkedId(manualId)}`,
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

  async function queryPartition(pk: string, ProjectionExpression: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    const pages = paginateQuery(
      { client },
      {
        TableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ProjectionExpression,
        ConsistentRead: true,
      },
    );
    for await (const page of pages) items.push(...(page.Items ?? []));
    return items;
  }

  /** Runs a transaction again while another one touching the same items gets in its way. */
  async function transactWrite(input: TransactWriteCommandInput): Promise<TransactionCanceledException | undefined> {
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

  return {
    async listManuals() {
      const items = await queryPartition(LIBRARY, "manual");
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
        if (written.length > MOST_SECTIONS_DELETED_AT_ONCE) {
          throw new Error(`"${manualId}" has ${written.length} written sections, more than one delete can remove`);
        }
        const unchanged = written.length === 0 ? "attribute_not_exists(written)" : "written = :written";
        const cancelled = await transactWrite({
          TransactItems: [
            {
              Delete: {
                TableName,
                Key: manualKey(manualId),
                ConditionExpression: `attribute_exists(pk) AND ${unchanged}`,
                ExpressionAttributeValues: written.length === 0 ? undefined : { ":written": new Set(written) },
              },
            },
            ...written.map((sectionId) => ({ Delete: { TableName, Key: sectionKey(manualId, sectionId) } })),
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
      const cancelled = await transactWrite({
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
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
        ],
      });
      if (!cancelled) return "saved";
      const [manualCheck, sectionCheck] = cancelled.CancellationReasons ?? [];
      if (manualCheck?.Code === "ConditionalCheckFailed") {
        throw new Error(`There is no manual "${manualId}" to save a section into`);
      }
      if (sectionCheck?.Code === "ConditionalCheckFailed") return "already-written";
      throw cancelled;
    },

    async writtenSectionIds(manualId) {
      return [...((await getManualItem(manualId))?.written ?? [])];
    },

    async seededManualIds() {
      const items = await queryPartition(SEEDED, "sk");
      return items.map(({ sk }) => (sk as string).slice(MANUAL_PREFIX.length));
    },

    async markSeeded(manualId) {
      await client.send(new PutCommand({ TableName, Item: seededKey(manualId) }));
    },
  };
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

function documentClient(table: DynamoDbTable): DynamoDBDocumentClient {
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
      return { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey };
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
function pause(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * 20 * attempt));
}

function checkedId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Not a valid id: "${id}"`);
  return id;
}
