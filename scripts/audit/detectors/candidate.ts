import type { Event } from "../events.ts";
import { simpleCommands, type SimpleCommand } from "../shell.ts";

/** A place in the transcripts worth reading: a starting point, not a verdict. */
export type Candidate = {
  time: string;
  session: string;
  who: string;
  what: string;
  result?: string;
  note?: string;
};

const RESULT_LINES = 6;
const SCRIPT_LINES = 10;
const RESULT_LINE_LENGTH = 200;

export function candidate(event: Event, what: string, note?: string): Candidate {
  return { time: event.time, session: event.session, who: event.who, what, result: firstLines(event.result), note };
}

export function firstLines(text: string | undefined, count = RESULT_LINES): string | undefined {
  if (text === undefined) return undefined;
  return text
    .split("\n")
    .slice(0, count)
    .map((line) => (line.length > RESULT_LINE_LENGTH ? `${line.slice(0, RESULT_LINE_LENGTH)}…` : line))
    .join("\n");
}

/** The shell script a Bash tool call ran, if `event` is one. */
export function bashScript(event: Event): string | undefined {
  if (event.kind !== "tool" || event.tool !== "Bash") return undefined;
  return typeof event.input?.command === "string" ? event.input.command : undefined;
}

export function bashCommands(event: Event): SimpleCommand[] {
  const script = bashScript(event);
  return script === undefined ? [] : simpleCommands(script);
}

/** A candidate for a shell command, with a note on what in it is of interest. */
export function scriptCandidate(event: Event, note: string): Candidate {
  return candidate(event, firstLines(bashScript(event), SCRIPT_LINES) ?? "", note);
}

export function joinCommands(commands: SimpleCommand[]): string {
  return commands.map((words) => words.join(" ")).join("; ");
}
