import { appendFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { tempDataDir } from "../testing.ts";
import { createFileLedger } from "./file-ledger.ts";
import type { LedgerEntry, UsageLedger } from "./types.ts";

function reserve(callId: string, reservedAt: string): LedgerEntry {
  return { kind: "reserve", callId, reservedAt, job: "write-section", model: "m", worstCaseUsd: 0.02 };
}

describe("file ledger", () => {
  let dataDir: string;
  let ledger: UsageLedger;

  beforeEach(async () => {
    dataDir = await tempDataDir();
    ledger = createFileLedger(dataDir);
  });

  it("reads an empty month as no entries", async () => {
    expect(await ledger.entriesForMonth("2026-10")).toEqual([]);
  });

  it("files each entry under the month it was reserved in", async () => {
    const october = reserve("a", "2026-10-31T23:59:59.000Z");
    const november = reserve("b", "2026-11-01T00:00:00.000Z");
    await ledger.append(october);
    await ledger.append(november);
    expect(await ledger.entriesForMonth("2026-10")).toEqual([october]);
    expect(await ledger.entriesForMonth("2026-11")).toEqual([november]);
  });

  it("skips a last line cut off by a crash", async () => {
    const entry = reserve("a", "2026-10-11T12:00:00.000Z");
    await ledger.append(entry);
    await appendFile(path.join(dataDir, "ledger", "2026-10.jsonl"), '{"kind":"settle","callId":"a"');
    expect(await ledger.entriesForMonth("2026-10")).toEqual([entry]);
  });
});
