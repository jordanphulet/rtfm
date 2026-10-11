import { monthOf } from "../storage/file-ledger.ts";
import type { LedgerEntry } from "../storage/types.ts";
import { callsFrom, chargedUsd, dayOf, type LedgerCall } from "./ledger-calls.ts";
import type { GatewayConfig } from "./types.ts";

export interface UsageReportInput {
  monthEntries: LedgerEntry[];
  now: Date;
  caps: GatewayConfig["caps"];
  killSwitchOn: boolean;
}

export function usageReport({ monthEntries, now, caps, killSwitchOn }: UsageReportInput): string {
  const today = dayOf(now.toISOString());
  const month = monthOf(now.toISOString());
  const calls = callsFrom(monthEntries);
  const unsettled = calls.filter((call) => !call.settle);

  const lines = [
    `Model spend (UTC). Kill switch: ${killSwitchOn ? "ON, new calls are refused" : "off"}.`,
    "",
    ...periodLines(`Today, ${today}`, calls.filter((call) => dayOf(call.reservedAt) === today), caps.dailyUsd),
    "",
    ...periodLines(`This month, ${month}`, calls, caps.monthlyUsd),
  ];
  if (unsettled.length > 0) {
    lines.push("", "Unsettled reservations, counted at their worst case:");
    for (const call of unsettled) {
      lines.push(`  ${call.reservedAt}  ${call.callId}  ${call.job}  ${formatUsd(call.worstCaseUsd)}`);
    }
  }
  return lines.join("\n");
}

function periodLines(title: string, calls: LedgerCall[], capUsd: number): string[] {
  const count = (matches: (call: LedgerCall) => boolean) => calls.filter(matches).length;
  return [
    `${title}: ${formatUsd(totalUsd(calls))} of $${capUsd.toFixed(2)}, ${callCount(calls)}`,
    `  aborted ${count((call) => call.settle?.outcome === "aborted")}, ` +
      `failed ${count((call) => call.settle?.outcome === "failed")}, ` +
      `estimated ${count((call) => call.settle?.estimated === true)}, ` +
      `unsettled ${count((call) => !call.settle)}`,
    "  by model:",
    ...groupLines(calls, (call) => call.model),
    "  by job:",
    ...groupLines(calls, (call) => call.job),
  ];
}

function groupLines(calls: LedgerCall[], keyOf: (call: LedgerCall) => string): string[] {
  if (calls.length === 0) return ["    none"];
  const groups = new Map<string, LedgerCall[]>();
  for (const call of calls) {
    const key = keyOf(call);
    const group = groups.get(key) ?? [];
    group.push(call);
    groups.set(key, group);
  }
  const width = Math.max(...[...groups.keys()].map((key) => key.length));
  return [...groups].map(([key, group]) => `    ${key.padEnd(width)}  ${formatUsd(totalUsd(group))}  ${callCount(group)}`);
}

function totalUsd(calls: LedgerCall[]): number {
  return calls.reduce((total, call) => total + chargedUsd(call), 0);
}

function callCount(calls: LedgerCall[]): string {
  return calls.length === 1 ? "1 call" : `${calls.length} calls`;
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
