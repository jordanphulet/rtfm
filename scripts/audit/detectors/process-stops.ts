import type { Event } from "../events.ts";
import { simpleCommands, SUBSTITUTION, type SimpleCommand } from "../shell.ts";
import { bashScript, joinCommands, scriptCandidate, type Candidate } from "./candidate.ts";

const LOOKUPS = new Set(["lsof", "ps", "pgrep", "fuser"]);

/**
 * Commands that stop processes the session may not own: `pkill`, `killall`, `fuser -k`,
 * `kill-port`, and `kill` given a literal pid (most likely looked up in an earlier call) or a pid
 * it looked up (with `$(…)`, backticks, `lsof`, `ps`, `pgrep` or `fuser`). `kill $PID` after
 * `PID=$!` stops a process the session started, and `kill -0` only checks that one exists, so
 * both are left out.
 */
export function processStops(events: Event[]): Candidate[] {
  return events.flatMap((event) => {
    const script = bashScript(event);
    if (script === undefined) return [];
    const commands = simpleCommands(script);
    const looksUpPids = commands.some((words) => LOOKUPS.has(words[0]));
    const stops = commands.filter((words) => stopsProcesses(words, looksUpPids));
    if (stops.length === 0) return [];
    return [scriptCandidate(event, joinCommands(stops))];
  });
}

function stopsProcesses(command: SimpleCommand, looksUpPids: boolean): boolean {
  const [name, ...args] = command;
  if (name === "pkill" || name === "killall" || name === "kill-port") return true;
  if (name === "npx") return args.includes("kill-port");
  if (name === "fuser") return args.some((arg) => /^-[a-zA-Z]*k/.test(arg));
  if (name !== "kill" || checksOnly(args)) return false;
  const targets = args.filter((arg) => !arg.startsWith("-"));
  return looksUpPids || targets.some((target) => /^\d+$/.test(target) || target.includes(SUBSTITUTION));
}

function checksOnly(args: string[]): boolean {
  return args[0] === "-0" || (args[0] === "-s" && args[1] === "0");
}
