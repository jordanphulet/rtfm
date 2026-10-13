import type { Event } from "../events.ts";
import { redirectTargets, simpleCommands, SUBSTITUTION, type SimpleCommand } from "../shell.ts";
import { bashScript, joinCommands, scriptCandidate, type Candidate } from "./candidate.ts";

/** Where the stopped processes came from (`processStops` says how each is told). */
export type PidSource = "found by port or pattern" | "by name" | "unknown";

export type ProcessStop = Candidate & { source: PidSource[] };

const LOOKUPS = new Set(["lsof", "ps", "pgrep", "fuser"]);
const PID = /\b\d{2,7}\b/g;

/**
 * What one session or subagent has seen: pids its launches printed, pids it looked up, files it
 * wrote a pid to from `$!`, and the files its launches write their output to.
 */
type AgentPids = { launched: Set<string>; lookedUp: Set<string>; pidFiles: Set<string>; outputFiles: Set<string> };

const OUTPUT_TOOLS = new Set(["BashOutput", "TaskOutput"]);
const OUTPUT_PATH = /Output is being written to: (\S+?)\.?(?:\s|$)/;
const READERS = new Set(["cat", "tail", "head", "less"]);

/**
 * Commands that stop a process by port, pattern or name, or by a pid that didn't come from the
 * agent's own launch: `pkill`, `killall`, `fuser -k`, `kill-port`, and `kill` given a pid.
 *
 * Left out as the agent's own, before anything else is asked: `kill $PID` after `PID=$!` in the
 * same call, `kill $(cat <file>)` (or `PID=$(cat <file>); kill $PID`) when the agent wrote the file
 * from `$!`, and `kill <pid>` when the pid was in its own launch output (what a call that started
 * a process in the background printed, or the file it wrote its output to), unless that call also
 * looked pids up. `kill -0` only checks that a process exists.
 *
 * Each stop's source:
 * - `found by port or pattern`: `pkill -f`, `kill-port`, `fuser -k`, `kill` in a call that looks
 *   pids up (`lsof`, `ps` without `-p`, `pgrep`, `fuser`), or a pid such a lookup printed earlier;
 * - `by name`: `pkill` without `-f`, and `killall`;
 * - `unknown`: a pid seen nowhere earlier in the agent's calls, or from `$(…)` (directly or
 *   through a variable assigned from it) that isn't a file it wrote from `$!`. Any other
 *   `kill $VAR` is left out.
 */
export function processStops(events: Event[]): ProcessStop[] {
  const agents = new Map<string, AgentPids>();
  return events.flatMap((event) => {
    if (event.kind !== "tool") return [];
    const key = `${event.session}/${event.agent ?? ""}`;
    const seen = agents.get(key) ?? { launched: new Set(), lookedUp: new Set(), pidFiles: new Set(), outputFiles: new Set() };
    agents.set(key, seen);
    const script = bashScript(event);
    const commands = script === undefined ? [] : simpleCommands(script);
    for (const file of commands.flatMap(pidFilesWritten)) seen.pidFiles.add(file);
    const stops = commands.flatMap((command) => {
      const source = stopSource(command, commands, script ?? "", seen);
      return source ? [{ command, source }] : [];
    });
    remember(event, commands, seen);
    if (stops.length === 0) return [];
    return [
      {
        ...scriptCandidate(event, joinCommands(stops.map(({ command }) => command))),
        source: [...new Set(stops.map(({ source }) => source))],
      },
    ];
  });
}

/** Where `command`'s processes came from, if it stops any the agent may not own. */
function stopSource(command: SimpleCommand, commands: SimpleCommand[], script: string, seen: AgentPids): PidSource | undefined {
  const [name, ...args] = command;
  if (name === "pkill") return args.some((arg) => /^-[a-zA-Z]*f/.test(arg)) ? "found by port or pattern" : "by name";
  if (name === "killall") return "by name";
  if (name === "kill-port" || (name === "npx" && args.includes("kill-port"))) return "found by port or pattern";
  if (name === "fuser") return args.some((arg) => /^-[a-zA-Z]*k/.test(arg)) ? "found by port or pattern" : undefined;
  if (name !== "kill" || checksOnly(args)) return undefined;
  const looksUp = commands.some(isLookup);
  const targets = args.filter((arg) => !arg.startsWith("-"));
  if (targets.length === 0) return looksUp ? "found by port or pattern" : undefined;
  const sources = targets.flatMap((target): PidSource[] => {
    if (/^\d+$/.test(target)) return literalPidSource(target, seen);
    const substituted = target.includes(SUBSTITUTION) || isSubstitutedVariable(target, script);
    if (isOwnVariable(target, script) || (substituted && readsOwnPidFile(commands, seen))) return [];
    if (looksUp) return ["found by port or pattern"];
    return substituted ? ["unknown"] : [];
  });
  return sources.includes("unknown") ? "unknown" : sources[0];
}

