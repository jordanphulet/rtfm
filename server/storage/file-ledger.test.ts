import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tempDataDir } from "../testing.ts";
import { createFileLedger } from "./file-ledger.ts";
import type { LedgerEntry, UsageLedger } from "./types.ts";

function reserve(callId: string, reservedAt: string): LedgerEntry {
  return { kind: "reserve", callId, reservedAt, job: "write-section", model: "m", worstCaseUsd: 0.02 };
}

describe("file ledger", () => {
  let dataDir: string;
  let ledger: UsageLedger;
  let octoberFile: string;

  beforeEach(async () => {
    dataDir = await tempDataDir();
    ledger = createFileLedger(dataDir);
    octoberFile = path.join(dataDir, "ledger", "2026-10.jsonl");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function silenceWarnings() {
    return vi.spyOn(console, "warn").mockImplementation(() => {});
  }

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

  it("skips a last line cut off by a crash, with a warning", async () => {
    const warn = silenceWarnings();
    const entry = reserve("a", "2026-10-11T12:00:00.000Z");
    await ledger.append(entry);
    await appendFile(octoberFile, '{"kind":"settle","callId":"a"');

    expect(await ledger.entriesForMonth("2026-10")).toEqual([entry]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`line 2 of ${octoberFile}`));
  });

  it("starts the next entry on its own line after a cut-off line, so both later reads and appends work", async () => {
    const warn = silenceWarnings();
    const before = reserve("a", "2026-10-11T12:00:00.000Z");
    const after = reserve("b", "2026-10-11T12:01:00.000Z");
    await ledger.append(before);
    await appendFile(octoberFile, '{"kind":"settle","callId":"a"');
    await ledger.append(after);

    expect((await readFile(octoberFile, "utf8")).split("\n")).toEqual([
      JSON.stringify(before),
      '{"kind":"settle","callId":"a"',
      JSON.stringify(after),
      "",
    ]);
    expect(await ledger.entriesForMonth("2026-10")).toEqual([before, after]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("skips a line that doesn't parse anywhere in the file, and reads the lines after it", async () => {
    const warn = silenceWarnings();
    const before = reserve("a", "2026-10-11T12:00:00.000Z");
    const after = reserve("b", "2026-10-11T12:01:00.000Z");
    await ledger.append(before);
    await appendFile(octoberFile, `{"kind":"settle","callId":"a"${JSON.stringify(reserve("c", "2026-10-11T12:00:30.000Z"))}\n`);
    await ledger.append(after);

    expect(await ledger.entriesForMonth("2026-10")).toEqual([before, after]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`line 2 of ${octoberFile}`));
  });
});
