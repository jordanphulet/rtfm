import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CO_AUTHOR, changedFiles, git, mainCheckoutProblem, readStatus, worklistTasks } from "./commit-task.ts";

const WORKLIST = "WORKLIST.md";
export const SUBJECT = "Update work list statuses";

const USAGE = `Usage: npm run commit-worklist -- [--reason "<text>"]`;

/**
 * Commits `WORKLIST.md` alone in `repoDir`, the main checkout on `main`, as "Update work list
 * statuses", with a body naming each task added, removed or whose status changed, then `reason`.
 * Returns the body.
 */
export function commitWorklist(repoDir: string, reason?: string): string {
  const problem = mainCheckoutProblem(repoDir);
  if (problem) throw new Error(problem);
  refuseOtherChanges(repoDir);

  const before = git(repoDir, ["show", `HEAD:${WORKLIST}`]);
  const after = readFileSync(path.join(repoDir, WORKLIST), "utf8");
  if (before === after) throw new Error(`${WORKLIST} has no change to commit.`);

  const lines = [...worklistChanges(before, after), ...(reason ? [reason] : [])];
  if (lines.length === 0) {
    throw new Error(`No task was added, removed or changed status: say what changed with --reason "<text>".`);
  }
  const body = lines.join("\n");
  git(repoDir, ["commit", "--cleanup=whitespace", "--file=-", "--", WORKLIST], {
    input: `${SUBJECT}\n\n${body}\n\n${CO_AUTHOR}\n`,
  });
  return body;
}

function refuseOtherChanges(repoDir: string) {
  const others = changedFiles(readStatus(repoDir)).filter((file) => file !== WORKLIST);
  if (others.length === 0) return;
  throw new Error(
    `Only ${WORKLIST} may be changed or staged, but these are too:\n` +
      others.map((file) => `  ${file}\n`).join("") +
      "Commit or set them aside first.",
  );
}

/** One line for each task added, removed, or whose status changed, between two texts of `WORKLIST.md`. */
export function worklistChanges(before: string, after: string): string[] {
  const oldStatuses = new Map(worklistTasks(before).map((task) => [task.id, task.status]));
  const newStatuses = new Map(worklistTasks(after).map((task) => [task.id, task.status]));
  const added = [...newStatuses].filter(([id]) => !oldStatuses.has(id));
  const removed = [...oldStatuses.keys()].filter((id) => !newStatuses.has(id));
  const changed = [...newStatuses].filter(([id, status]) => oldStatuses.has(id) && oldStatuses.get(id) !== status);
  return [
    ...added.map(([id, status]) => `Added ${id} (${status})`),
    ...removed.map((id) => `Removed ${id}`),
    ...changed.map(([id, status]) => `${id}: ${oldStatuses.get(id)} → ${status}`),
  ];
}

function main(args: string[]): number {
  try {
    const reason = parseArgs({ args, options: { reason: { type: "string" } } }).values.reason?.trim();
    if (reason === "") {
      console.error(USAGE);
      return 1;
    }
    const repoDir = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
    const body = commitWorklist(repoDir, reason);
    console.log(`Committed ${SUBJECT}`);
    for (const line of body.split("\n")) console.log(`  ${line}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
