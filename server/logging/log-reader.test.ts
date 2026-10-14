import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tempDataDir } from "../testing.ts";
import { completeLinesFrom, entriesIn, formatEntry, logOptionsFrom, matches, recentEntries } from "./log-reader.ts";
import type { LogEntry } from "./logger.ts";

function entry(event: string, level: LogEntry["level"] = "INFO", timestamp = "2026-10-12T08:00:00.000Z"): LogEntry {
  return { timestamp, level, event, message: event };
}

const lines = (...entries: LogEntry[]) => entries.map((each) => `${JSON.stringify(each)}\n`).join("");

describe("the logs options", () => {
  it("give the filter and how many entries to show", () => {
    expect(logOptionsFrom({ level: "warn", event: "section", lines: "20" })).toEqual({
      filter: { level: "WARN", event: "section" },
      count: 20,
    });
    expect(logOptionsFrom({ lines: "50" })).toEqual({ filter: { level: undefined, event: undefined }, count: 50 });
    expect(logOptionsFrom({ library: "acme", lines: "50" }).filter).toEqual({ libraryId: "acme" });
  });

  it("refuse a level that isn't one, and a count that isn't a whole number above 0", () => {
    expect(() => logOptionsFrom({ level: "loud", lines: "50" })).toThrow(
      '--level must be one of DEBUG, INFO, WARN, ERROR, not "loud"',
    );
    for (const lines of ["0", "-1", "1.5", "many"]) {
      expect(() => logOptionsFrom({ lines }), lines).toThrow(`--lines must be a whole number above 0, not "${lines}"`);
    }
  });
});

describe("filtering", () => {
  it("keeps a level and the levels above it", () => {
    expect(matches(entry("a", "INFO"), { level: "WARN" })).toBe(false);
    expect(matches(entry("a", "WARN"), { level: "WARN" })).toBe(true);
    expect(matches(entry("a", "ERROR"), { level: "WARN" })).toBe(true);
  });

  it("keeps an event and the events under it", () => {
    expect(matches(entry("section"), { event: "section" })).toBe(true);
    expect(matches(entry("section.failed"), { event: "section" })).toBe(true);
    expect(matches(entry("sections"), { event: "section" })).toBe(false);
    expect(matches(entry("section.failed"), { event: "section.failed" })).toBe(true);
    expect(matches(entry("section.started"), { event: "section.failed" })).toBe(false);
  });

  it("keeps one library's entries", () => {
    const inLibrary = (libraryId?: string) => ({ ...entry("request"), ...(libraryId && { libraryId }) });
    expect(matches(inLibrary("acme"), { libraryId: "acme" })).toBe(true);
    expect(matches(inLibrary("acme-2"), { libraryId: "acme" })).toBe(false);
    expect(matches(inLibrary("admin"), { libraryId: "acme" })).toBe(false);
    expect(matches(inLibrary(), { libraryId: "acme" })).toBe(false);
    expect(matches(inLibrary("admin"), { libraryId: "admin" })).toBe(true);
    expect(matches(inLibrary(), {})).toBe(true);
  });
});

describe("reading", () => {
  it("reads the most recent matching entries, oldest first, across the daily files", async () => {
    const dir = path.join(await tempDataDir(), "logs");
    await mkdir(dir);
    await writeFile(path.join(dir, "2026-10-11.jsonl"), lines(entry("a", "WARN"), entry("b"), entry("c", "ERROR")));
    await writeFile(path.join(dir, "2026-10-12.jsonl"), lines(entry("d"), entry("e", "WARN")));
    await writeFile(path.join(dir, "notes.txt"), lines(entry("ignored", "ERROR")));

    const events = async (filter = {}, count = 50) => (await recentEntries(dir, filter, count)).map(({ event }) => event);
    expect(await events()).toEqual(["a", "b", "c", "d", "e"]);
    expect(await events({}, 3)).toEqual(["c", "d", "e"]);
    expect(await events({ level: "WARN" }, 2)).toEqual(["c", "e"]);
  });

  it("reads nothing from a data folder that has no logs yet", async () => {
    expect(await recentEntries(path.join(await tempDataDir(), "logs"), {}, 50)).toEqual([]);
  });

  it("reads only whole lines, so a line still being written is read once it is whole", async () => {
    const file = path.join(await tempDataDir(), "2026-10-12.jsonl");
    await writeFile(file, `${lines(entry("a"))}{"timestamp":`);

    const first = await completeLinesFrom(file, 0);
    expect(entriesIn(first.lines).map(({ event }) => event)).toEqual(["a"]);

    await appendFile(file, `"2026-10-12T08:00:01.000Z","level":"INFO","event":"b","message":"b"}\n`);
    const second = await completeLinesFrom(file, first.offset);
    expect(entriesIn(second.lines).map(({ event }) => event)).toEqual(["b"]);
    expect(await completeLinesFrom(file, second.offset)).toEqual({ lines: [], offset: second.offset });
  });

  it("skips lines that aren't log entries", () => {
    expect(entriesIn(["not json", '{"event":"x"}', JSON.stringify(entry("kept"))]).map(({ event }) => event)).toEqual([
      "kept",
    ]);
  });
});

describe("formatting", () => {
  it("escapes control characters, so text from the browser can't forge a line or reach the terminal", () => {
    const formatted = formatEntry({
      ...entry("client.error", "ERROR"),
      message: "GET /api/x\n2026-10-12T08:00:00.000Z INFO  forged line",
      page: "/\u001b[2J",
      plain: "/api/manuals",
      error: { name: "Error", message: "m", stack: "Error: m\r2026 INFO forged\n    at \u009bx" },
    });

    expect(formatted.split("\n")).toEqual([
      '2026-10-12T08:00:00.000Z ERROR client.error GET /api/x\\u000a2026-10-12T08:00:00.000Z INFO  forged line page="/\\u001b[2J" plain=/api/manuals',
      "    Error: m\\u000d2026 INFO forged",
      "        at \\u009bx",
    ]);
  });

  it("shows the time, level, event and message, then the fields, then an error's stack indented", () => {
    const formatted = formatEntry({
      ...entry("request.failed", "ERROR"),
      message: "GET /api/x failed",
      path: "/api/x",
      status: 500,
      page: "/read/a manual",
      error: { name: "Error", message: "broken", stack: "Error: broken\n    at handle (route.ts:1:1)" },
    });
    expect(formatted).toBe(
      [
        '2026-10-12T08:00:00.000Z ERROR request.failed GET /api/x failed path=/api/x status=500 page="/read/a manual"',
        "    Error: broken",
        "        at handle (route.ts:1:1)",
      ].join("\n"),
    );
  });
});
