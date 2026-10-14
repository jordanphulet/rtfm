import { stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { config } from "./config.ts";
import { logFileName, logsDir } from "./logging/log-file.ts";
import {
  LOG_OPTIONS,
  LogOptionInvalid,
  completeLinesFrom,
  entriesIn,
  formatEntry,
  logOptionsFrom,
  matches,
  recentEntries,
  type LogFilter,
} from "./logging/log-reader.ts";
import { isErrorCode } from "./storage/files.ts";

const FOLLOW_INTERVAL_MS = 500;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { ...LOG_OPTIONS, follow: { type: "boolean", short: "f", default: false } },
});

const dir = logsDir(positionals[0] ?? config.dataDir);
const { filter, count } = optionsOrExit();

const todaysFile = logFileName(new Date().toISOString());
const todaysEnd = await sizeOf(path.join(dir, todaysFile));
for (const entry of await recentEntries(dir, filter, count)) console.log(formatEntry(entry));
if (values.follow) await follow(todaysFile, todaysEnd, filter);

function optionsOrExit(): { filter: LogFilter; count: number } {
  try {
    return logOptionsFrom(values);
  } catch (error) {
    if (!(error instanceof LogOptionInvalid)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Prints each new entry that matches as it is written, from where the file ended before the recent
 * entries were read, so none is missed. It moves to the next file when the UTC day changes.
 */
async function follow(startFile: string, startOffset: number, filter: LogFilter) {
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
