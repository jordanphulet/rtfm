import path from "node:path";
import type { Event } from "./events.ts";
import { gitSubcommand } from "./git-commands.ts";
import { redirectTargets, simpleCommands, SUBSTITUTION, type SimpleCommand } from "./shell.ts";

/** A file a tool call writes: as the call names it, and its path within the checkout it is in, if any. */
export type WrittenFile = { file: string; inCheckout?: string };

const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

const WRITING_COMMANDS = new Set(["tee", "mv", "rm", "touch", "truncate", "install", "mkdir"]);
const COPYING_COMMANDS = new Set(["cp", "ln"]);
const IN_PLACE_EDITORS = new Set(["sed", "perl"]);
const GIT_FILE_WRITES = new Set(["mv", "rm", "checkout", "restore"]);

/** The file an edit tool (Edit, MultiEdit, Write, NotebookEdit) changed, if `event` is one. */
export function editedFile(event: Event): string | undefined {
  if (event.kind !== "tool" || !EDIT_TOOLS.has(event.tool ?? "")) return undefined;
  const file = event.input?.file_path ?? event.input?.notebook_path;
  return typeof file === "string" ? file : undefined;
}

/**
 * The files a tool call writes: an edit tool's file, or what its shell commands write. A relative
 * path is taken from the event's working folder as the script's `cd` commands change it; after a
 * `cd` to a folder that can't be told (`cd $DIR`), it is outside every checkout.
 */
export function writtenFiles(event: Event, repoDir: string): WrittenFile[] {
  const edited = editedFile(event);
  const start = event.cwd ?? repoDir;
  if (edited !== undefined) return [{ file: edited, inCheckout: checkoutPath(edited, start, repoDir) }];
  if (event.kind !== "tool" || event.tool !== "Bash" || typeof event.input?.command !== "string") return [];
  const written = new Map<string, WrittenFile>();
  let dir: string | undefined = start;
  for (const command of simpleCommands(event.input.command)) {
    if (command[0] === "cd") dir = changedDir(dir, command[1]);
    for (const file of shellWrites(command)) {
      const from = path.isAbsolute(file) ? "/" : dir;
      written.set(file, { file, inCheckout: from === undefined ? undefined : checkoutPath(file, from, repoDir) });
    }
  }
  return [...written.values()];
}

/**
 * The files a simple command writes: where it redirects to, what `tee`, `mv`, `rm`, `touch` and
 * the like are given, what `sed -i` or `perl -i` edit (not their script), the destination of
 * `cp` or `ln`, and the files `git mv`, `rm`, `checkout` or `restore` change (not when they only stage).
 */
export function shellWrites(command: SimpleCommand): string[] {
  const redirected = redirectTargets(command);
  const [name, ...args] = command;
  const git = gitSubcommand(command);
  if (git && changesGitFiles(git.name, git.args)) return [...positionals(git.args), ...redirected];
  if (COPYING_COMMANDS.has(name)) return [...copyDestination(args), ...redirected];
  if (WRITING_COMMANDS.has(name)) return [...positionals(args), ...redirected];
  if (IN_PLACE_EDITORS.has(name) && args.some((arg) => /^-[a-z]*i/.test(arg) || arg === "--in-place")) {
    return [...editedInPlace(args), ...redirected];
  }
  return redirected;
}

/**
 * The path of `file` within the checkout it is in, the main one or a worktree under
 * `.claude/worktrees/`; undefined when it is outside the repo or can't be told (`~`, `$VAR`,
 * `$(…)`). A relative path is taken from `cwd`.
 */
export function checkoutPath(file: string, cwd: string, repoDir: string): string | undefined {
  if (!isKnownPath(file)) return undefined;
  const relative = path.relative(repoDir, path.resolve(cwd, file));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return relative.replace(/^\.claude\/worktrees\/[^/]+\/?/, "");
}

// `cd` alone goes home, which is outside the repo.
function changedDir(dir: string | undefined, target: string | undefined): string | undefined {
  if (target === undefined || !isKnownPath(target) || target === "-") return undefined;
  if (path.isAbsolute(target)) return target;
  return dir === undefined ? undefined : path.resolve(dir, target);
}

function isKnownPath(file: string): boolean {
  return file !== "" && !/^[~$]/.test(file) && !file.includes(SUBSTITUTION);
}

// `cp a b dest`, `cp -t dest a b`, `ln -s target link`.
function copyDestination(args: string[]): string[] {
  const target = args.findIndex((arg) => arg === "-t" || arg === "--target-directory");
  if (target !== -1) return args[target + 1] === undefined ? [] : [args[target + 1]];
  const inline = args.find((arg) => arg.startsWith("--target-directory="));
  if (inline) return [inline.slice("--target-directory=".length)];
  const files = positionals(args);
  return files.length >= 2 ? [files.at(-1)!] : [];
}

// The files `sed -i` or `perl -i` edit: not the script, whether it comes first or after `-e`/`-f`.
function editedInPlace(args: string[]): string[] {
  const files: string[] = [];
  let scriptGiven = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-e" || args[i] === "-f") {
      scriptGiven = true;
      i++;
    } else if (!args[i].startsWith("-") && args[i] !== "") {
      files.push(args[i]);
    }
  }
  return scriptGiven ? files : files.slice(1);
}

function positionals(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-") && !arg.startsWith(">") && arg !== "");
}

// Staging or committing a file doesn't change it; moving, removing or restoring it does.
function changesGitFiles(name: string, args: string[]): boolean {
  if (!GIT_FILE_WRITES.has(name)) return false;
  return !args.some((arg) => arg === "--staged" || arg === "--cached" || arg === "-n" || arg === "--dry-run");
}
