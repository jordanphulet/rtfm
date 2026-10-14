import { describe, expect, it } from "vitest";
import { config } from "../../server/config.ts";
import { createDynamoDbSpendingLedger, setKillSwitch } from "../../server/gateway/dynamodb-spending-ledger.ts";
import { testUsageTable } from "../../server/gateway/dynamodb-testing.ts";
import { usageReport } from "../../server/gateway/usage-report.ts";
import { standInAws } from "./testing.ts";
import { usage } from "./usage.ts";

const HAIKU = "global.anthropic.claude-haiku-4-5-20251001-v1:0";
const now = new Date("2026-10-13T12:00:00.000Z");

describe("npm run ops -- usage", () => {
  it("reports rtfm-usage's spend as npm run usage does, read as rtfm-read", async () => {
    const usageTable = await testUsageTable();
    const ledger = createDynamoDbSpendingLedger(usageTable);
    const settled = { libraryId: "admin", job: "write-section", model: HAIKU, worstCaseUsd: 0.02 };
    await ledger.importCall({ callId: "a", reservedAt: "2026-10-13T09:00:00.000Z", ...settled });
    await ledger.importCall({ callId: "b", reservedAt: "2026-10-02T09:00:00.000Z", ...settled });
    await setKillSwitch(usageTable, true);
    const { context, calls } = standInAws([], { usageTable, now });

    const result = await usage(context);

    const monthEntries = await ledger.entriesForMonth("2026-10");
    expect(result.text).toBe(usageReport({ monthEntries, now, caps: config.caps, killSwitchOn: true }));
    expect(result.text).toContain("Today, 2026-10-13: $0.0200 of $2.00, 1 call");
    expect(result.json).toMatchObject({
      killSwitchOn: true,
      today: { period: "2026-10-13", usd: 0.02, calls: 1, capUsd: 2 },
      month: { period: "2026-10", usd: 0.04, calls: 2, capUsd: 20, unsettled: 2 },
      unsettled: [
        { callId: "b", reservedAt: "2026-10-02T09:00:00.000Z", job: "write-section", worstCaseUsd: 0.02 },
        { callId: "a", reservedAt: "2026-10-13T09:00:00.000Z", job: "write-section", worstCaseUsd: 0.02 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(new Set(calls().map((call) => call.profile))).toEqual(new Set(["rtfm-read"]));
  });
});
