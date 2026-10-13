import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const NO_REVIEW_LINE_LIMIT = 40;
export const CO_AUTHOR = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";

const USAGE = `Usage: npm run commit-task -- <ID> --reviewed-by <agent id> [--worktree <path>]
       npm run commit-task -- <ID> --no-review "<reason>" [--worktree <path>]`;

export type FilePatterns = { include: string[]; exclude: string[] };
export type Task = { id: string; title: string; files: FilePatterns };
type Review = { reviewedBy: string } | { noReviewReason: string };
type CommitResult = { subject: string; committed: string[]; leftAlone: string[] };
type StatusEntry = { code: string; file: string };
type LineRange = { start: number; end: number };

/**
 * Commits the changed files that task `id`'s **Files** match, with its review trailer, in
 * `repoDir` or, given `worktreeDir`, in that worktree of it. The task is read from `repoDir`'s
 * `WORKLIST.md`, since a worktree's copy may be stale. A worktree holds one task's work, so every
 * changed file in it must match. The commit is built in a separate index holding HEAD and those
 * files, so a refusal or a failed commit leaves the real index as it was; after the commit, the
 * real index takes the committed files. Both folders are top folders, since git status names
 * files relative to the top.
 */
export function commitTask(repoDir: string, id: string, review: Review, worktreeDir?: string): CommitResult {
  const task = findTask(readFileSync(path.join(repoDir, "WORKLIST.md"), "utf8"), id);
  if (!task) throw new Error(`There is no task ${id} in WORKLIST.md.`);
  if (worktreeDir !== undefined) refuseUnlessWorktree(repoDir, worktreeDir);
  const dir = worktreeDir ?? repoDir;

  refuseUnfinishedOperation(dir);
  const status = readStatus(dir);
  if (status.some(({ code }) => isUnmerged(code))) {
    throw new Error("Some files are unmerged: resolve them before committing a task.");
  }
  const changed = changedFiles(status);
  const matched = changed.filter((file) => matchesFiles(file, task.files));
  if (worktreeDir !== undefined) refuseUnmatched(id, changed.filter((file) => !matched.includes(file)));
  if (matched.length === 0) {
    throw new Error(`No changed file matches ${id}'s Files: ${task.files.include.join(", ") || "none named"}.`);
  }

  const subject = `${id}: ${task.title}`;
  const committed = withTaskIndex(dir, matched, (env) => {
    const staged = git(dir, ["diff", "--cached", "--name-only", "--no-renames", "-z"], { env });
    const files = staged.split("\0").filter(Boolean);
    if (files.length === 0) throw new Error(`The files ${id}'s Files match have nothing to commit.`);
    if ("noReviewReason" in review) {
      refuseLargeChange(id, git(dir, ["diff", "--cached", "--numstat", "-M", "-z"], { env }));
    }
    git(dir, ["commit", "--file=-"], { env, input: commitMessage(subject, review) });
    return files;
  });
  try {
    git(dir, ["reset", "--quiet", "--", ...committed]);
  } catch (error) {
    throw new Error(
      `Committed ${subject}, but couldn't update the index (${(error as Error).message}). ` +
        `Run in ${dir}: git reset -- ${committed.join(" ")}`,
    );
  }
  return { subject, committed, leftAlone: changed.filter((file) => !committed.includes(file)) };
}

/** Refuses a folder that isn't the top folder of one of `repoDir`'s worktrees. */
function refuseUnlessWorktree(repoDir: string, worktreeDir: string) {
  const worktree = repositoryOf(worktreeDir);
  const isWorktree =
    worktree !== undefined &&
    worktree.top === realpathSync(worktreeDir) &&
    worktree.commonDir === repositoryOf(repoDir)?.commonDir;
  if (!isWorktree) throw new Error(`${worktreeDir} is not a worktree of this repository.`);
}

/** Refuses changed files in a task's worktree that its **Files** don't match. */
function refuseUnmatched(id: string, unmatched: string[]) {
  if (unmatched.length === 0) return;
  throw new Error(
    `${id}'s Files don't match these changed files in the worktree:\n` +
      unmatched.map((file) => `  ${file}\n`).join("") +
      `Add them to ${id}'s Files in WORKLIST.md, or have the agent undo them.`,
  );
}

