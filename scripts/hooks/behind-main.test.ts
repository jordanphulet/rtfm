import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { behindMainNotice } from "./behind-main.ts";

const SCRIPT = fileURLToPath(new URL("./behind-main.ts", import.meta.url));

let folder: string;
let main: string;
let worktree: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "rtfm-behind-main-test-"));
  main = path.join(folder, "main");
  worktree = path.join(main, ".claude", "worktrees", "task");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", main]);
  git(main, "config", "user.name", "Test User");
  git(main, "config", "user.email", "test@example.com");
  git(main, "config", "commit.gpgsign", "false");
  for (const file of ["CLAUDE.md", "PROCESS.md", "WORKLIST.md", "README.md", "app.ts"]) {
    writeFileSync(path.join(main, file), `# ${file}\n`);
  }
  commitAll(main, "Start");
  git(main, "worktree", "add", "--quiet", "-b", "task", worktree);
});

afterEach(() => rmSync(folder, { recursive: true, force: true }));

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function commitAll(dir: string, message: string) {
  git(dir, "add", ".");
  git(dir, "commit", "--quiet", "-m", message);
}

function changeOnMain(file: string) {
  writeFileSync(path.join(main, file), `# ${file}\nA new rule.\n`);
  git(main, "add", file);
  git(main, "commit", "--quiet", "-m", `Change ${file}`);
}

describe("behindMainNotice", () => {
  it("reads the checkout from any folder inside it", () => {
    changeOnMain("PROCESS.md");
    mkdirSync(path.join(worktree, "src"));
    expect(behindMainNotice(path.join(worktree, "src"))).toContain("Changed on main: PROCESS.md.");
    mkdirSync(path.join(main, "src"));
    expect(behindMainNotice(path.join(main, "src"))).toBeUndefined();
  });

  it("says nothing in a worktree that is up to date", () => {
    expect(behindMainNotice(worktree)).toBeUndefined();
  });

  it("says nothing in the main checkout, even on a branch behind main", () => {
    changeOnMain("CLAUDE.md");
    expect(behindMainNotice(main)).toBeUndefined();
    git(main, "checkout", "--quiet", "-b", "old", "HEAD~1");
    expect(behindMainNotice(main)).toBeUndefined();
  });

  it("says how far behind main a worktree is and which rule files main changed", () => {
    changeOnMain("CLAUDE.md");
    changeOnMain("app.ts");
    changeOnMain("PROCESS.md");

    const notice = behindMainNotice(worktree);

    expect(notice).toContain("3 commits behind the local main branch");
    expect(notice).toContain("Changed on main: CLAUDE.md, PROCESS.md.");
    expect(notice).toContain("`git show main:CLAUDE.md`");
    expect(notice).not.toContain("app.ts");
  });

  it("leaves out a rule file only the worktree's branch changed", () => {
    writeFileSync(path.join(worktree, "README.md"), "# The task's own README\n");
    commitAll(worktree, "Task work");
    changeOnMain("WORKLIST.md");

    expect(behindMainNotice(worktree)).toContain("1 commit behind the local main branch.\nChanged on main: WORKLIST.md.");
  });

  it("says when main changed none of the rule files", () => {
    changeOnMain("app.ts");
    expect(behindMainNotice(worktree)).toContain(
      "1 commit behind the local main branch.\nNone of CLAUDE.md, PROCESS.md, WORKLIST.md, README.md changed on main.",
    );
  });
});

describe("the SessionStart hook", () => {
  const silent = { status: 0, stdout: "", stderr: "" };

  function run(projectDir: string | undefined, cwd: string | undefined, env: NodeJS.ProcessEnv = process.env) {
    return spawnSync(process.execPath, [SCRIPT], {
      cwd: projectDir,
      input: JSON.stringify({ session_id: "s1", cwd, hook_event_name: "SessionStart", source: "startup" }),
      encoding: "utf8",
      env: { ...env, CLAUDE_PROJECT_DIR: projectDir },
    });
  }

  it("tells a session in a stale worktree, whose hooks run from the main checkout", () => {
    changeOnMain("CLAUDE.md");
    const result = run(main, worktree);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput.additionalContext).toContain("1 commit behind the local main branch");
    expect(output.hookSpecificOutput.additionalContext).toContain("Changed on main: CLAUDE.md.");
  });

  it("reads the project folder when the input has no cwd", () => {
    changeOnMain("CLAUDE.md");
    expect(JSON.parse(run(worktree, undefined).stdout).hookSpecificOutput.additionalContext).toContain(
      "Changed on main: CLAUDE.md.",
    );
  });

  it("prints nothing in the main checkout", () => {
    changeOnMain("CLAUDE.md");
    expect(run(main, main)).toMatchObject(silent);
  });

  it("prints nothing and exits 0 outside a repository, without git, or without a project folder", () => {
    changeOnMain("CLAUDE.md");
    const plain = mkdtempSync(path.join(tmpdir(), "rtfm-behind-main-plain-"));
    try {
      expect(run(plain, plain)).toMatchObject(silent);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
    expect(run(main, worktree, { PATH: folder })).toMatchObject(silent);
    expect(run(undefined, worktree)).toMatchObject(silent);
  });
});
