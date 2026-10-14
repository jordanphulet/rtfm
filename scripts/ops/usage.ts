import type { AwsSession } from "../../infra/run-aws.ts";
import { READ_ROLE } from "../../infra/rtfm.ts";
import { config } from "../../server/config.ts";
import { createDynamoDbSpendingLedger } from "../../server/gateway/dynamodb-spending-ledger.ts";
import { usageReport, usageSummary, type UsageReportInput } from "../../server/gateway/usage-report.ts";
import { monthOf } from "../../server/storage/file-ledger.ts";
import { asRole, usageTableAs, type CommandResult, type OpsContext } from "./context.ts";

/** Today's and this month's Bedrock spend in `rtfm-usage`, read as `rtfm-read`: `npm run usage`'s report. */
export function usage(context: OpsContext): Promise<CommandResult> {
  return asRole(context, READ_ROLE, async (session) => {
    const input = await usageInput(context, session);
    return { text: usageReport(input), json: usageSummary(input), ok: true };
  });
}

/** What the usage report is made from: this month's entries in `rtfm-usage`, and its kill switch. */
export async function usageInput(context: OpsContext, session: AwsSession): Promise<UsageReportInput> {
  const ledger = createDynamoDbSpendingLedger(await usageTableAs(context, session));
  const now = context.now();
  const [monthEntries, killSwitchOn] = await Promise.all([
    ledger.entriesForMonth(monthOf(now.toISOString())),
    ledger.killSwitchOn(),
  ]);
  return { monthEntries, now, caps: config.caps, killSwitchOn };
}
