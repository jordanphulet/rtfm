import { execFileSync } from "node:child_process";
import path from "node:path";

/** A commit on main, with its time as `git log` prints it (`%cI`, in the committer's time zone). */
export type Commit = { hash: string; time: string; subject: string };

export type WorktreeBehind = { path: string; head: string; branch?: string; behind: number; ahead: number };

export type RuleFileCommit = { hash: string; time: string; subject: string; diff: string };

const MAIN = "main";
const RULE_FILES = ["CLAUDE.md", "PROCESS.md"];
const DIFF_LINES = 30;

/** The main checkout of the repository `dir` is in, even when `dir` is in one of its worktrees. */
export function mainCheckout(dir: string): string {
  const commonDir = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  return path.dirname(commonDir);
}

export function commitsOnMain(repoDir: string, paths: string[] = []): Commit[] {
  const log = git(repoDir, ["log", MAIN, "--format=%H%x09%cI%x09%s", "--", ...paths]);
  return log
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, time, ...subject] = line.split("\t");
      return { hash, time, subject: subject.join("\t") };
    });
}

/** Every worktree but the main checkout, with how many commits it is behind and ahead of main. */
export function worktreesBehindMain(repoDir: string): WorktreeBehind[] {
  const blocks = git(repoDir, ["worktree", "list", "--porcelain"]).split("\n\n").filter((block) => block.trim());
  return blocks.slice(1).map((block) => {
    const field = (name: string) => block.split("\n").find((line) => line.startsWith(`${name} `))?.slice(name.length + 1);
    const head = field("HEAD") ?? "";
    const [behind, ahead] = git(repoDir, ["rev-list", "--left-right", "--count", `${MAIN}...${head}`]).trim().split(/\s+/).map(Number);
    return { path: field("worktree") ?? "", head, branch: field("branch")?.replace("refs/heads/", ""), behind, ahead };
  });
}

/** Each commit on main that changed `CLAUDE.md` or `PROCESS.md`, with the lines it added and removed. */
export function ruleFileCommits(repoDir: string): RuleFileCommit[] {
  return commitsOnMain(repoDir, RULE_FILES).map((commit) => ({
    hash: commit.hash,
    time: new Date(commit.time).toISOString(),
    subject: commit.subject,
    diff: shortDiff(git(repoDir, ["show", "--format=", "--unified=0", commit.hash, "--", ...RULE_FILES])),
  }));
}

function shortDiff(diff: string): string {
  const lines = diff.split("\n").flatMap((line) => {
    if (line.startsWith("diff --git")) return [line.replace(/^diff --git a\/(\S+) .*$/, "$1:")];
    if (/^(\+\+\+|---) /.test(line)) return [];
    return /^[+-]/.test(line) ? [line] : [];
  });
  const more = lines.length - DIFF_LINES;
  return [...lines.slice(0, DIFF_LINES), ...(more > 0 ? [`… ${more} more lines`] : [])].join("\n");
}

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
