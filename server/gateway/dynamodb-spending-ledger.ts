import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, GetCommand, PutCommand, paginateQuery } from "@aws-sdk/lib-dynamodb";
import { monthOf } from "../storage/file-ledger.ts";
import { documentClient, transactWrite, type DynamoDbTable } from "../storage/dynamodb-manual-store.ts";
import type { LedgerEntry, ReserveEntry, SettleEntry } from "../storage/types.ts";
import { chargedUsd, dayOf, type LedgerCall } from "./ledger-calls.ts";
import type { SpendingLedger } from "./spending-ledger.ts";
import { SpendingRefused } from "./types.ts";

/** The kill switch is on while this item exists. Its own partition, which `rtfm-ops` is limited to. */
export const KILL_SWITCH_KEY = { pk: "KILL_SWITCH", sk: "KILL_SWITCH" };
const totalKey = (period: string) => ({ pk: "TOTAL", sk: period });
const callKey = (reservedAt: string, callId: string) => ({
  pk: `LEDGER#${monthOf(reservedAt)}`,
  sk: `${reservedAt}#${callId}`,
});

interface CallItem {
  reserve: ReserveEntry;
  settle?: SettleEntry;
}

export interface DynamoDbSpendingLedger extends SpendingLedger {
  /**
   * Copies a call from another ledger and adds what it was charged to its day and month, whatever
   * the caps; a call already in the table is left as it is.
   */
  importCall(call: LedgerCall): Promise<"imported" | "already-there">;
}

/**
 * The table `rtfm-usage` (`server/gateway/README.md` › The table `rtfm-usage`), which every server
 * running Bedrock shares, on this machine or deployed: reserving is one conditional transaction, so
 * the caps hold across every process.
 */
export function createDynamoDbSpendingLedger(table: DynamoDbTable): DynamoDbSpendingLedger {
  const client = documentClient(table);
  const TableName = table.name;

  function addToTotal(period: string, usd: number) {
    return {
      Update: {
        TableName,
        Key: totalKey(period),
        UpdateExpression: "ADD committedUsd :usd",
        ExpressionAttributeValues: { ":usd": usd },
      },
    };
  }

  /**
   * Adds `usd` to the period's total on the condition `committed + usd <= cap`. A condition can't
   * add, so it tests `committed <= cap − usd`. A total not made yet counts as $0, unless `usd`
   * alone is over the cap.
   */
  function addWithinCap(period: string, usd: number, capUsd: number) {
    const limit = capUsd - usd;
    const withinLimit = "committedUsd <= :limit";
    const { Update } = addToTotal(period, usd);
    return {
      Update: {
        ...Update,
        ConditionExpression: limit >= 0 ? `attribute_not_exists(committedUsd) OR ${withinLimit}` : withinLimit,
        ExpressionAttributeValues: { ...Update.ExpressionAttributeValues, ":limit": limit },
      },
    };
  }

  function putCall(item: CallItem) {
    const { reservedAt, callId } = item.reserve;
    const Item = { ...callKey(reservedAt, callId), ...item };
    return { Put: { TableName, Item, ConditionExpression: "attribute_not_exists(pk)" } };
  }

  return {
    async reserve(entry, caps) {
      const { reservedAt, worstCaseUsd } = entry;
      const cancelled = await transactWrite(client, {
        TransactItems: [
          { ConditionCheck: { TableName, Key: KILL_SWITCH_KEY, ConditionExpression: "attribute_not_exists(pk)" } },
          addWithinCap(dayOf(reservedAt), worstCaseUsd, caps.dailyUsd),
          addWithinCap(monthOf(reservedAt), worstCaseUsd, caps.monthlyUsd),
          putCall({ reserve: entry }),
        ],
      });
      if (!cancelled) return;
      const failed = (cancelled.CancellationReasons ?? []).map(({ Code }) => Code === "ConditionalCheckFailed");
      const [killSwitch, day, month] = failed;
      if (killSwitch) throw new SpendingRefused("kill-switch");
      if (day) throw new SpendingRefused("daily-cap");
      if (month) throw new SpendingRefused("monthly-cap");
      throw cancelled;
    },

    async settle(entry, worstCaseUsd) {
      const { reservedAt, callId, usd } = entry;
      const cancelled = await transactWrite(client, {
        TransactItems: [
          {
            Update: {
              TableName,
              Key: callKey(reservedAt, callId),
              UpdateExpression: "SET settle = :settle",
              ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(settle)",
              ExpressionAttributeValues: { ":settle": entry },
            },
          },
          addToTotal(dayOf(reservedAt), usd - worstCaseUsd),
          addToTotal(monthOf(reservedAt), usd - worstCaseUsd),
        ],
      });
      if (cancelled) throw cancelled;
    },

    async entriesForMonth(month) {
      const entries: LedgerEntry[] = [];
      const pages = paginateQuery(
        { client },
        {
          TableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": `LEDGER#${month}` },
          ConsistentRead: true,
        },
      );
      for await (const page of pages) {
        for (const { reserve, settle } of (page.Items ?? []) as CallItem[]) {
          entries.push(reserve);
          if (settle) entries.push(settle);
        }
      }
      return entries;
    },

    async killSwitchOn() {
      const { Item } = await client.send(new GetCommand({ TableName, Key: KILL_SWITCH_KEY, ConsistentRead: true }));
      return Item !== undefined;
    },

    async importCall(call) {
      const { callId, reservedAt, job, model, worstCaseUsd, settle } = call;
      const reserve: ReserveEntry = { kind: "reserve", callId, reservedAt, job, model, worstCaseUsd };
      const cancelled = await transactWrite(client, {
        TransactItems: [
          putCall({ reserve, settle }),
          addToTotal(dayOf(reservedAt), chargedUsd(call)),
          addToTotal(monthOf(reservedAt), chargedUsd(call)),
        ],
      });
      if (!cancelled) return "imported";
      if (cancelled.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") return "already-there";
      throw cancelled;
    },
  };
}

/**
 * Turns the kill switch on or off: `npm run ops -- kill-switch`, as `rtfm-ops`, and the tests. The
 * server never calls it, and `rtfm-local` may not delete the item (`README.md` › Bedrock's
 * spending: the table `rtfm-usage`).
 */
export async function setKillSwitch(table: DynamoDbTable, on: boolean): Promise<void> {
  const client = documentClient(table);
  const TableName = table.name;
  if (on) await client.send(new PutCommand({ TableName, Item: KILL_SWITCH_KEY }));
  else await client.send(new DeleteCommand({ TableName, Key: KILL_SWITCH_KEY }));
}

/** Creates an empty table shaped as `rtfm-usage`, for DynamoDB Local; `RtfmApp` creates the real one. */
export async function createUsageTable(table: DynamoDbTable): Promise<void> {
  await documentClient(table).send(
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
