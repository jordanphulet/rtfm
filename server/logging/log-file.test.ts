import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tempDataDir } from "../testing.ts";
import { logsDir, toLogFile } from "./log-file.ts";
import { createLogger } from "./logger.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function loggerAt(dataDir: string, now: { value: Date }) {
  return createLogger([toLogFile(dataDir)], () => now.value);
}

describe("the log file", () => {
  it("appends each line to <data folder>/logs/<UTC date>.jsonl, starting a new file each UTC day", async () => {
    const dataDir = await tempDataDir();
    const now = { value: new Date("2026-10-12T23:59:59.000Z") };
    const logger = loggerAt(dataDir, now);

    logger.info("first", "First");
    logger.info("second", "Second");
    now.value = new Date("2026-10-13T00:00:00.000Z");
    logger.info("third", "Third");

    const dir = logsDir(dataDir);
    expect((await readdir(dir)).sort()).toEqual(["2026-10-12.jsonl", "2026-10-13.jsonl"]);
    const october12 = (await readFile(path.join(dir, "2026-10-12.jsonl"), "utf8")).split("\n");
    expect(october12.map((line) => line && JSON.parse(line).event)).toEqual(["first", "second", ""]);
    expect(await readFile(path.join(dir, "2026-10-13.jsonl"), "utf8")).toContain('"event":"third"');
  });

  it("keeps 14 days of files: today's and the 13 days before it, and nothing else in the folder is touched", async () => {
    const dataDir = await tempDataDir();
    const dir = logsDir(dataDir);
    await mkdir(dir, { recursive: true });
    const old = ["2026-09-01.jsonl", "2026-09-28.jsonl", "2026-09-29.jsonl", "2026-09-30.jsonl", "2026-10-11.jsonl"];
    for (const name of [...old, "notes.txt"]) await writeFile(path.join(dir, name), "");

    loggerAt(dataDir, { value: new Date("2026-10-12T08:00:00.000Z") }).info("started", "Started");

    expect((await readdir(dir)).sort()).toEqual([
      "2026-09-29.jsonl",
      "2026-09-30.jsonl",
      "2026-10-11.jsonl",
      "2026-10-12.jsonl",
      "notes.txt",
    ]);
  });

  it("never throws when the file can't be written, says so once on standard error, and tries again with the next line", async () => {
    const dataDir = await tempDataDir();
    const dir = logsDir(dataDir);
    await writeFile(dir, "a file where the folder should be");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = loggerAt(dataDir, { value: new Date("2026-10-12T08:00:00.000Z") });

    expect(() => {
      logger.info("first", "First");
      logger.error("second", "Second", {}, new Error("broken"));
    }).not.toThrow();
    expect(stderr).toHaveBeenCalledOnce();
    expect(String(stderr.mock.calls[0][0])).toContain("Couldn't write the log file");

    await rm(dir);
    logger.info("third", "Third");
    expect(await readFile(path.join(dir, "2026-10-12.jsonl"), "utf8")).toContain('"event":"third"');
  });

  it("stops a day's file at its byte budget with one last line saying so, and starts again the next day", async () => {
    const dataDir = await tempDataDir();
    const now = { value: new Date("2026-10-12T08:00:00.000Z") };
    const everyLine: string[] = [];
    const logger = createLogger([toLogFile(dataDir, 400), (line) => everyLine.push(line)], () => now.value);

    for (let count = 0; count < 10; count++) logger.info("request", `Request ${count}`);
    now.value = new Date("2026-10-13T08:00:00.000Z");
    logger.info("request", "The next day");

    const dir = logsDir(dataDir);
    const october12 = (await readFile(path.join(dir, "2026-10-12.jsonl"), "utf8")).trimEnd().split("\n");
    const events = october12.map((line) => JSON.parse(line).event);
    expect(events.slice(0, -1).every((event) => event === "request")).toBe(true);
    expect(events.length).toBeLessThan(10);
    expect(JSON.parse(october12.at(-1)!)).toMatchObject({ level: "WARN", event: "log.file-full", bytesPerDay: 400 });
    expect(october12.slice(0, -1).join("\n").length + 1).toBeLessThanOrEqual(400);
    expect(everyLine).toHaveLength(11);
    expect(await readFile(path.join(dir, "2026-10-13.jsonl"), "utf8")).toContain("The next day");
  });

  it("counts what today's file already holds toward the budget, as after a restart", async () => {
    const dataDir = await tempDataDir();
    const dir = logsDir(dataDir);
    await mkdir(dir);
    await writeFile(path.join(dir, "2026-10-12.jsonl"), `${"x".repeat(390)}\n`);

    const logger = createLogger([toLogFile(dataDir, 400)], () => new Date("2026-10-12T08:00:00.000Z"));
    logger.info("request", "Request");

    const october12 = (await readFile(path.join(dir, "2026-10-12.jsonl"), "utf8")).trimEnd().split("\n");
    expect(october12).toHaveLength(2);
    expect(JSON.parse(october12[1]!)).toMatchObject({ event: "log.file-full" });
  });
});
