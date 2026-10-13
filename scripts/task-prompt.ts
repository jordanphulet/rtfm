import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { blockEnd, findItem, findTaskBlock } from "./commit-task.ts";

const WORKLIST_FILE = fileURLToPath(new URL("../WORKLIST.md", import.meta.url));
const USAGE = "Usage: npm run task-prompt -- <ID> [--review]";

export type Role = "task" | "review";

/** The prompt that starts task `id`'s agent, or with `role` "review", its reviewer. */
export function taskPrompt(worklist: string, id: string, role: Role): string {
  const lines = worklist.split("\n");
  const block = findTaskBlock(lines, id);
  if (!block) throw new Error(`There is no task ${id} in WORKLIST.md.`);
  const task = [...phaseOf(lines, block.start), withoutStatus(trimmed(lines.slice(block.start, block.end)))];
  const excerpt = task.map((part) => part.join("\n")).join("\n\n");
  return role === "task" ? taskAgentPrompt(id, excerpt) : reviewerPrompt(id, excerpt);
}

/** The phase heading and intro above the task, and the phase's "Rules for this phase", if it has them. */
function phaseOf(lines: string[], taskStart: number): string[][] {
  const start = lines.findLastIndex((line, index) => index < taskStart && line.startsWith("## "));
  if (start === -1) return [];
  const intro = trimmed(lines.slice(start, blockEnd(lines, start)));
  const nextPhase = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const phase = lines.slice(start, nextPhase === -1 ? undefined : nextPhase);
  const rulesStart = phase.indexOf("### Rules for this phase");
  if (rulesStart === -1) return [intro];
  return [intro, trimmed(phase.slice(rulesStart, blockEnd(phase, rulesStart)))];
}

function withoutStatus(block: string[]): string[] {
  const status = findItem(block, "- **Status:**");
  return status ? [...block.slice(0, status.start), ...block.slice(status.end)] : block;
}

function trimmed(lines: string[]): string[] {
  const first = lines.findIndex((line) => line.trim() !== "");
  const last = lines.findLastIndex((line) => line.trim() !== "");
  return first === -1 ? [] : lines.slice(first, last + 1);
}

function taskAgentPrompt(id: string, excerpt: string): string {
  return `You are a **task agent** in the RTFM repo, working in your own git worktree on your own branch. Your current folder is that worktree, and every path here is relative to the repo root. Do task ${id} and report back.

**First step:** run \`npm ci\` in your worktree.

Read first: \`CLAUDE.md\` (the rules, especially Code standards and Shell) and \`PROCESS.md\` (your role and its Rules) as committed on \`main\` (\`git show main:<file>\`), since your worktree's copy can go stale (\`PROCESS.md\` › How rules spread); then the docs in \`README.md\` › The docs that bear on the task.

Standing rules (\`PROCESS.md\` › Rules and \`CLAUDE.md\` have them in full):
- Change the files in the task's **Files**. If you need another file, change it and list it in your report under "Outside Files" with the reason. Working around a missing file (duplicating code, putting code in the wrong place, editing through the shell) is a failure.
- Run no git command that changes anything; read-only ones are fine. Don't edit \`WORKLIST.md\`.
- Any server you start is \`npm run serve-temp\`, in the background; never \`npm run dev\`.
- Stop only processes you started, by the handle or PID you got when starting them: never a PID looked up by port or name, never \`pkill\`.
- Never read, print, copy or edit \`.env.local\`.
- A change to \`CLAUDE.md\`, \`PROCESS.md\`, \`.claude/settings.json\` or hooks needs the user's approval: make it in your worktree, give its full diff in your report, and don't treat it as approved.
- Docs describe what exists: no decision lists, plans or status in docs. A decision changes the doc, code or task it governs. Planned work belongs in \`WORKLIST.md\`, which only the orchestrator edits: name it in your report.
- zsh: quote arguments that start with \`=\`.

**The task**, under its phase, from \`WORKLIST.md\`:

${excerpt}

Report back with: your worktree's path and branch (\`git rev-parse --show-toplevel\`, \`git branch --show-current\`), the files you changed and any "Outside Files" with the reason, the checks you ran and what they showed, and anything unresolved.`;
}

function reviewerPrompt(id: string, excerpt: string): string {
  return `You are a **reviewer** in the RTFM repo. Review the change a task agent made for task ${id} in its own git worktree, and report your findings. You are read-only: change no files, and run no git command that changes anything.

The worktree's path and the agent's Outside Files are at the end of this prompt. Paths here are relative to the repo root: read the change's files under the worktree's path (\`<worktree>/scripts/x.ts\`), never at the same path in your own folder, which holds \`main\`'s older versions. The change is uncommitted: \`git -C <worktree> status\` lists every changed file, and \`git -C <worktree> diff\` shows the changes to tracked ones. New files are untracked, so \`git diff\` doesn't show them: read them directly.

Read first: \`CLAUDE.md\` (especially Code standards) and \`PROCESS.md\` (the reviewer's role and the Rules task agents follow) as committed on \`main\` (\`git show main:<file>\`); then the docs in \`README.md\` › The docs that bear on the change, the design docs for UI work.

Check the change against:
- every item in the task's **Done when**;
- its **Files**: every changed file is in them, or is in the agent's Outside Files at the end with a reason that holds;
- \`CLAUDE.md\` › Code standards, docs that describe what exists included.

Run the task's checks in the worktree (\`npm ci\` there first if \`node_modules\` is missing). Any server you start for a check is \`npm run serve-temp\`, in the background, stopped by its handle or the PID it prints. Never read, print, copy or edit \`.env.local\`. zsh: quote arguments that start with \`=\`.

**The task**, under its phase, from \`WORKLIST.md\`:

${excerpt}

Report your findings, most serious first, each with its file and line, a concrete failure and what to change; say which must be fixed before commit. Then say which checks you ran. If there is nothing to change, say so.

**Worktree:** <path>. **The agent's Outside Files:** <list, or none>.`;
}

function main(args: string[]): number {
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { review: { type: "boolean" } } });
    if (positionals.length !== 1) {
      console.error(USAGE);
      return 1;
    }
    console.log(taskPrompt(readFileSync(WORKLIST_FILE, "utf8"), positionals[0], values.review ? "review" : "task"));
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