/** The top folder of the worktree `dir` is in, and the git folder its repository's worktrees share. */
function repositoryOf(dir: string): { top: string; commonDir: string } | undefined {
  try {
    const [top, commonDir] = git(dir, ["rev-parse", "--show-toplevel", "--git-common-dir"]).trim().split("\n");
    return { top: realpathSync(top), commonDir: realpathSync(path.resolve(dir, commonDir)) };
  } catch {
    return undefined;
  }
}

/** Refuses during a merge, cherry-pick or revert, which a commit from a separate index would end. */
function refuseUnfinishedOperation(repoDir: string) {
  const operations = { MERGE_HEAD: "A merge", CHERRY_PICK_HEAD: "A cherry-pick", REVERT_HEAD: "A revert" };
  for (const [ref, operation] of Object.entries(operations)) {
    const exists = spawnSync("git", ["rev-parse", "-q", "--verify", ref], { cwd: repoDir }).status === 0;
    if (exists) throw new Error(`${operation} is in progress: finish or abort it before committing a task.`);
  }
}

function isUnmerged(code: string): boolean {
  return code.includes("U") || code === "AA" || code === "DD";
}

function withTaskIndex<T>(repoDir: string, files: string[], use: (env: NodeJS.ProcessEnv) => T): T {
  const indexDir = mkdtempSync(path.join(tmpdir(), "rtfm-commit-task-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(indexDir, "index") };
  try {
    git(repoDir, ["read-tree", "HEAD"], { env });
    git(repoDir, ["add", "--", ...files], { env });
    return use(env);
  } finally {
    rmSync(indexDir, { recursive: true, force: true });
  }
}

/** Refuses a binary change, or more changed lines than --no-review allows; a pure rename counts none. */
function refuseLargeChange(id: string, numstat: string) {
  const counts = [...numstat.matchAll(/(?:^|\0)(\d+|-)\t(\d+|-)\t/g)];
  const advice = "Have a review agent review it, then commit with --reviewed-by <its id>.";
  if (counts.some(([, added]) => added === "-")) {
    throw new Error(`${id} changes a binary file, which --no-review doesn't allow. ${advice}`);
  }
  const lines = counts.reduce((total, [, added, removed]) => total + Number(added) + Number(removed), 0);
  if (lines > NO_REVIEW_LINE_LIMIT) {
    throw new Error(`${id} changes ${lines} lines, more than the ${NO_REVIEW_LINE_LIMIT} --no-review allows. ${advice}`);
  }
}

function commitMessage(subject: string, review: Review): string {
  const reviewer = "reviewedBy" in review ? review.reviewedBy : `none (${review.noReviewReason})`;
  return `${subject}\n\nReviewed-by: ${reviewer}\n${CO_AUTHOR}\n`;
}

/** Task `id`'s title and **Files**, from the text of `WORKLIST.md`. */
export function findTask(worklist: string, id: string): Task | undefined {
  const lines = worklist.split("\n");
  const block = findTaskBlock(lines, id);
  if (!block) return undefined;
  const title = lines[block.start].slice(taskHeading(id).length).trim();
  return { id, title, files: parseFiles(filesText(lines.slice(block.start + 1, block.end))) };
}

function taskHeading(id: string): string {
  return `### ${id} — `;
}

/** Where task `id`'s block is in the lines of `WORKLIST.md`: its heading up to the next heading or rule. */
export function findTaskBlock(lines: string[], id: string): LineRange | undefined {
  const start = lines.findIndex((line) => line.startsWith(taskHeading(id)));
  if (start === -1) return undefined;
  return { start, end: blockEnd(lines, start) };
}

/** The line that ends the block starting at `start`: the next heading or rule, or the end. */
export function blockEnd(lines: string[], start: number): number {
  const end = lines.findIndex((line, index) => index > start && /^(#|---)/.test(line));
  return end === -1 ? lines.length : end;
}

/** Where a task block's item starting with `label` is, with its continuation lines. */
export function findItem(block: string[], label: string): LineRange | undefined {
  const start = block.findIndex((line) => line.startsWith(label));
  if (start === -1) return undefined;
  const end = block.findIndex((line, index) => index > start && !/^\s+\S/.test(line));
  return { start, end: end === -1 ? block.length : end };
}

/** The **Files** item of a task block, with its continuation lines joined. */
function filesText(block: string[]): string {
  const label = "- **Files:**";
  const item = findItem(block, label);
  if (!item) return "";
  return block.slice(item.start, item.end).join(" ").slice(label.length);
}

/**
 * The paths and globs that a **Files** text names in code spans. A note in parentheses is
 * ignored, unless it starts with "except" or "not": then the paths in it are excluded, as are
 * those after "except" up to the next comma. "`x.ts` and its test" also names `x.test.*`.
 */
export function parseFiles(text: string): FilePatterns {
  const include: string[] = [];
  const exclude: string[] = [];
  const withoutNotes = text.replace(/\(([^()]*)\)/g, (_note, inner: string) => {
    if (/^\s*(except|not)\b/.test(inner)) exclude.push(...codeSpans(inner));
    return "";
  });
  for (const item of withoutNotes.split(/[,;]/)) {
    const [included, excluded = ""] = item.split(/\bexcept\b/);
    include.push(...codeSpans(included), ...testsOf(included));
    exclude.push(...codeSpans(excluded));
  }
  return { include: include.map(normalized), exclude: exclude.map(normalized) };
}

function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function testsOf(text: string): string[] {
  return [...text.matchAll(/`([^`]+)\.tsx?`\s+and its test\b/g)].map((match) => `${match[1]}.test.*`);
}

function normalized(pattern: string): string {
  const relative = pattern.replace(/^\.\//, "");
  return relative.endsWith("/") ? `${relative}**` : relative;
}

export function matchesFiles(file: string, files: FilePatterns): boolean {
  const matches = (pattern: string) => globToRegExp(pattern).test(file);
  return files.include.some(matches) && !files.exclude.some(matches);
}

/** `**` matches any number of folders, `*` anything within one name. */
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let index = 0; index < glob.length; index++) {
    if (glob.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 2;
    } else if (glob.startsWith("**", index)) {
      source += ".*";
      index += 1;
    } else if (glob[index] === "*") {
      source += "[^/]*";
    } else {
      source += glob[index].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function readStatus(repoDir: string): StatusEntry[] {
  const args = ["--no-optional-locks", "status", "--porcelain", "-z", "--untracked-files=all", "--no-renames"];
  const entries = git(repoDir, args).split("\0").filter(Boolean);
  return entries.map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3) }));
}

/**
 * Every changed, deleted and untracked file, one by one, never as a folder. A file added to the
 * index and then deleted (`AD`) is no change from HEAD, so it is left out.
 */
function changedFiles(status: StatusEntry[]): string[] {
  return [...new Set(status.filter(({ code }) => code !== "AD").map(({ file }) => file))];
}

function git(repoDir: string, args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}): string {
  try {
    return execFileSync("git", ["--literal-pathspecs", ...args], {
      cwd: repoDir,
      encoding: "utf8",
      input: options.input,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (error as Error).message);
  }
}

function reviewFrom(values: { "reviewed-by"?: string; "no-review"?: string }): Review | undefined {
  const reviewedBy = values["reviewed-by"]?.trim();
  const reason = values["no-review"]?.trim();
  if (reviewedBy && reason === undefined) return { reviewedBy };
  if (reason && reviewedBy === undefined) return { noReviewReason: reason };
}

function main(args: string[]): number {
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: { "reviewed-by": { type: "string" }, "no-review": { type: "string" }, worktree: { type: "string" } },
    });
    const review = reviewFrom(values);
    if (positionals.length !== 1 || !review) {
      console.error(USAGE);
      return 1;
    }
    const repoDir = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
    const worktreeDir = values.worktree === undefined ? undefined : path.resolve(values.worktree);
    const { subject, committed, leftAlone } = commitTask(repoDir, positionals[0], review, worktreeDir);
    console.log(`Committed ${subject}`);
    for (const file of committed) console.log(`  ${file}`);
    if (leftAlone.length > 0) console.log("Left alone:");
    for (const file of leftAlone) console.log(`  ${file}`);
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
