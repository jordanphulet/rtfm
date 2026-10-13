import type { Event } from "../events.ts";
import { gitSubcommand } from "../git-commands.ts";
import { redirectTargets, type SimpleCommand } from "../shell.ts";
import { bashCommands, candidate, scriptCandidate, type Candidate } from "./candidate.ts";

const RULE_FILES = new Set(["CLAUDE.md", "PROCESS.md", "WORKLIST.md"]);
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
const WRITING_COMMANDS = new Set(["tee", "mv", "cp", "rm", "touch", "truncate", "ln", "install"]);
const IN_PLACE_EDITORS = new Set(["sed", "perl"]);
const GIT_FILE_WRITES = new Set(["mv", "rm", "checkout", "restore"]);

/**
 * Edits to `CLAUDE.md`, `PROCESS.md`, `WORKLIST.md` and anything under `.claude/`, by a tool or a
 * shell command. The orchestrator edits `WORKLIST.md` by design, so only a subagent's edit of it
 * counts.
 */
export function ruleFileEdits(events: Event[]): Candidate[] {
  return events.flatMap((event) => {
    if (event.kind !== "tool") return [];
    if (EDIT_TOOLS.has(event.tool ?? "")) {
      const file = event.input?.file_path ?? event.input?.notebook_path;
      return typeof file === "string" && isReported(file, event) ? [candidate(event, `${event.tool} ${file}`)] : [];
    }
    const edited = [...new Set(bashCommands(event).flatMap(writtenWords))].filter((file) => isReported(file, event));
    if (edited.length === 0) return [];
    return [scriptCandidate(event, edited.join(", "))];
  });
}

/** Whether `file` is a rule file: in a worktree, its path within the worktree is what counts. */
export function isRuleFile(file: string): boolean {
  const withinCheckout = file.replace(/^(?:.*\/)?\.claude\/worktrees\/[^/]+\/?/, "");
  const name = withinCheckout.split("/").at(-1) ?? "";
  return RULE_FILES.has(name) || /(?:^|\/)\.claude\//.test(withinCheckout);
}

function isReported(file: string, event: Event): boolean {
  return isRuleFile(file) && (event.agent !== undefined || file.split("/").at(-1) !== "WORKLIST.md");
}

function writtenWords(command: SimpleCommand): string[] {
  const redirected = redirectTargets(command);
  const editsInPlace = IN_PLACE_EDITORS.has(command[0]) && command.some((word) => /^-[a-z]*i/.test(word) || word === "--in-place");
  if (WRITING_COMMANDS.has(command[0]) || editsInPlace || changesGitFiles(command)) return [...command.slice(1), ...redirected];
  return redirected;
}

// Staging or committing a file doesn't change it; moving, removing or restoring it does.
function changesGitFiles(command: SimpleCommand): boolean {
  const subcommand = gitSubcommand(command);
  if (!subcommand || !GIT_FILE_WRITES.has(subcommand.name)) return false;
  return !subcommand.args.some((arg) => arg === "--staged" || arg === "--cached" || arg === "-n" || arg === "--dry-run");
}
