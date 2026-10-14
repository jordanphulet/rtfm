import type { LedgerEntry, ReserveEntry, SettleEntry } from "../storage/types.ts";
import type { GatewayConfig } from "./types.ts";

export type Caps = GatewayConfig["caps"];

/** A reservation as the gateway makes it, always in its library's name. */
export type LibraryReservation = ReserveEntry & { libraryId: string };

/**
 * Every model call's reservation and settlement, the committed spend (UTC) that the caps are
 * checked against, and the kill switch: the data folder's (`file-spending-ledger.ts`) with the fake
 * models, the table `rtfm-usage`'s (`dynamodb-spending-ledger.ts`) with Bedrock
 * (`server/gateway/README.md` › The spending ledger).
 */
export interface SpendingLedger {
  /**
   * Refuses with `SpendingRefused` while the kill switch is on, or when the reservation's worst
   * case would take its day's or its month's committed spend over the cap, or a recipient library's
   * day's over the library cap, in that order. Otherwise records the reservation and adds its worst
   * case to each, in one step no other reservation can come between.
   */
  reserve(entry: LibraryReservation, caps: Caps): Promise<void>;
  /** Records the settlement, and adds `usd − worstCaseUsd` to each total its reservation was added to. */
  settle(entry: SettleEntry, reserved: LibraryReservation): Promise<void>;
  /** A month's entries (`"2026-10"`), each call's reserve before its settle. */
  entriesForMonth(month: string): Promise<LedgerEntry[]>;
  killSwitchOn(): Promise<boolean>;
}
