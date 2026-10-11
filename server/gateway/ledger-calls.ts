import type { LedgerEntry, SettleEntry } from "../storage/types.ts";

export interface LedgerCall {
  callId: string;
  reservedAt: string;
  job: string;
  model: string;
  worstCaseUsd: number;
  settle?: SettleEntry;
}

export function callsFrom(entries: LedgerEntry[]): LedgerCall[] {
  const calls = new Map<string, LedgerCall>();
  for (const entry of entries) {
    if (entry.kind === "reserve") {
      const { callId, reservedAt, job, model, worstCaseUsd } = entry;
      calls.set(callId, { callId, reservedAt, job, model, worstCaseUsd });
    } else {
      const call = calls.get(entry.callId);
      if (call) call.settle = entry;
    }
  }
  return [...calls.values()];
}

export function chargedUsd(call: LedgerCall): number {
  return call.settle?.usd ?? call.worstCaseUsd;
}

export function dayOf(isoTime: string): string {
  return isoTime.slice(0, "2026-10-11".length);
}
