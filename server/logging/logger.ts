export const LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
export type Level = (typeof LEVELS)[number];

/** Flat values only: an entry's one nested field is its `error`. */
export type LogFields = Record<string, string | number | boolean | undefined>;

export interface LogEntry {
  timestamp: string;
  level: Level;
  event: string;
  message: string;
  [field: string]: unknown;
}

/** Receives each entry and its JSON line. A sink must never throw. */
export type LogSink = (line: string, entry: LogEntry) => void;

export type LogMethod = (event: string, message: string, fields?: LogFields, error?: unknown) => void;

export interface Logger {
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

/**
 * Writes each entry as one JSON object, shaped for CloudWatch: `timestamp`, `level`, `event` and
 * `message`, then the flat fields, then any `error` as `{ name, message, stack }`.
 */
export function createLogger(sinks: LogSink[], now = () => new Date()): Logger {
  const at =
    (level: Level): LogMethod =>
    (event, message, fields = {}, error) => {
      const entry: LogEntry = { timestamp: now().toISOString(), level, event, message, ...fields };
      if (error !== undefined) entry.error = errorDetails(error);
      const line = JSON.stringify(entry);
      for (const sink of sinks) sink(line, entry);
    };
  return { info: at("INFO"), warn: at("WARN"), error: at("ERROR") };
}

export const silentLogger = createLogger([]);

/** Standard output, written to directly: Lambda's `console` would prefix each line. */
export const toStandardOutput: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

export const toStandardError: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};

function errorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: typeof error, message: String(error) };
}
