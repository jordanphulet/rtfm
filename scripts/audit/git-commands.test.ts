import { describe, expect, it } from "vitest";
import { isGitWrite } from "./git-commands.ts";
import { simpleCommands } from "./shell.ts";

const writes = (script: string) => isGitWrite(simpleCommands(script)[0]);

describe("isGitWrite", () => {
  it.each([
    "git commit -m done",
    "git add -A lib",
    "git rm --cached -r lib/example",
    "git restore --staged lib/example.ts",
    "git worktree add --detach /tmp/example-tree HEAD",
    "git worktree remove --force /tmp/example-tree",
    "git -C ../other checkout main",
    "git stash",
    "git stash pop",
    "git tag v1",
    "git branch -D old",
    "git branch feature",
    "git mv a.ts b.ts",
    "git reset --hard HEAD~1",
    "git clean -fd",
    "git hash-object -w lib/example.ts",
    "git -C $(pwd) commit -m done",
  ])("counts %s", (script) => {
    expect(writes(script)).toBe(true);
  });

  it.each([
    "git status --short",
    "git log --oneline -5",
    "git diff HEAD~1 -- notes.md",
    "git mv -n a.ts b.ts",
    "git rm --dry-run a.ts",
    "git stash list",
    "git stash show -p",
    "git tag -l",
    "git tag",
    "git branch -a",
    "git branch --show-current",
    "git worktree list --porcelain",
    "git config --get user.name",
    "git --version",
    "git -C ../other log",
    "git reflog",
    "git clean -n",
    "git clean -nd",
    "git hash-object lib/example.ts",
  ])("leaves out %s", (script) => {
    expect(writes(script)).toBe(false);
  });
});
