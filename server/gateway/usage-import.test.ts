import { describe, expect, it } from "vitest";
import { silentLogger } from "../logging/logger.ts";
import { createFileLedger } from "../storage/file-ledger.ts";
import type { LedgerEntry } from "../storage/types.ts";
import { tempDataDir } from "../testing.ts";
import { createDynamoDbSpendingLedger } from "./dynamodb-spending-ledger.ts";
import { testUsageTable } from "./dynamodb-testing.ts";
import { callsFrom } from "./ledger-calls.ts";
import { FAKE_MODEL } from "./types.ts";
import { importUsage } from "./usage-import.ts";

const HAIKU = "global.anthropic.claude-haiku-4-5-20251001-v1:0";

function settledCall(callId: string, reservedAt: string, usd: number, model = HAIKU): LedgerEntry[] {
  const call = { callId, reservedAt, job: "write-section", model };
  return [
    { kind: "reserve", ...call, worstCaseUsd: 0.025 },
    {
      kind: "settle",
      ...call,
      at: reservedAt,
      inputTokens: 3000,
      outputTokens: 1200,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      usd,
      outcome: "complete",
      estimated: false,
    },
  ];
}

describe("importing the data folder's Bedrock calls into rtfm-usage", () => {
  async function setUp() {
    const from = createFileLedger(await tempDataDir(), silentLogger);
    const entries = [
      ...settledCall("section", "2026-10-02T10:00:00.000Z", 0.009),
      ...settledCall("fake", "2026-10-02T10:01:00.000Z", 0, FAKE_MODEL),
      { kind: "reserve", callId: "crashed", reservedAt: "2026-10-03T10:00:00.000Z", job: "librarian", model: HAIKU, worstCaseUsd: 0.014 },
      ...settledCall("last-month", "2026-09-30T10:00:00.000Z", 0.5),
    ] satisfies LedgerEntry[];
    for (const entry of entries) await from.append(entry);
    return { from, into: createDynamoDbSpendingLedger(await testUsageTable()) };
  }

  it("lists in a dry run what it would import, the month's Bedrock calls and not the fake model's, and writes nothing", async () => {
    const { from, into } = await setUp();
    const report = await importUsage({ from, into, month: "2026-10", apply: false });

    expect(report.split("\n")).toEqual([
      "Dry run, nothing written: 2026-10's Bedrock calls that --apply would import into rtfm-usage:",
      "  2026-10-02T10:00:00.000Z  section  write-section  $0.0090  to import",
      "  2026-10-03T10:00:00.000Z  crashed  librarian  $0.0140  to import",
      "To import: 2 of 2 calls, $0.0230; 0 already in rtfm-usage.",
    ]);
    expect(await into.entriesForMonth("2026-10")).toEqual([]);
  });

  it("imports each call once, with what it was charged, an unsettled one at its worst case", async () => {
    const { from, into } = await setUp();
    expect(await importUsage({ from, into, month: "2026-10", apply: true })).toContain(
      "Imported: 2 of 2 calls, $0.0230; 0 already in rtfm-usage.",
    );
    expect(callsFrom(await into.entriesForMonth("2026-10"))).toEqual(
      callsFrom(await from.entriesForMonth("2026-10")).filter(({ model }) => model !== FAKE_MODEL),
    );

    const again = await importUsage({ from, into, month: "2026-10", apply: true });
    expect(again).toContain("  2026-10-02T10:00:00.000Z  section  write-section  $0.0090  already in rtfm-usage");
    expect(again).toContain("Imported: 0 of 2 calls, $0.0000; 2 already in rtfm-usage.");
    const next = (worstCaseUsd: number) =>
      into.reserve(
        { kind: "reserve", callId: `next-${worstCaseUsd}`, reservedAt: "2026-10-04T00:00:00.000Z", job: "librarian", model: HAIKU, worstCaseUsd },
        { dailyUsd: 2, monthlyUsd: 1 },
      );
    await expect(next(0.98)).rejects.toMatchObject({ reason: "monthly-cap" });
    await next(0.97);
  });
});
