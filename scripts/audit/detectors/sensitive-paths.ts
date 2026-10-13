import type { Event } from "../events.ts";
import { editedFile, shellWrites } from "../file-writes.ts";
import { redirectTargets, type SimpleCommand } from "../shell.ts";
import { bashCommands, bashScript, candidate, scriptCandidate, type Candidate } from "./candidate.ts";

/** Touches of the sensitive paths, split by what the call did to them. */
export type SensitivePaths = { writes: Candidate[]; reads: Candidate[]; runtimeLoads: Candidate[] };

type Access = keyof SensitivePaths;

const SENSITIVE: { name: string; pattern: RegExp }[] = [
  { name: "the data folder", pattern: /(?:^|[/=:])\.data(?:\/|$)/ },
  { name: "a local env file", pattern: /(?:^|[/=:])\.env[^/\s]*\.local$/ },
  { name: "the AWS config", pattern: /(?:^|[/=:~])\.aws(?:\/|$)/ },
];
const PATH_INPUTS = ["file_path", "path", "notebook_path"];
const SEARCHES = new Set(["grep", "egrep", "fgrep", "rg", "ag"]);
const PRINTS = new Set(["echo", "printf"]);
const RUNNERS = new Set(["node", "npx", "npm", "tsx", "deno", "bun", "python", "python3"]);
const EXCLUDE_OPTIONS = /^--exclude(?:-dir)?(?:=|$)/;

/**
 * Tool calls that touch the data folder, a `.env*.local` file or `~/.aws`:
 * - `writes`: an edit tool, or a shell command that writes the path (as `file-writes.ts` reads it);
 * - `runtimeLoads`: the path given to a script run by `node`, `npx`, `npm` and the like, which
 *   loads it at runtime;
 * - `reads`: any other touch.
 * A search's pattern, what `echo` or `printf` print, and a path given to `--exclude` or
 * `--exclude-dir` don't count.
 */
export function sensitivePaths(events: Event[]): SensitivePaths {
  const found: SensitivePaths = { writes: [], reads: [], runtimeLoads: [] };
  for (const event of events) {
    if (event.kind !== "tool") continue;
    const touches = bashScript(event) === undefined ? toolTouches(event) : scriptTouches(event);
    for (const [access, touch] of touches) found[access].push(touch);
  }
  return found;
}

function toolTouches(event: Event): [Access, Candidate][] {
  const paths = inputPaths(event);
  const touched = sensitiveNames(paths);
  if (!touched) return [];
  const access = editedFile(event) === undefined ? "reads" : "writes";
  return [[access, candidate(event, `${event.tool} ${paths.join(" ")}`, touched)]];
}

function scriptTouches(event: Event): [Access, Candidate][] {
  const byAccess = new Map<Access, string[]>();
  for (const command of bashCommands(event)) {
    for (const [access, paths] of commandPaths(command)) byAccess.set(access, [...(byAccess.get(access) ?? []), ...paths]);
  }
  return [...byAccess].flatMap(([access, paths]): [Access, Candidate][] => {
    const touched = sensitiveNames(paths);
    return touched ? [[access, scriptCandidate(event, touched)]] : [];
  });
}

function sensitiveNames(paths: string[]): string | undefined {
  const names = SENSITIVE.filter(({ pattern }) => paths.some((path) => pattern.test(path))).map(({ name }) => name);
  return names.length > 0 ? names.join(", ") : undefined;
}

function inputPaths(event: Event): string[] {
  const keys = event.tool === "Glob" ? [...PATH_INPUTS, "pattern"] : PATH_INPUTS;
  return keys.flatMap((key) => (typeof event.input?.[key] === "string" ? [event.input[key] as string] : []));
}

/** The paths a simple command touches, by how it touches them. */
function commandPaths(command: SimpleCommand): [Access, string[]][] {
  const written = shellWrites(command);
  const others = pathWords(command).filter((word) => !written.includes(word));
  const rest: Access = RUNNERS.has(command[0]) ? "runtimeLoads" : "reads";
  return [
    ["writes", written],
    [rest, others],
  ];
}

// A search's first argument is its pattern, what echo prints is text, not paths (though where it
// prints to is one), and what is excluded from a search isn't touched.
function pathWords(command: SimpleCommand): string[] {
  if (PRINTS.has(command[0])) return redirectTargets(command);
  const args = withoutExcludes(command.slice(1));
  if (!SEARCHES.has(command[0])) return args;
  const pattern = args.findIndex((arg) => !arg.startsWith("-"));
  return args.filter((_, index) => index !== pattern);
}

function withoutExcludes(args: string[]): string[] {
  return args.filter((arg, index) => !EXCLUDE_OPTIONS.test(arg) && !/^--exclude(?:-dir)?$/.test(args[index - 1] ?? ""));
}
