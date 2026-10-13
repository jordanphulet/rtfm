import { describe, expect, it } from "vitest";
import { createLogger, type LogEntry } from "./logger.ts";

const NOW = new Date("2026-10-12T18:30:00.123Z");

function capture() {
  const lines: string[] = [];
  const entries: LogEntry[] = [];
  const logger = createLogger(
    [
      (line, entry) => {
        lines.push(line);
        entries.push(entry);
      },
    ],
    () => NOW,
  );
  return { logger, lines, entries };
}

describe("the logger", () => {
  it("writes one JSON object per line: timestamp, level, event and message first, then flat fields", () => {
    const { logger, lines } = capture();
    logger.info("request", "GET /api/manuals 200", { method: "GET", status: 200, clientClosed: undefined });

    expect(lines).toEqual([
      '{"timestamp":"2026-10-12T18:30:00.123Z","level":"INFO","event":"request","message":"GET /api/manuals 200","method":"GET","status":200}',
    ]);
    expect(lines[0]).not.toContain("\n");
  });

  it("uses the levels Lambda's log-level filtering reads", () => {
    const { logger, entries } = capture();
    logger.info("a", "a");
    logger.warn("b", "b");
    logger.error("c", "c");
    expect(entries.map(({ level }) => level)).toEqual(["INFO", "WARN", "ERROR"]);
  });

  it("nests an error, and only an error, as its name, message and stack", () => {
    const { logger, entries } = capture();
    const error = new TypeError("broken");
    logger.error("request.failed", "GET /api/x failed", { path: "/api/x" }, error);

    expect(entries[0]).toEqual({
      timestamp: NOW.toISOString(),
      level: "ERROR",
      event: "request.failed",
      message: "GET /api/x failed",
      path: "/api/x",
      error: { name: "TypeError", message: "broken", stack: error.stack },
    });
  });

  it("logs a thrown value that isn't an Error by its type and text", () => {
    const { logger, entries } = capture();
    logger.error("server.crashed", "crashed", {}, "a string");
    expect(entries[0].error).toEqual({ name: "string", message: "a string" });
  });

  it("gives every sink the same line", () => {
    const first: string[] = [];
    const second: string[] = [];
    const logger = createLogger([(line) => first.push(line), (line) => second.push(line)], () => NOW);
    logger.warn("section.refused", "Refused");
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
  });
});
