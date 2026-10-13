import { mkdir, open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../logging/logger.ts";
import { readIfExists } from "./files.ts";
import type { LedgerEntry, UsageLedger } from "./types.ts";

const NEWLINE = 0x0a;

export function createFileLedger(dataDir: string, logger: Logger): UsageLedger {
  const ledgerDir = path.join(dataDir, "ledger");
  const monthFile = (month: string) => path.join(ledgerDir, `${month}.jsonl`);

  return {
    async append(entry) {
      await mkdir(ledgerDir, { recursive: true });
      const file = await open(monthFile(monthOf(entry.reservedAt)), "a+");
      try {
        const line = `${JSON.stringify(entry)}\n`;
        await file.appendFile((await endsMidLine(file)) ? `\n${line}` : line);
      } finally {
        await file.close();
      }
    },

    async entriesForMonth(month) {
      const file = monthFile(month);
      const lines = ((await readIfExists(file)) ?? "").split("\n");
      return lines.flatMap((line, index) => {
        if (line === "") return [];
        try {
          return [JSON.parse(line) as LedgerEntry];
        } catch {
          logger.warn("ledger.line-skipped", "Skipped a ledger line that isn't JSON (cut off by a crash mid-append?)", {
            file,
            line: index + 1,
          });
          return [];
        }
      });
    },
  };
}

/** True when the file's last line has no newline, as a crash mid-append leaves it. */
async function endsMidLine(file: FileHandle): Promise<boolean> {
  const { size } = await file.stat();
  if (size === 0) return false;
  const { buffer } = await file.read(Buffer.alloc(1), 0, 1, size - 1);
  return buffer[0] !== NEWLINE;
}

export function monthOf(isoTime: string): string {
  return isoTime.slice(0, "2026-10".length);
}
