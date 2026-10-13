import type { Event } from "../events.ts";
import { bashCommands } from "./candidate.ts";

const RULE_FILES = ["CLAUDE.md", "PROCESS.md", "WORKLIST.md"] as const;
const READERS = new Set(["cat", "head", "tail", "less", "more", "bat", "nl", "sed", "awk"]);

export type LoopPass = {
  session: string;
  who: string;
  /** The pass's first and last events, ISO 8601, UTC. */
  start: string;
  end: string;
  /** Whether the pass read each file. */
  read: Record<(typeof RULE_FILES)[number], boolean>;
};

/**
 * Each pass of an orchestrator's loop: a session's own events (not its subagents') up to and
 * including a `ScheduleWakeup` call, which ends the pass, and whether the pass read `CLAUDE.md`,
 * `PROCESS.md` and `WORKLIST.md` (with the Read tool, or `cat`, `head`, `sed` and the like).
 */
export function loopPasses(events: Event[]): LoopPass[] {
  const passes: LoopPass[] = [];
  const open = new Map<string, Event[]>();
  for (const event of events) {
    if (event.agent !== undefined) continue;
    const pass = [...(open.get(event.session) ?? []), event];
    open.set(event.session, pass);
    if (event.kind !== "tool" || event.tool !== "ScheduleWakeup") continue;
    passes.push(summary(pass));
    open.delete(event.session);
  }
  return passes;
}

function summary(pass: Event[]): LoopPass {
  const read = Object.fromEntries(RULE_FILES.map((file) => [file, pass.some((event) => reads(event, file))])) as LoopPass["read"];
  return { session: pass[0].session, who: pass[0].who, start: pass[0].time, end: pass.at(-1)!.time, read };
}

function reads(event: Event, file: string): boolean {
  const isFile = (path: unknown) => typeof path === "string" && path.split("/").at(-1) === file;
  if (event.kind === "tool" && event.tool === "Read") return isFile(event.input?.file_path);
  return bashCommands(event).some((command) => READERS.has(command[0]) && command.slice(1).some(isFile));
}
