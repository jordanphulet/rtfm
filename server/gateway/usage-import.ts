import type { UsageLedger } from "../storage/types.ts";
import type { DynamoDbSpendingLedger } from "./dynamodb-spending-ledger.ts";
import { callsFrom, chargedUsd, type LedgerCall } from "./ledger-calls.ts";
import { FAKE_MODEL } from "./types.ts";

export interface UsageImport {
  /** The data folder's ledger. */
  from: UsageLedger;
  into: DynamoDbSpendingLedger;
  month: string;
  /** Without it, a dry run: it lists what it would import and writes nothing. */
  apply: boolean;
}

/**
 * Copies a month's Bedrock calls from the data folder's ledger into `rtfm-usage`, with what each
 * was charged, so the central caps count them. The fake model's calls cost nothing and stay out.
 * Running it again imports only what isn't there yet.
 */
export async function importUsage({ from, into, month, apply }: UsageImport): Promise<string> {
  const calls = callsFrom(await from.entriesForMonth(month)).filter((call) => call.model !== FAKE_MODEL);
  const alreadyThere = new Set(callsFrom(await into.entriesForMonth(month)).map(({ callId }) => callId));
  const lines = [
    apply
      ? `Importing ${month}'s Bedrock calls into rtfm-usage:`
      : `Dry run, nothing written: ${month}'s Bedrock calls that --apply would import into rtfm-usage:`,
  ];
  const imported: LedgerCall[] = [];
  for (const call of calls) {
    const outcome = alreadyThere.has(call.callId) ? "already-there" : apply ? await into.importCall(call) : "imported";
    if (outcome === "imported") imported.push(call);
    const label = outcome === "already-there" ? "already in rtfm-usage" : apply ? "imported" : "to import";
    lines.push(`  ${call.reservedAt}  ${call.callId}  ${call.job}  ${formatUsd(chargedUsd(call))}  ${label}`);
  }
  const importedUsd = imported.reduce((total, call) => total + chargedUsd(call), 0);
  lines.push(
    `${apply ? "Imported" : "To import"}: ${imported.length} of ${calls.length} calls, ${formatUsd(importedUsd)}; ` +
      `${calls.length - imported.length} already in rtfm-usage.`,
  );
  return lines.join("\n");
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
