import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { readIfExists } from "./files.ts";
import type { LedgerEntry, UsageLedger } from "./types.ts";

export function createFileLedger(dataDir: string): UsageLedger {
  const ledgerDir = path.join(dataDir, "ledger");
  const monthFile = (month: string) => path.join(ledgerDir, `${month}.jsonl`);

  return {
    async append(entry) {
      await mkdir(ledgerDir, { recursive: true });
      await appendFile(monthFile(monthOf(entry.reservedAt)), `${JSON.stringify(entry)}\n`);
    },

    async entriesForMonth(month) {
      const text = (await readIfExists(monthFile(month))) ?? "";
      const completeLines = text.split("\n").slice(0, -1);
      return completeLines.map((line) => JSON.parse(line) as LedgerEntry);
    },
  };
}

export function monthOf(isoTime: string): string {
  return isoTime.slice(0, "2026-10".length);
}
