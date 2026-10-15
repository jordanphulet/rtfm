import { execFileSync } from "node:child_process";
import path from "node:path";
import { isRunDirectly, runHook } from "./run-hook.ts";

const RULE_FILES = ["CLAUDE.md", "PROCESS.md", "WORKLIST.md", "README.md", "OPERATING.md"];

/**
 * In a worktree whose HEAD is behind the local `main`, says how far behind it is and which rule
 * files `main` has changed since the worktree's branch left it. In the main checkout, or when the
 * worktree is up to date, it says nothing. `dir` is any folder inside the checkout.
 */
export function behindMainNotice(dir: string): string | undefined {
  const top = git(dir, ["rev-parse", "--show-toplevel"]).trim();
  if (isMainCheckout(top)) return undefined;
  const behind = Number(git(top, ["rev-list", "--count", "HEAD..main"]).trim());
  if (behind === 0) return undefined;

  const changed = git(top, ["diff", "--name-only", "--no-renames", "HEAD...main", "--", ...RULE_FILES])
    .split("\n")
    .filter(Boolean);
  const commits = behind === 1 ? "1 commit" : `${behind} commits`;
  const lines = [`This worktree's HEAD is ${commits} behind the local main branch.`];
  if (changed.length === 0) {
    lines.push(`None of ${RULE_FILES.join(", ")} changed on main.`);
  } else {
    lines.push(
      `Changed on main: ${changed.join(", ")}. Main's version of each can be read with \`git show main:<file>\`, ` +
        `for example \`git show main:${changed[0]}\`.`,
      "A session in a worktree reads the rule files from main and bases anything it drafts on main's version " +
        "(PROCESS.md › How rules spread).",
    );
  }
  return lines.join("\n");
}

function isMainCheckout(dir: string): boolean {
  const [gitDir, commonDir] = git(dir, ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"])
    .trim()
    .split("\n");
  return path.resolve(gitDir) === path.resolve(commonDir);
}

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

if (isRunDirectly(import.meta.url)) {
  runHook("SessionStart", (input, projectDir) => behindMainNotice(input.cwd ?? projectDir));
}
