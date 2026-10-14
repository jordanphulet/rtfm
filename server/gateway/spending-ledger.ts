import type { LedgerEntry, ReserveEntry, SettleEntry } from "../storage/types.ts";
import type { GatewayConfig } from "./types.ts";

export type Caps = GatewayConfig["caps"];

/**
 * Every model call's reservation and settlement, the day's and the month's committed spend (UTC)
 * that the caps are checked against, and the kill switch: the data folder's
 * (`file-spending-ledger.ts`) with the fake models, the table `rtfm-usage`'s
 * (`dynamodb-spending-ledger.ts`) with Bedrock (`server/gateway/README.md` › The spending ledger).
 */
export interface SpendingLedger {
  /**
   * Refuses with `SpendingRefused` while the kill switch is on, or when the reservation's worst
   * case would take its day's or its month's committed spend over the cap. Otherwise records the
   * reservation and adds its worst case to both, in one step no other reservation can come between.
   */
  reserve(entry: ReserveEntry, caps: Caps): Promise<void>;
  /** Records the settlement, and adds `usd − worstCaseUsd` to its reservation's day and month. */
  settle(entry: SettleEntry, worstCaseUsd: number): Promise<void>;
  /** A month's entries (`"2026-10"`), each call's reserve before its settle. */
  entriesForMonth(month: string): Promise<LedgerEntry[]>;
  killSwitchOn(): Promise<boolean>;
}
