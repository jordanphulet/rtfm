import { stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { config } from "./config.ts";
import { logFileName, logsDir } from "./logging/log-file.ts";
import { completeLinesFrom, entriesIn, formatEntry, matches, recentEntries, type LogFilter } from "./logging/log-reader.ts";
import { LEVELS, type Level } from "./logging/logger.ts";
import { isErrorCode } from "./storage/files.ts";

const FOLLOW_INTERVAL_MS = 500;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    level: { type: "string", short: "l" },
    event: { type: "string", short: "e" },
    lines: { type: "string", short: "n", default: "50" },
    follow: { type: "boolean", short: "f", default: false },
  },
});

const dir = logsDir(positionals[0] ?? config.dataDir);
const filter: LogFilter = { level: levelFrom(values.level), event: values.event };
const count = Number(values.lines);
if (!Number.isInteger(count) || count < 1) fail(`--lines must be a whole number above 0, not "${values.lines}"`);

const todaysFile = logFileName(new Date().toISOString());
const todaysEnd = await sizeOf(path.join(dir, todaysFile));
for (const entry of await recentEntries(dir, filter, count)) console.log(formatEntry(entry));
if (values.follow) await follow(todaysFile, todaysEnd);

/**
 * Prints each new entry that matches as it is written, from where the file ended before the recent
 * entries were read, so none is missed. It moves to the next file when the UTC day changes.
 */
async function follow(startFile: string, startOffset: number) {
  let file = startFile;
  let offset = startOffset;
  for (;;) {
    await sleep(FOLLOW_INTERVAL_MS);
    const read = await completeLinesFrom(path.join(dir, file), offset);
    for (const entry of entriesIn(read.lines).filter((entry) => matches(entry, filter))) console.log(formatEntry(entry));
    offset = read.offset;
    const today = logFileName(new Date().toISOString());
    if (today !== file) {
      file = today;
      offset = 0;
    }
  }
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return 0;
    throw error;
  }
}

function levelFrom(value: string | undefined): Level | undefined {
  if (value === undefined) return undefined;
  const level = LEVELS.find((name) => name === value.toUpperCase());
  return level ?? fail(`--level must be one of ${LEVELS.join(", ")}, not "${value}"`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
