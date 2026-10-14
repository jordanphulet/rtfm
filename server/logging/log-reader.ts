import { open } from "node:fs/promises";
import path from "node:path";
import { isErrorCode, namesInFolder } from "../storage/files.ts";
import { LOG_FILE } from "./log-file.ts";
import { LEVELS, type Level, type LogEntry } from "./logger.ts";

export interface LogFilter {
  /** This level and the ones above it. */
  level?: Level;
  /** This event, or any event under it: `section` matches `section.failed`. */
  event?: string;
}

const NEWLINE = 0x0a;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
/** Printable ASCII without spaces or quotes: safe to show unquoted. */
const PLAIN_VALUE = /^[!#-~]+$/;

/** The options `npm run logs` and `npm run ops -- logs` both take, for `parseArgs`. */
export const LOG_OPTIONS = {
  level: { type: "string", short: "l" },
  event: { type: "string", short: "e" },
  lines: { type: "string", short: "n", default: "50" },
} as const;

export class LogOptionInvalid extends Error {}

/** The filter and how many entries to show, from `LOG_OPTIONS`' values. */
export function logOptionsFrom(values: { level?: string; event?: string; lines?: string }): {
  filter: LogFilter;
  count: number;
} {
  const filter = { level: levelFrom(values.level), event: values.event };
  const count = Number(values.lines);
  if (!Number.isInteger(count) || count < 1) {
    throw new LogOptionInvalid(`--lines must be a whole number above 0, not "${values.lines}"`);
  }
  return { filter, count };
}

function levelFrom(value: string | undefined): Level | undefined {
  if (value === undefined) return undefined;
  const level = LEVELS.find((name) => name === value.toUpperCase());
  if (!level) throw new LogOptionInvalid(`--level must be one of ${LEVELS.join(", ")}, not "${value}"`);
  return level;
}

export function matches(entry: LogEntry, { level, event }: LogFilter): boolean {
  if (level && LEVELS.indexOf(entry.level) < LEVELS.indexOf(level)) return false;
  if (event && entry.event !== event && !entry.event.startsWith(`${event}.`)) return false;
  return true;
}

/** The last `count` entries that match, oldest first, from the newest log files back. */
export async function recentEntries(dir: string, filter: LogFilter, count: number): Promise<LogEntry[]> {
  const files = (await logFiles(dir)).reverse();
  const found: LogEntry[] = [];
  for (const file of files) {
    const { lines } = await completeLinesFrom(path.join(dir, file), 0);
    const matching = entriesIn(lines).filter((entry) => matches(entry, filter));
    found.unshift(...matching.slice(-(count - found.length)));
    if (found.length >= count) break;
  }
  return found;
}

/**
 * The whole lines a file holds from a byte offset on, and the offset after the last of them, so a
 * line still being written is read once it is whole. A missing file has none.
 */
export async function completeLinesFrom(file: string, offset: number): Promise<{ lines: string[]; offset: number }> {
  let handle;
  try {
    handle = await open(file, "r");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return { lines: [], offset };
    throw error;
  }
  try {
    const { size } = await handle.stat();
    if (size <= offset) return { lines: [], offset };
    const { buffer } = await handle.read(Buffer.alloc(size - offset), 0, size - offset, offset);
    const end = buffer.lastIndexOf(NEWLINE) + 1;
    const lines = buffer.subarray(0, end).toString("utf8").split("\n").slice(0, -1);
    return { lines, offset: offset + end };
  } finally {
    await handle.close();
  }
}

/** The entries among the lines, skipping any that isn't a log entry. */
export function entriesIn(lines: string[]): LogEntry[] {
  return lines.flatMap((line) => {
    try {
      const entry = JSON.parse(line) as LogEntry;
      return typeof entry.event === "string" && LEVELS.includes(entry.level) ? [entry] : [];
    } catch {
      return [];
    }
  });
}

/**
 * One entry as a line for people: time, level, event and message, then its fields, then any
 * error's stack, indented. Control characters are shown escaped, so text from the browser can't
 * start a line of its own or send the terminal escape sequences.
 */
export function formatEntry({ timestamp, level, event, message, error, ...fields }: LogEntry): string {
  const details = Object.entries(fields).map(([key, value]) => `${key}=${formatValue(value)}`);
  const line = printable([timestamp, level.padEnd(5), event, message, ...details].join(" "));
  return error === undefined ? line : `${line}\n${indent(errorText(error))}`;
}

async function logFiles(dir: string): Promise<string[]> {
  return (await namesInFolder(dir)).filter((name) => LOG_FILE.test(name)).sort();
}

function formatValue(value: unknown): string {
  return typeof value === "string" && PLAIN_VALUE.test(value) ? value : JSON.stringify(value);
}

/** The text with each control character written as `\uXXXX`. */
function printable(text: string): string {
  const escaped = (character: string) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
  return text.replace(CONTROL_CHARACTERS, escaped);
}

function errorText(error: unknown): string {
  const { name, message, stack } = error as { name?: string; message?: string; stack?: string };
  return stack ?? `${name}: ${message}`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${printable(line)}`)
    .join("\n");
}
