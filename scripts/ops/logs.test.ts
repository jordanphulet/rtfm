import { describe, expect, it } from "vitest";
import { formatEntry } from "../../server/logging/log-reader.ts";
import type { LogEntry } from "../../server/logging/logger.ts";
import { logs, sinceMs } from "./logs.ts";
import { standInAws } from "./testing.ts";

const now = new Date("2026-10-13T12:00:00.000Z");
const entry = (minute: number, level: LogEntry["level"], event: string): LogEntry => ({
  timestamp: `2026-10-13T11:${String(minute).padStart(2, "0")}:00.000Z`,
  level,
  event,
  message: `${event} at ${minute}`,
});
const ENTRIES = [
  entry(1, "INFO", "server.started"),
  entry(2, "INFO", "request"),
  entry(3, "WARN", "section.failed"),
  entry(4, "ERROR", "section.failed"),
  entry(5, "INFO", "section.finished"),
  entry(6, "ERROR", "request.failed"),
];
const EVENTS = [
  { timestamp: 1, message: "START RequestId: 1 Version: 3\n" },
  ...ENTRIES.map((one, index) => ({ timestamp: index + 2, message: `${JSON.stringify(one)}\n` })),
];
const filterLogEvents = { args: ["logs", "filter-log-events"], stdout: { events: EVENTS } };
const everything = { filter: {}, count: 50, sinceMs: sinceMs("1d") };

describe("npm run ops -- logs", () => {
  it("reads the Web Function's log group since when it is told, as rtfm-read", async () => {
    const { context, calls } = standInAws([filterLogEvents], { now });

    const result = await logs({ ...everything, sinceMs: sinceMs("90m") }, context);

    expect(result).toEqual({ text: ENTRIES.map(formatEntry).join("\n"), json: ENTRIES, ok: true });
    const read = calls().find((call) => call.args[0] === "logs")!;
    expect(read.profile).toBe("rtfm-read");
    expect(read.args).toEqual([
      "logs",
      "filter-log-events",
      "--log-group-name",
      "/rtfm/app",
      "--start-time",
      String(Date.parse("2026-10-13T10:30:00.000Z")),
      "--output",
      "json",
    ]);
  });

  it("filters by level and event, and keeps the last entries, as npm run logs does", async () => {
    const { context } = standInAws([filterLogEvents], { now });

    expect((await logs({ ...everything, filter: { level: "WARN" } }, context)).json).toEqual(ENTRIES.slice(2, 4).concat(ENTRIES[5]));
    expect((await logs({ ...everything, filter: { event: "section" } }, context)).json).toEqual(ENTRIES.slice(2, 5));
    expect((await logs({ ...everything, filter: { level: "ERROR", event: "section" } }, context)).json).toEqual([ENTRIES[3]]);
    expect((await logs({ ...everything, count: 2 }, context)).json).toEqual(ENTRIES.slice(4));
  });

  it("says so when nothing matches", async () => {
    const { context } = standInAws([{ args: ["logs", "filter-log-events"], stdout: { events: [] } }], { now });
    expect(await logs(everything, context)).toEqual({
      text: "No entry in /rtfm/app matches, since 2026-10-12T12:00:00.000Z.",
      json: [],
      ok: true,
    });
  });

  it("fails with the CLI's own message when the read fails", async () => {
    const denied = "An error occurred (AccessDeniedException) when calling the FilterLogEvents operation";
    const { context } = standInAws([{ args: ["logs"], stderr: denied, code: 254 }], { now });
    await expect(logs(everything, context)).rejects.toThrow(`aws logs filter-log-events failed: ${denied}`);
  });

  it("takes --since in minutes, hours or days", () => {
    expect(sinceMs("90m")).toBe(90 * 60_000);
    expect(sinceMs("6h")).toBe(6 * 3_600_000);
    expect(sinceMs("2d")).toBe(2 * 86_400_000);
    for (const value of ["", "0h", "1.5h", "6", "h", "1w", "-1d"]) expect(() => sinceMs(value), value).toThrow(/--since/);
  });
});
