import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAIN, type WorklistTask, git, mainCheckoutProblem, worklistTasks } from "./commit-task.ts";

const TASK_BRANCH_PREFIX = "worktree-agent-";
type TaskWorktree = { path: string; branch: string; agent: string; ahead: string[]; uncommitted?: string[] };
type Leftovers = { tasks: WorklistTask[]; worktrees: TaskWorktree[] };

/**
 * What must be fixed before the orchestrator starts in `top`, a checkout's top folder, each naming
 * how; empty when nothing must. Outside the main checkout on `main`, that is the only problem it
 * names.
 */
export function preflightProblems(top: string): string[] {
  const placeProblem = mainCheckoutProblem(top);
  if (placeProblem) return [placeProblem];
  return [uncommittedProblem(top), hooksPathProblem(top)].filter((problem) => problem !== undefined);
}

function uncommittedProblem(top: string): string | undefined {
  const changes = statusLines(top);
  if (changes.length === 0) return undefined;
  const lines = ["The main checkout has uncommitted changes:", ...indent(changes), "Commit them or set them aside first."];
  return lines.join("\n");
}

function hooksPathProblem(top: string): string | undefined {
  const expected = path.join(top, ".githooks");
  const setting = hooksPath(top);
  const resolved = setting === undefined ? undefined : path.resolve(top, setting);
  if (resolved === expected) return undefined;
  const now = setting === undefined ? "isn't set" : `is ${setting}, which is ${resolved}`;
  return (
    `core.hooksPath ${now}, not ${expected}, so git doesn't run this repo's commit-msg hook. ` +
    `Set it in the main checkout: git config core.hooksPath .githooks`
  );
}

function hooksPath(top: string): string | undefined {
  try {
    return git(top, ["config", "--type=path", "--get", "core.hooksPath"]).trim();
  } catch {
    return undefined;
  }
}

/** What an earlier run may have left: the tasks in `top`'s `WORKLIST.md`, and the task worktrees. */
export function leftovers(top: string): Leftovers {
  return { tasks: worklistTasks(readFileSync(path.join(top, "WORKLIST.md"), "utf8")), worktrees: taskWorktrees(top) };
}

function isDoing(task: WorklistTask): boolean {
  return /^doing\b/.test(task.status);
}

/** Every worktree on a `worktree-agent-<id>` branch, with its commits ahead of `main` and its uncommitted files. */
function taskWorktrees(top: string): TaskWorktree[] {
  const entries = git(top, ["worktree", "list", "--porcelain"]).split("\n\n");
  return entries.flatMap((entry) => {
    const fields = entry.split("\n");
    const worktreePath = fields.find((field) => field.startsWith("worktree "))?.slice("worktree ".length);
    const branch = fields.find((field) => field.startsWith("branch "))?.slice("branch refs/heads/".length);
    if (!worktreePath || !branch?.startsWith(TASK_BRANCH_PREFIX)) return [];
    return [
      {
        path: worktreePath,
        branch,
        agent: branch.slice(TASK_BRANCH_PREFIX.length),
        ahead: nonEmptyLines(git(top, ["log", "--format=%h %s", `${MAIN}..${branch}`])),
        uncommitted: existsSync(worktreePath) ? statusLines(worktreePath) : undefined,
      },
    ];
  });
}

/**
 * The leftovers as text. Each `doing` task is paired with the worktree whose branch carries its
 * agent's ID, and each task worktree with the task, of any status, that records its agent.
 */
export function formatLeftovers({ tasks, worktrees }: Leftovers): string {
  const doing = tasks.filter(isDoing);
  if (doing.length === 0 && worktrees.length === 0) return "Nothing is left from an earlier run.";
  const taskLines = doing.map((task) => `${task.id} — ${task.title}: ${pairedWorktree(task, worktrees)}`);
  const worktreeLines = worktrees.flatMap((worktree) => [
    `${worktree.path} (${worktree.branch}): ${pairedTask(worktree, tasks)}`,
    ...indent(worktreeState(worktree)),
  ]);
  return [section("Doing tasks in WORKLIST.md:", taskLines), section("Task worktrees:", worktreeLines)].join("\n\n");
}

function pairedWorktree(task: WorklistTask, worktrees: TaskWorktree[]): string {
  if (!task.agent) return "no agent recorded";
  const worktree = worktrees.find(({ agent }) => agent === task.agent);
  return `agent ${task.agent}, ${worktree ? `worktree ${worktree.path}` : "no worktree"}`;
}

function pairedTask(worktree: TaskWorktree, tasks: WorklistTask[]): string {
  const task = tasks.find(({ agent }) => agent === worktree.agent);
  return task ? `task ${task.id}, ${task.status}` : "no task records its agent";
}

function worktreeState({ ahead, uncommitted }: TaskWorktree): string[] {
  const commits = ahead.length === 0 ? [`no commits ahead of ${MAIN}`] : [`commits ahead of ${MAIN}:`, ...indent(ahead)];
  if (uncommitted === undefined) return [...commits, "its folder is missing"];
  const changes = uncommitted.length === 0 ? ["nothing uncommitted"] : ["uncommitted:", ...indent(uncommitted)];
  return [...commits, ...changes];
}

function section(heading: string, lines: string[]): string {
  return [heading, ...indent(lines.length > 0 ? lines : ["none"])].join("\n");
}

function statusLines(dir: string): string[] {
  return nonEmptyLines(git(dir, ["--no-optional-locks", "status", "--porcelain"]));
}

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter(Boolean);
}

function indent(lines: string[]): string[] {
  return lines.map((line) => `  ${line}`);
}

function main(): number {
  try {
    const top = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
    const problems = preflightProblems(top);
    if (problems.length > 0) {
      console.error(problems.join("\n\n"));
      return 1;
    }
    console.log(`The main checkout is on ${MAIN}, clean, and runs the repo's hooks.\n`);
    console.log(formatLeftovers(leftovers(top)));
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
