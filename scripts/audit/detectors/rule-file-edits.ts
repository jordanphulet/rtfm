import type { Event } from "../events.ts";
import { editedFile, writtenFiles } from "../file-writes.ts";
import { candidate, scriptCandidate, type Candidate } from "./candidate.ts";

const RULE_FILES = new Set(["CLAUDE.md", "PROCESS.md", "WORKLIST.md"]);

/**
 * Edits to `CLAUDE.md`, `PROCESS.md`, `WORKLIST.md` and anything under `.claude/` in this repo or
 * its worktrees, by a tool or a shell command (`file-writes.ts` says which files a command
 * writes). The orchestrator edits `WORKLIST.md` by design, so only a subagent's edit of it counts.
 */
export function ruleFileEdits(events: Event[], repoDir: string): Candidate[] {
  return events.flatMap((event) => {
    const edited = writtenFiles(event, repoDir).filter(({ inCheckout }) => isReported(inCheckout, event));
    if (edited.length === 0) return [];
    const file = editedFile(event);
    return [
      file === undefined
        ? scriptCandidate(event, edited.map(({ file }) => file).join(", "))
        : candidate(event, `${event.tool} ${file}`),
    ];
  });
}

/** Whether `file`, a path within a checkout, is a rule file. */
export function isRuleFile(file: string): boolean {
  return RULE_FILES.has(fileName(file)) || file.startsWith(".claude/");
}

function isReported(file: string | undefined, event: Event): boolean {
  return file !== undefined && isRuleFile(file) && (event.agent !== undefined || fileName(file) !== "WORKLIST.md");
}

function fileName(file: string): string {
  return file.split("/").at(-1) ?? "";
}
