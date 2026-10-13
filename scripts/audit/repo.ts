import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * A commit on main, with its time as `git log` prints it (`%cI`, in the committer's time zone),
 * the files it changed, its added and removed lines (a pure rename adds none), and whether it has
 * Claude's co-author line.
 */
export type Commit = { hash: string; time: string; subject: string; files: string[]; changedLines: number; byClaude: boolean };

/** `WORKLIST.md` as one commit on main left it, oldest first. */
export type WorklistVersion = { time: string; text: string };

export type WorktreeBehind = { path: string; head: string; branch?: string; behind: number; ahead: number };

export type RuleFileCommit = { hash: string; time: string; subject: string; diff: string };

const MAIN = "main";
const RULE_FILES = ["CLAUDE.md", "PROCESS.md"];
const WORKLIST = "WORKLIST.md";
const DIFF_LINES = 30;
// Each commit's record starts with this character, which the log format writes as `%x1e`.
const RECORD = "\x1e";

/** The main checkout of the repository `dir` is in, even when `dir` is in one of its worktrees. */
export function mainCheckout(dir: string): string {
  const commonDir = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  return path.dirname(commonDir);
}

export function commitsOnMain(repoDir: string, paths: string[] = []): Commit[] {
  const format = `%x1e%H%x09%cI%x09%(trailers:key=Co-Authored-By,valueonly,separator=%x2C)%x09%s`;
  const log = git(repoDir, ["log", MAIN, "-M", "--numstat", `--format=${format}`, "--", ...paths]);
  return log
    .split(RECORD)
    .filter((record) => record.trim())
    .map((record) => {
      const [header, ...stats] = record.split("\n");
      const [hash, time, coAuthors, ...subject] = header.split("\t");
      const changes = stats.filter(Boolean).map((line) => line.split("\t"));
      return {
        hash,
        time,
        subject: subject.join("\t"),
        files: changes.map(([, , file]) => renamedTo(file)),
        changedLines: changes.reduce((sum, [added, removed]) => sum + (Number(added) || 0) + (Number(removed) || 0), 0),
        byClaude: /\bClaude\b/.test(coAuthors),
      };
    });
}

/** Every version of `WORKLIST.md` committed on main, oldest first, with its commit's time in UTC. */
export function worklistVersions(repoDir: string): WorklistVersion[] {
  return commitsOnMain(repoDir, [WORKLIST])
    .reverse()
    .map((commit) => ({
      time: new Date(commit.time).toISOString(),
      text: git(repoDir, ["show", `${commit.hash}:${WORKLIST}`]),
    }));
}

/** When the first commit on main that added `text` to `file` was made, in UTC; undefined if none did. */
export function firstCommitAdding(repoDir: string, file: string, text: string): string | undefined {
  const times = git(repoDir, ["log", MAIN, "--reverse", "--format=%cI", "-S", text, "--", file]).split("\n").filter(Boolean);
  return times[0] && new Date(times[0]).toISOString();
}

/** Every worktree but the main checkout, with how many commits it is behind and ahead of main. */
export function worktreesBehindMain(repoDir: string): WorktreeBehind[] {
  const blocks = git(repoDir, ["worktree", "list", "--porcelain"])
    .split("\n\n")
    .filter((block) => block.trim());
  return blocks.slice(1).map((block) => {
    const field = (name: string) =>
      block
        .split("\n")
        .find((line) => line.startsWith(`${name} `))
        ?.slice(name.length + 1);
    const head = field("HEAD") ?? "";
    const [behind, ahead] = git(repoDir, ["rev-list", "--left-right", "--count", `${MAIN}...${head}`])
      .trim()
      .split(/\s+/)
      .map(Number);
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

// `--numstat` writes a renamed file as `old => new` or `dir/{old => new}/rest`.
function renamedTo(file: string): string {
  return file
    .replace(/\{[^}]* => ([^}]*)\}/, "$1")
    .replace(/^.* => /, "")
    .replace("//", "/");
}

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
