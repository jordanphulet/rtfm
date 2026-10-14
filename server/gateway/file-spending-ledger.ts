import { existsSync } from "node:fs";
import path from "node:path";
import { monthOf } from "../storage/file-ledger.ts";
import { ADMIN_LIBRARY_ID } from "../storage/library.ts";
import type { UsageLedger } from "../storage/types.ts";
import { callsFrom, chargedUsd, dayOf } from "./ledger-calls.ts";
import type { SpendingLedger } from "./spending-ledger.ts";
import { SpendingRefused } from "./types.ts";

/** The data folder's kill switch: on while this file exists. */
export function killSwitchPath(dataDir: string): string {
  return path.join(dataDir, "STOP");
}

export interface FileSpendingLedgerDeps {
  ledger: UsageLedger;
  dataDir: string;
  now?: () => Date;
}

/**
 * The data folder's: its ledger files, totals in this process's memory, replayed from this month's
 * file, and its `STOP` file. Each reservation is checked and counted in one synchronous step, so it
 * holds for one process, which the data folder's lock makes sure of.
 */
export async function openFileSpendingLedger({
  ledger,
  dataDir,
  now = () => new Date(),
}: FileSpendingLedgerDeps): Promise<SpendingLedger> {
  const committedUsd = new Map<string, number>();

  /** The totals a call counts toward: its day's, its month's, and a recipient library's day's. */
  function periodsOf(reservedAt: string, libraryId: string) {
    const day = dayOf(reservedAt);
    const libraryDay = libraryId === ADMIN_LIBRARY_ID ? undefined : `${day}#${libraryId}`;
    return { day, month: monthOf(reservedAt), libraryDay };
  }

  function commit(reservedAt: string, libraryId: string, usd: number) {
    for (const period of Object.values(periodsOf(reservedAt, libraryId))) {
      if (period !== undefined) committedUsd.set(period, (committedUsd.get(period) ?? 0) + usd);
    }
  }

  function wouldCross(period: string, worstCaseUsd: number, capUsd: number): boolean {
    return (committedUsd.get(period) ?? 0) + worstCaseUsd > capUsd;
  }

  const killSwitchOn = () => existsSync(killSwitchPath(dataDir));

  for (const call of callsFrom(await ledger.entriesForMonth(monthOf(now().toISOString())))) {
    commit(call.reservedAt, call.libraryId, chargedUsd(call));
  }

  return {
    async reserve(entry, caps) {
      const { reservedAt, libraryId, worstCaseUsd } = entry;
      const { day, month, libraryDay } = periodsOf(reservedAt, libraryId);
      if (killSwitchOn()) throw new SpendingRefused("kill-switch");
      if (wouldCross(day, worstCaseUsd, caps.dailyUsd)) throw new SpendingRefused("daily-cap");
      if (wouldCross(month, worstCaseUsd, caps.monthlyUsd)) throw new SpendingRefused("monthly-cap");
      if (libraryDay && wouldCross(libraryDay, worstCaseUsd, caps.libraryDailyUsd)) throw new SpendingRefused("library-cap");
      commit(reservedAt, libraryId, worstCaseUsd);
      try {
        await ledger.append(entry);
      } catch (error) {
        commit(reservedAt, libraryId, -worstCaseUsd);
        throw error;
      }
    },

    async settle(entry, reserved) {
      try {
        await ledger.append(entry);
      } finally {
        commit(reserved.reservedAt, reserved.libraryId, entry.usd - reserved.worstCaseUsd);
      }
    },

    entriesForMonth: (month) => ledger.entriesForMonth(month),

    async killSwitchOn() {
      return killSwitchOn();
    },
  };
}
