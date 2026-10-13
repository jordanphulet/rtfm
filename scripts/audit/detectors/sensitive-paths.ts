import type { Event } from "../events.ts";
import { redirectTargets, type SimpleCommand } from "../shell.ts";
import { bashCommands, bashScript, candidate, scriptCandidate, type Candidate } from "./candidate.ts";

const SENSITIVE: { name: string; pattern: RegExp }[] = [
  { name: "the data folder", pattern: /(?:^|[/=:])\.data(?:\/|$)/ },
  { name: "a local env file", pattern: /(?:^|[/=:])\.env[^/\s]*\.local$/ },
  { name: "the AWS config", pattern: /(?:^|[/=:~])\.aws(?:\/|$)/ },
];
const PATH_INPUTS = ["file_path", "path", "notebook_path"];
const SEARCHES = new Set(["grep", "egrep", "fgrep", "rg", "ag"]);
const PRINTS = new Set(["echo", "printf"]);

/** Tool calls that touch the data folder, a `.env*.local` file or `~/.aws`. */
export function sensitivePaths(events: Event[]): Candidate[] {
  return events.flatMap((event) => {
    if (event.kind !== "tool") return [];
    const paths = bashScript(event) === undefined ? inputPaths(event) : bashCommands(event).flatMap(pathWords);
    const touched = [...new Set(paths.flatMap(sensitiveNames))];
    if (touched.length === 0) return [];
    const note = touched.join(", ");
    return [bashScript(event) === undefined ? candidate(event, `${event.tool} ${paths.join(" ")}`, note) : scriptCandidate(event, note)];
  });
}

function sensitiveNames(path: string): string[] {
  return SENSITIVE.filter(({ pattern }) => pattern.test(path)).map(({ name }) => name);
}

function inputPaths(event: Event): string[] {
  const keys = event.tool === "Glob" ? [...PATH_INPUTS, "pattern"] : PATH_INPUTS;
  return keys.flatMap((key) => (typeof event.input?.[key] === "string" ? [event.input[key] as string] : []));
}

// A search's first argument is its pattern, and what echo prints is text, not paths, though
// where it prints to is one.
function pathWords(command: SimpleCommand): string[] {
  if (PRINTS.has(command[0])) return redirectTargets(command);
  const args = command.slice(1);
  if (!SEARCHES.has(command[0])) return args;
  const pattern = args.findIndex((arg) => !arg.startsWith("-"));
  return args.filter((_, index) => index !== pattern);
}