// `ps -p <pid>` checks a pid already known; the other lookups find pids by port or pattern.
function isLookup(command: SimpleCommand): boolean {
  if (command[0] === "ps") return !command.some((word) => /^-[a-zA-Z]*p$/.test(word) || word.startsWith("--pid"));
  return LOOKUPS.has(command[0]);
}

// `$PID` or `${PID}`, assigned from `$!` in the same call.
function isOwnVariable(target: string, script: string): boolean {
  return isAssigned(target, script, String.raw`\$!`);
}

// `$PID` or `${PID}`, assigned from `$(…)` in the same call, which is judged like `kill $(…)`.
function isSubstitutedVariable(target: string, script: string): boolean {
  return isAssigned(target, script, String.raw`\$\(`);
}

function isAssigned(target: string, script: string, valueStart: string): boolean {
  const name = /^\$\{?(\w+)\}?$/.exec(target)?.[1];
  return name !== undefined && new RegExp(String.raw`(?:^|[\s;&|(])${name}=${valueStart}`).test(script);
}

// A pid its own launch printed is the agent's; one an earlier lookup printed was found by port or pattern.
function literalPidSource(pid: string, seen: AgentPids): PidSource[] {
  if (seen.launched.has(pid)) return [];
  return [seen.lookedUp.has(pid) ? "found by port or pattern" : "unknown"];
}

// `echo $! > app.pid`: a file the agent wrote its own process's pid to.
function pidFilesWritten(command: SimpleCommand): string[] {
  return command.includes("$!") ? redirectTargets(command) : [];
}

// A `cat` in the call reads a file the agent wrote from `$!`.
function readsOwnPidFile(commands: SimpleCommand[], seen: AgentPids): boolean {
  return commands.some((words) => words[0] === "cat" && words.slice(1).some((file) => seen.pidFiles.has(file)));
}

// The pids a call printed: looked up, if it looked pids up, even beside a launch; else the
// agent's own, if it is a launch or reads a launch's output.
function remember(event: Event, commands: SimpleCommand[], seen: AgentPids) {
  const pids = (event.result ?? "").match(PID) ?? [];
  const launch = isLaunch(event);
  if (launch) {
    for (const file of commands.flatMap(redirectTargets)) seen.outputFiles.add(file);
    const outputPath = OUTPUT_PATH.exec(event.result ?? "")?.[1];
    if (outputPath) seen.outputFiles.add(outputPath);
  }
  if (commands.some(isLookup)) {
    for (const pid of pids) seen.lookedUp.add(pid);
  } else if (launch || readsLaunchOutput(event, commands, seen)) {
    for (const pid of pids) seen.launched.add(pid);
  }
}

// A call that leaves a process running: run in the background, or with `&`, `$!` or `nohup`.
function isLaunch(event: Event): boolean {
  const script = bashScript(event);
  if (script === undefined) return false;
  return event.input?.run_in_background === true || /\$!|\bnohup\b|(?:^|[^&>|])&(?![&>])/.test(script);
}

function readsLaunchOutput(event: Event, commands: SimpleCommand[], seen: AgentPids): boolean {
  if (OUTPUT_TOOLS.has(event.tool ?? "")) return true;
  if (event.tool === "Read") return seen.outputFiles.has(String(event.input?.file_path));
  return commands.some((words) => READERS.has(words[0]) && words.slice(1).some((file) => seen.outputFiles.has(file)));
}

function checksOnly(args: string[]): boolean {
  return args[0] === "-0" || (args[0] === "-s" && args[1] === "0");
}
