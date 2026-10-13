import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import type { LogSink } from "./logger.ts";

const LOG_DAYS_KEPT = 14;
/** The most a day's log file may grow to, so requests from any page can't fill the disk. */
export const LOG_BYTES_PER_DAY = 50 * 1024 * 1024;
export const LOG_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function logsDir(dataDir: string): string {
  return path.join(dataDir, "logs");
}

/** The log file for an ISO time's UTC day: `2026-10-12.jsonl`. */
export function logFileName(isoTime: string): string {
  return `${isoTime.slice(0, "2026-10-12".length)}.jsonl`;
}

/**
 * Appends each line to `<dataDir>/logs/<UTC date>.jsonl`.
 *
 * - The first line of each day removes the files older than `LOG_DAYS_KEPT` days.
 * - A day's file stops at `bytesPerDay`: one last line says so, and the rest of that day's lines
 *   go only to the other sinks.
 * - Writes are synchronous, so lines keep their order and none is lost when the process exits.
 * - A failed write is never thrown: the first is reported on standard error, and the next line
 *   tries again from the start, creating the folder if it is gone.
 */
export function toLogFile(dataDir: string, bytesPerDay = LOG_BYTES_PER_DAY): LogSink {
  const dir = logsDir(dataDir);
  let preparedFile: string | undefined;
  let today = { file: "", bytes: 0, full: false };
  let failureReported = false;

  function reportFailure(error: unknown) {
    if (failureReported) return;
    failureReported = true;
    process.stderr.write(`Couldn't write the log file in ${dir}: ${String(error)}\n`);
  }

  function write(file: string, text: string, now: string) {
    try {
      if (file !== preparedFile) mkdirSync(dir, { recursive: true });
      appendFileSync(path.join(dir, file), text);
    } catch (error) {
      preparedFile = undefined;
      reportFailure(error);
      return;
    }
    if (file === preparedFile) return;
    preparedFile = file;
    try {
      removeExpiredLogFiles(dir, now);
    } catch (error) {
      reportFailure(error);
    }
  }

  return (line, entry) => {
    const file = logFileName(entry.timestamp);
    if (file !== today.file) today = { file, bytes: sizeOf(path.join(dir, file)), full: false };
    if (today.full) return;
    const text = `${line}\n`;
    const bytes = Buffer.byteLength(text);
    if (today.bytes + bytes > bytesPerDay) {
      today.full = true;
      write(file, `${fullNotice(entry.timestamp, bytesPerDay)}\n`, entry.timestamp);
      return;
    }
    today.bytes += bytes;
    write(file, text, entry.timestamp);
  };
}

/** The line that ends a full day's file, in the logger's own shape. */
function fullNotice(timestamp: string, bytesPerDay: number): string {
  return JSON.stringify({
    timestamp,
    level: "WARN",
    event: "log.file-full",
    message: "Today's log file is full: today's further lines go to standard output only",
    bytesPerDay,
  });
}

/** The file's size, or 0 when it can't be read: a write to it then reports why. */
function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

function removeExpiredLogFiles(dir: string, now: string) {
  for (const name of expiredLogFiles(readdirSync(dir), now)) rmSync(path.join(dir, name), { force: true });
}

/** The log files older than `LOG_DAYS_KEPT` days: the file for today and the 13 days before it are kept. */
function expiredLogFiles(names: string[], now: string): string[] {
  const oldestKept = logFileName(new Date(Date.parse(now) - (LOG_DAYS_KEPT - 1) * DAY_MS).toISOString());
  return names.filter((name) => LOG_FILE.test(name) && name < oldestKept);
}
