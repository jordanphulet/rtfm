import type { SimpleCommand } from "./shell.ts";

const GLOBAL_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

const READ_ONLY = new Set([
  "status", "log", "diff", "show", "blame", "grep", "ls-files", "ls-tree", "ls-remote", "rev-parse",
  "rev-list", "describe", "shortlog", "cat-file", "merge-base", "for-each-ref", "show-ref",
  "name-rev", "check-ignore", "check-attr", "help", "version", "var", "count-objects", "cherry",
  "whatchanged", "range-diff", "diff-tree", "diff-files", "diff-index", "format-patch", "archive",
  "fsck", "verify-commit", "verify-tag",
]);

const BRANCH_WRITES = ["-d", "-D", "-m", "-M", "-c", "-C", "-f", "-u", "--delete", "--move", "--copy", "--force", "--set-upstream-to", "--unset-upstream", "--edit-description"];
const BRANCH_LISTS = ["-l", "--list", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at"];

/** Whether each subcommand, given its arguments, only reads; any subcommand not listed writes. */
const READ_ONLY_WHEN: Record<string, (args: string[]) => boolean> = {
  stash: (args) => ["list", "show"].includes(args[0]),
  tag: (args) => positionals(args).length === 0 || hasAny(args, ["-l", "--list", "-v", "--verify", "--contains", "--points-at"]),
  branch: (args) =>
    !hasAny(args, BRANCH_WRITES) && (positionals(args).length === 0 || hasAny(args, BRANCH_LISTS)),
  worktree: (args) => args[0] === "list",
  remote: (args) => args.length === 0 || ["-v", "show", "get-url"].includes(args[0]),
  config: (args) =>
    hasAny(args, ["--get", "--get-all", "--get-regexp", "-l", "--list"]) ||
    (positionals(args).length === 1 && !hasAny(args, ["--unset", "--unset-all", "--add"])),
  notes: (args) => args.length === 0 || ["list", "show"].includes(args[0]),
  submodule: (args) => args.length === 0 || ["status", "summary"].includes(args[0]),
  reflog: (args) => args.length === 0 || args[0] === "show",
  "symbolic-ref": (args) => positionals(args).length === 1 && !hasAny(args, ["-d", "--delete"]),
  apply: (args) => hasAny(args, ["--check", "--stat", "--numstat", "--summary"]) && !args.includes("--apply"),
  mv: isDryRun,
  rm: isDryRun,
  add: isDryRun,
  clean: isDryRun,
  "hash-object": (args) => !hasAny(args, ["-w"]),
  commit: (args) => args.includes("--dry-run"),
  push: isDryRun,
};

/** A git command's subcommand and its arguments, after git's own options; undefined if `command` isn't git. */
export function gitSubcommand(command: SimpleCommand): { name: string; args: string[] } | undefined {
  if (command[0] !== "git") return undefined;
  let i = 1;
  while (command[i]?.startsWith("-")) {
    i += GLOBAL_OPTIONS_WITH_VALUE.has(command[i]) ? 2 : 1;
  }
  const name = command[i];
  return name === undefined ? undefined : { name, args: command.slice(i + 1) };
}

/** Whether `command` is a git command that changes the repository, its index or its worktrees. */
export function isGitWrite(command: SimpleCommand): boolean {
  const subcommand = gitSubcommand(command);
  if (!subcommand) return false;
  const { name, args } = subcommand;
  if (READ_ONLY.has(name)) return false;
  const readOnlyWhen = READ_ONLY_WHEN[name];
  return !readOnlyWhen?.(args);
}

// `-n` or `--dry-run`, alone or among other short flags (`git clean -nd`).
function isDryRun(args: string[]): boolean {
  return args.some((arg) => arg === "--dry-run" || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(arg));
}

function positionals(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-"));
}

function hasAny(args: string[], flags: string[]): boolean {
  return args.some((arg) => flags.includes(arg) || flags.some((flag) => flag.startsWith("--") && arg.startsWith(`${flag}=`)));
}
