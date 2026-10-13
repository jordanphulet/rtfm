import type { Event } from "../events.ts";
import { bashScript, firstLines, type Candidate } from "./candidate.ts";

export type ToolErrorGroup = { firstLine: string; count: number; examples: Candidate[] };

const EXAMPLES = 3;

/**
 * Failed tool calls, grouped by their result's first line. A failed shell command's first line is
 * its exit code, so the line after it joins the key.
 */
export function toolErrors(events: Event[]): ToolErrorGroup[] {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    if (event.kind !== "tool" || !event.isError) continue;
    const key = errorKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups]
    .map(([firstLine, failed]) => ({
      firstLine,
      count: failed.length,
      examples: failed.slice(0, EXAMPLES).map((event) => ({
        time: event.time,
        session: event.session,
        who: event.who,
        what: firstLines(bashScript(event) ?? `${event.tool} ${JSON.stringify(event.input)}`, 3)!,
        result: firstLines(event.result),
      })),
    }))
    .sort((a, b) => b.count - a.count || a.firstLine.localeCompare(b.firstLine));
}

function errorKey(event: Event): string {
  const lines = (event.result ?? "").split("\n").map((line) => line.trim());
  const first = lines[0] ?? "";
  const key = /^Exit code \d+$/.test(first) ? `${first}: ${lines.find((line, index) => index > 0 && line !== "") ?? ""}` : first;
  return `${event.tool}: ${key.slice(0, 200)}`;
}
