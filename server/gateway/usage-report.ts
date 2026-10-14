import { monthOf } from "../storage/file-ledger.ts";
import type { LedgerEntry } from "../storage/types.ts";
import { callsFrom, chargedUsd, dayOf, type LedgerCall } from "./ledger-calls.ts";
import { FAKE_MODEL, type GatewayConfig } from "./types.ts";

export interface UsageReportInput {
  monthEntries: LedgerEntry[];
  now: Date;
  caps: GatewayConfig["caps"];
  killSwitchOn: boolean;
}

export interface Spend {
  usd: number;
  calls: number;
}

/** A day's or a month's spend. The fake model's calls are in `fakeModel` alone. */
export interface PeriodSpend extends Spend {
  period: string;
  capUsd: number;
  aborted: number;
  failed: number;
  estimated: number;
  unsettled: number;
  byModel: Record<string, Spend>;
  byJob: Record<string, Spend>;
  fakeModel: Spend;
}

export interface UsageSummary {
  killSwitchOn: boolean;
  today: PeriodSpend;
  month: PeriodSpend;
  /** Calls with no settle, counted at their worst case; the fake model's left out. */
  unsettled: { reservedAt: string; callId: string; job: string; worstCaseUsd: number }[];
}

/** Spend against the caps, today's and this month's (UTC). */
export function usageSummary({ monthEntries, now, caps, killSwitchOn }: UsageReportInput): UsageSummary {
  const today = dayOf(now.toISOString());
  const calls = callsFrom(monthEntries);
  return {
    killSwitchOn,
    today: periodSpend(today, calls.filter((call) => dayOf(call.reservedAt) === today), caps.dailyUsd),
    month: periodSpend(monthOf(now.toISOString()), calls, caps.monthlyUsd),
    unsettled: calls
      .filter((call) => !call.settle && call.model !== FAKE_MODEL)
      .map(({ reservedAt, callId, job, worstCaseUsd }) => ({ reservedAt, callId, job, worstCaseUsd })),
  };
}

/** The summary for people. The fake model's calls are counted apart, on a line of their own. */
export function usageReport(input: UsageReportInput): string {
  const { killSwitchOn, today, month, unsettled } = usageSummary(input);
  const lines = [
    `Model spend (UTC). Kill switch: ${killSwitchOn ? "ON, new calls are refused" : "off"}.`,
    "",
    ...periodLines(`Today, ${today.period}`, today),
    "",
    ...periodLines(`This month, ${month.period}`, month),
  ];
  if (unsettled.length > 0) {
    lines.push("", "Unsettled reservations, counted at their worst case:");
    for (const call of unsettled) {
      lines.push(`  ${call.reservedAt}  ${call.callId}  ${call.job}  ${formatUsd(call.worstCaseUsd)}`);
    }
  }
  return lines.join("\n");
}

function periodSpend(period: string, periodCalls: LedgerCall[], capUsd: number): PeriodSpend {
  const calls = periodCalls.filter((call) => call.model !== FAKE_MODEL);
  const count = (matches: (call: LedgerCall) => boolean) => calls.filter(matches).length;
  return {
    period,
    capUsd,
    ...spendOf(calls),
    aborted: count((call) => call.settle?.outcome === "aborted"),
    failed: count((call) => call.settle?.outcome === "failed"),
    estimated: count((call) => call.settle?.estimated === true),
    unsettled: count((call) => !call.settle),
    byModel: spendBy(calls, (call) => call.model),
    byJob: spendBy(calls, (call) => call.job),
    fakeModel: spendOf(periodCalls.filter((call) => call.model === FAKE_MODEL)),
  };
}

function spendOf(calls: LedgerCall[]): Spend {
  return { usd: calls.reduce((total, call) => total + chargedUsd(call), 0), calls: calls.length };
}

function spendBy(calls: LedgerCall[], keyOf: (call: LedgerCall) => string): Record<string, Spend> {
  const groups = new Map<string, LedgerCall[]>();
  for (const call of calls) groups.set(keyOf(call), [...(groups.get(keyOf(call)) ?? []), call]);
  return Object.fromEntries([...groups].map(([key, group]) => [key, spendOf(group)]));
}

function periodLines(title: string, spend: PeriodSpend): string[] {
  return [
    `${title}: ${formatUsd(spend.usd)} of $${spend.capUsd.toFixed(2)}, ${callCount(spend.calls)}`,
    `  aborted ${spend.aborted}, failed ${spend.failed}, estimated ${spend.estimated}, unsettled ${spend.unsettled}`,
    "  by model:",
    ...groupLines(spend.byModel),
    "  by job:",
    ...groupLines(spend.byJob),
    `  ${FAKE_MODEL}, not counted above: ${formatUsd(spend.fakeModel.usd)}, ${callCount(spend.fakeModel.calls)}`,
  ];
}

function groupLines(groups: Record<string, Spend>): string[] {
  const keys = Object.keys(groups);
  if (keys.length === 0) return ["    none"];
  const width = Math.max(...keys.map((key) => key.length));
  return keys.map((key) => `    ${key.padEnd(width)}  ${formatUsd(groups[key].usd)}  ${callCount(groups[key].calls)}`);
}

function callCount(calls: number): string {
  return calls === 1 ? "1 call" : `${calls} calls`;
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
