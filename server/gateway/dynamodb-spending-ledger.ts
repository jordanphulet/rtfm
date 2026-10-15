import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, GetCommand, PutCommand, paginateQuery } from "@aws-sdk/lib-dynamodb";
import { monthOf } from "../storage/file-ledger.ts";
import { documentClient, transactWrite, type DynamoDbTable } from "../storage/dynamodb-manual-store.ts";
import { ADMIN_LIBRARY_ID } from "../storage/library.ts";
import type { LedgerEntry, ReserveEntry, SettleEntry } from "../storage/types.ts";
import { chargedUsd, dayOf, type LedgerCall } from "./ledger-calls.ts";
import type { LibraryReservation, SpendingLedger } from "./spending-ledger.ts";
import { SpendingRefused } from "./types.ts";

/** The kill switch is on while this item exists. Its own partition, which `rtfm-ops` is limited to. */
export const KILL_SWITCH_KEY = { pk: "KILL_SWITCH", sk: "KILL_SWITCH" };
const TOTAL = "TOTAL";
const totalKey = (period: string) => ({ pk: TOTAL, sk: period });
const LIBRARY_PERIOD_PREFIX = "LIBRARY#";
/** The period of a recipient library's day's total, beside the central totals; the admin's library has none. */
const libraryDay = (libraryId: string, reservedAt: string) =>
  libraryId === ADMIN_LIBRARY_ID ? undefined : `${LIBRARY_PERIOD_PREFIX}${libraryId}#${dayOf(reservedAt)}`;
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
   * Copies a call from another ledger and adds what it was charged to its day's and month's totals,
   * and a recipient library's day's, whatever the caps; a call already in the table is left as it is.
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
      const { reservedAt, libraryId, worstCaseUsd } = entry;
      const library = libraryDay(libraryId, reservedAt);
      const cancelled = await transactWrite(client, {
        TransactItems: [
          { ConditionCheck: { TableName, Key: KILL_SWITCH_KEY, ConditionExpression: "attribute_not_exists(pk)" } },
          addWithinCap(dayOf(reservedAt), worstCaseUsd, caps.dailyUsd),
          addWithinCap(monthOf(reservedAt), worstCaseUsd, caps.monthlyUsd),
          ...(library ? [addWithinCap(library, worstCaseUsd, caps.libraryDailyUsd)] : []),
          putCall({ reserve: entry }),
        ],
      });
      if (!cancelled) return;
      const failed = (cancelled.CancellationReasons ?? []).map(({ Code }) => Code === "ConditionalCheckFailed");
      const [killSwitch, day, month, libraryCap] = failed;
      if (killSwitch) throw new SpendingRefused("kill-switch");
      if (day) throw new SpendingRefused("daily-cap");
      if (month) throw new SpendingRefused("monthly-cap");
      if (library && libraryCap) throw new SpendingRefused("library-cap");
      throw cancelled;
    },

    async settle(entry, reserved) {
      const { reservedAt, callId, libraryId } = reserved;
      const library = libraryDay(libraryId, reservedAt);
      const { usd } = entry;
      const unusedUsd = usd - reserved.worstCaseUsd;
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
          addToTotal(dayOf(reservedAt), unusedUsd),
          addToTotal(monthOf(reservedAt), unusedUsd),
          ...(library ? [addToTotal(library, unusedUsd)] : []),
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
      const { callId, reservedAt, libraryId, job, model, worstCaseUsd, settle } = call;
      const reserve: LibraryReservation = { kind: "reserve", callId, reservedAt, libraryId, job, model, worstCaseUsd };
      const library = libraryDay(libraryId, reservedAt);
      const cancelled = await transactWrite(client, {
        TransactItems: [
          putCall({ reserve, settle }),
          addToTotal(dayOf(reservedAt), chargedUsd(call)),
          addToTotal(monthOf(reservedAt), chargedUsd(call)),
          ...(library ? [addToTotal(library, chargedUsd(call))] : []),
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
 * server never calls it, and `rtfm-local` may not delete the item (`OPERATING.md` › Bedrock's
 * spending: the table `rtfm-usage`).
 */
export async function setKillSwitch(table: DynamoDbTable, on: boolean): Promise<void> {
  const client = documentClient(table);
  const TableName = table.name;
  if (on) await client.send(new PutCommand({ TableName, Item: KILL_SWITCH_KEY }));
  else await client.send(new DeleteCommand({ TableName, Key: KILL_SWITCH_KEY }));
}

/** A recipient library's committed spend on one day (UTC), unsettled calls at their worst case. */
export interface LibraryDayTotal {
  libraryId: string;
  day: string;
  committedUsd: number;
}

/**
 * Each recipient library's total for each day it spent, or one library's alone, from one `Query` of
 * the `TOTAL` partition.
 */
export async function readLibraryDayTotals(table: DynamoDbTable, libraryId?: string): Promise<LibraryDayTotal[]> {
  const totals: LibraryDayTotal[] = [];
  const prefix = libraryId === undefined ? LIBRARY_PERIOD_PREFIX : `${LIBRARY_PERIOD_PREFIX}${libraryId}#`;
  const pages = paginateQuery(
    { client: documentClient(table) },
    {
      TableName: table.name,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": TOTAL, ":prefix": prefix },
      ConsistentRead: true,
    },
  );
  for await (const page of pages) {
    for (const { sk, committedUsd } of (page.Items ?? []) as { sk: string; committedUsd: number }[]) {
      const [totalsLibraryId, day] = sk.slice(LIBRARY_PERIOD_PREFIX.length).split("#");
      totals.push({ libraryId: totalsLibraryId, day, committedUsd });
    }
  }
  return totals;
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
