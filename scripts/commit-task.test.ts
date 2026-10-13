import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CO_AUTHOR, commitTask, findTask, matchesFiles, parseFiles } from "./commit-task.ts";

const HOOKS_DIR = fileURLToPath(new URL("../.githooks", import.meta.url));
const SCRIPT = fileURLToPath(new URL("./commit-task.ts", import.meta.url));

const WORKLIST = `# Work list

## A phase

### XX.1 — Build the widget
- **Status:** doing (agent a1)
- **Depends on:** —
- **Files:** \`src/widget/**\`, \`scripts/widget.ts\` and its test (new), \`README.md\`
- **Do:** build it.
- **Done when:** it works.

### XX.2 — Touch nothing that exists
- **Status:** todo
- **Depends on:** —
- **Files:** \`nowhere/**\`
- **Do:** nothing.
`;

describe("parseFiles", () => {
  it("reads paths, ** and * globs, and drops notes such as (new)", () => {
    expect(parseFiles(" `server/agent/**` (new), `src/*/README.md` (links only), `README.md`")).toEqual({
      include: ["server/agent/**", "src/*/README.md", "README.md"],
      exclude: [],
    });
  });

  it("reads paths after a lead-in", () => {
    const files = parseFiles(" `README.md`; for pointers to moved headings only: `src/*/README.md`, `ARCHITECTURE.md`");
    expect(files.include).toEqual(["README.md", "src/*/README.md", "ARCHITECTURE.md"]);
  });

  it("adds a file's test for 'and its test'", () => {
    expect(parseFiles(" `scripts/commit-task.ts` and its test (new), `package.json`").include).toEqual([
      "scripts/commit-task.ts",
      "scripts/commit-task.test.*",
      "package.json",
    ]);
  });

  it("excludes what follows 'except' and what a note starting with 'except' or 'not' names", () => {
    expect(parseFiles(" `server/**` except `server/seed/**`, `ARCHITECTURE.md`")).toEqual({
      include: ["server/**", "ARCHITECTURE.md"],
      exclude: ["server/seed/**"],
    });
    expect(parseFiles(" `src/**` (except `src/ui/`, `src/manual/` and `src/agent/`, whose READMEs …)")).toEqual({
      include: ["src/**"],
      exclude: ["src/ui/**", "src/manual/**", "src/agent/**"],
    });
    expect(parseFiles(" `server/**` and `src/**` (not `README.md`, `CLAUDE.md` or `PROCESS.md`)").exclude).toEqual([
      "README.md",
      "CLAUDE.md",
      "PROCESS.md",
    ]);
  });

  it("ignores the paths in a note that only describes", () => {
    expect(parseFiles(" `src/**` (`src/agent/` moves to `src/librarian/`), `README.md`").include).toEqual([
      "src/**",
      "README.md",
    ]);
  });
});

describe("matchesFiles", () => {
  const files = parseFiles(
    " `server/**` except `server/seed/**`, `src/*/README.md`, `scripts/widget.ts` and its test, `README.md`",
  );

  it.each([
    ["server/app.ts", true],
    ["server/agent/librarian/tools.ts", true],
    ["server/seed/haunt/manual.json", false],
    ["src/home/README.md", true],
    ["src/home/deep/README.md", false],
    ["scripts/widget.ts", true],
    ["scripts/widget.test.ts", true],
    ["scripts/widget-other.ts", false],
    ["README.md", true],
    ["docs/README.md", false],
    ["READMEsmd", false],
  ])("%s → %s", (file, expected) => {
    expect(matchesFiles(file, files)).toBe(expected);
  });
});

describe("findTask", () => {
  it("reads the title and the Files across continuation lines", () => {
    const worklist = WORKLIST.replace(
      "- **Files:** `src/widget/**`, `scripts/widget.ts` and its test (new), `README.md`",
      "- **Files:** `src/widget/**`, `scripts/widget.ts` and its test (new, the user\n  approves), `README.md`",
    );
    expect(findTask(worklist, "XX.1")).toEqual({
      id: "XX.1",
      title: "Build the widget",
      files: { include: ["src/widget/**", "scripts/widget.ts", "scripts/widget.test.*", "README.md"], exclude: [] },
    });
  });

  it("finds nothing for an unknown ID, or a prefix of one", () => {
    expect(findTask(WORKLIST, "XX.9")).toBeUndefined();
    expect(findTask(`### XX.10 — Ten\n- **Files:** \`a\``, "XX.1")).toBeUndefined();
  });
});

describe("in a git repository", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "rtfm-commit-task-test-"));
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.name", "Test User");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", HOOKS_DIR);
    write("WORKLIST.md", WORKLIST);
    write("README.md", "# Readme\n");
    write("src/widget/old.ts", lines(60, "old"));
    write("src/other.ts", "export {};\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "Start");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  function git(...args: string[]): string {
    return gitIn(repo, ...args);
  }

  function gitIn(dir: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  }

  function write(file: string, text: string) {
    writeIn(repo, file, text);
  }

  function writeIn(dir: string, file: string, text: string) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }

  function lines(count: number, word: string): string {
    return Array.from({ length: count }, (_, index) => `${word} ${index}\n`).join("");
  }

  function lastMessage(): string {
    return git("log", "-1", "--format=%B");
  }

  function lastCommitFiles(): string[] {
    return git("show", "--name-only", "--no-renames", "--format=", "HEAD").split("\n").filter(Boolean).sort();
  }

  function index(): Buffer {
    return readFileSync(path.join(repo, ".git", "index"));
  }

  function useHooks(hooks: Record<string, string>) {
    const hooksDir = path.join(repo, ".git", "test-hooks");
    mkdirSync(hooksDir, { recursive: true });
    for (const [name, script] of Object.entries(hooks)) {
      writeFileSync(path.join(hooksDir, name), `#!/bin/sh\n${script}\n`);
      chmodSync(path.join(hooksDir, name), 0o755);
    }
    git("config", "core.hooksPath", hooksDir);
  }

  function commitByHand(message: string): { status: number | null; stderr: string } {
    const result = spawnSync("git", ["commit", "--quiet", "-m", message], { cwd: repo, encoding: "utf8" });
    return { status: result.status, stderr: result.stderr };
  }

  describe("commitTask", () => {
    it("commits only the changed and new files the task's Files match, and lists the rest", () => {
      write("src/widget/new.ts", "export const widget = 1;\n");
      write("src/widget/deep/inner.ts", "export {};\n");
      write("scripts/widget.test.ts", "export {};\n");
      write("README.md", "# Readme\n\nWidgets.\n");
      unlinkSync(path.join(repo, "src/widget/old.ts"));
      write("src/other.ts", "export const other = 2;\n");
      write("WORKLIST.md", `${WORKLIST}\nmore\n`);

      const result = commitTask(repo, "XX.1", { reviewedBy: "a7f3" });

      expect(result.committed.sort()).toEqual([
        "README.md",
        "scripts/widget.test.ts",
        "src/widget/deep/inner.ts",
        "src/widget/new.ts",
        "src/widget/old.ts",
      ]);
      expect(result.leftAlone.sort()).toEqual(["WORKLIST.md", "src/other.ts"]);
      expect(lastCommitFiles()).toEqual(result.committed.sort());
      expect(git("status", "--porcelain").split("\n").filter(Boolean).sort()).toEqual([
        " M WORKLIST.md",
        " M src/other.ts",
      ]);
    });

    it("commits only the task's files even when others are staged", () => {
      write("README.md", "# Readme\n\nWidgets.\n");
      write("src/other.ts", "export const other = 2;\n");
      git("add", "src/other.ts");

      commitTask(repo, "XX.1", { reviewedBy: "a7f3" });

      expect(lastCommitFiles()).toEqual(["README.md"]);
      expect(git("status", "--porcelain")).toBe("M  src/other.ts\n");
    });

    it("writes the reviewer's id as a trailer", () => {
      write("README.md", "# Readme\n\nWidgets.\n");
      commitTask(repo, "XX.1", { reviewedBy: "a7f3" });
      expect(lastMessage()).toBe(`XX.1: Build the widget\n\nReviewed-by: a7f3\n${CO_AUTHOR}\n\n`);
    });

    it("writes none and the reason as the trailer for --no-review", () => {
      write("README.md", "# Readme\n\nWidgets.\n");
      commitTask(repo, "XX.1", { noReviewReason: "a one-line fix" });
      expect(lastMessage()).toBe(`XX.1: Build the widget\n\nReviewed-by: none (a one-line fix)\n${CO_AUTHOR}\n\n`);
    });

    it("refuses when no changed file matches, leaving the index byte for byte as it was", () => {
      write("src/other.ts", "export const other = 2;\n");
      git("status");
      const before = index();
      expect(() => commitTask(repo, "XX.2", { reviewedBy: "a7f3" })).toThrow(/No changed file matches XX\.2's Files/);
      expect(index().equals(before)).toBe(true);
    });

    it("refuses an unknown task", () => {
      expect(() => commitTask(repo, "XX.9", { reviewedBy: "a7f3" })).toThrow(/no task XX\.9/);
    });

    it("refuses --no-review over 40 changed lines, and stages nothing", () => {
      write("src/widget/new.ts", lines(41, "line"));
      expect(() => commitTask(repo, "XX.1", { noReviewReason: "small" })).toThrow(/changes 41 lines, more than the 40/);
      expect(git("status", "--porcelain")).toBe("?? src/widget/new.ts\n");
      expect(git("log", "--format=%s")).toBe("Start\n");
    });

    it("allows --no-review for 40 changed lines", () => {
      write("src/widget/new.ts", lines(40, "line"));
      commitTask(repo, "XX.1", { noReviewReason: "small" });
      expect(lastCommitFiles()).toEqual(["src/widget/new.ts"]);
    });

    it("doesn't count a pure rename towards the --no-review limit", () => {
      renameSync(path.join(repo, "src/widget/old.ts"), path.join(repo, "src/widget/renamed.ts"));
      write("README.md", "# Readme\n\nWidgets.\n");
      commitTask(repo, "XX.1", { noReviewReason: "a rename" });
      expect(lastCommitFiles()).toEqual(["README.md", "src/widget/old.ts", "src/widget/renamed.ts"]);
    });

    it("refuses --no-review for a binary change, and stages nothing", () => {
      writeFileSync(path.join(repo, "src/widget/icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]));
      expect(() => commitTask(repo, "XX.1", { noReviewReason: "small" })).toThrow(/binary file/);
      expect(git("status", "--porcelain")).toBe("?? src/widget/icon.png\n");
      expect(git("log", "--format=%s")).toBe("Start\n");
    });

    it("commits a deletion already staged with git rm", () => {
      git("rm", "--quiet", "src/widget/old.ts");
      commitTask(repo, "XX.1", { reviewedBy: "a7f3" });
      expect(lastCommitFiles()).toEqual(["src/widget/old.ts"]);
      expect(git("status", "--porcelain")).toBe("");
    });

    it("leaves out a file added to the index and then deleted", () => {
      write("src/widget/gone.ts", "export {};\n");
      git("add", "src/widget/gone.ts");
      unlinkSync(path.join(repo, "src/widget/gone.ts"));
      write("README.md", "# Readme\n\nWidgets.\n");

      const result = commitTask(repo, "XX.1", { reviewedBy: "a7f3" });

      expect(result.committed).toEqual(["README.md"]);
      expect(lastCommitFiles()).toEqual(["README.md"]);
      expect(git("status", "--porcelain")).toBe("AD src/widget/gone.ts\n");
    });

    it("lists a file untracked with git rm --cached once, and commits nothing for it", () => {
      git("rm", "--cached", "--quiet", "src/widget/old.ts");
      const status = "D  src/widget/old.ts\n?? src/widget/old.ts\n";
      expect(git("status", "--porcelain", "--untracked-files=all")).toBe(status);

      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" })).toThrow(/nothing to commit/);
      expect(git("status", "--porcelain", "--untracked-files=all")).toBe(status);

      write("README.md", "# Readme\n\nWidgets.\n");
      const result = commitTask(repo, "XX.1", { reviewedBy: "a7f3" });
      expect(result).toMatchObject({ committed: ["README.md"], leftAlone: ["src/widget/old.ts"] });
      expect(git("status", "--porcelain", "--untracked-files=all")).toBe(status);
    });

    it("commits the working tree's version of a file changed again after staging", () => {
      write("README.md", "# Readme\n\nStaged.\n");
      git("add", "README.md");
      write("README.md", "# Readme\n\nWidgets.\n");
      expect(git("status", "--porcelain")).toBe("MM README.md\n");

      commitTask(repo, "XX.1", { reviewedBy: "a7f3" });

      expect(git("show", "HEAD:README.md")).toBe("# Readme\n\nWidgets.\n");
      expect(git("status", "--porcelain")).toBe("");
    });

    it("refuses during a merge, and with unmerged files", () => {
      git("checkout", "--quiet", "-b", "side");
      write("README.md", "# Readme\n\nSide.\n");
      git("commit", "--quiet", "-am", "Side change");
      git("checkout", "--quiet", "main");
      write("README.md", "# Readme\n\nMain.\n");
      git("commit", "--quiet", "-am", "Main change");
      expect(spawnSync("git", ["merge", "side"], { cwd: repo }).status).not.toBe(0);
      write("src/widget/new.ts", "export {};\n");

      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" })).toThrow(/A merge is in progress/);
      expect(git("rev-parse", "-q", "--verify", "MERGE_HEAD")).toBeTruthy();

      unlinkSync(path.join(repo, ".git", "MERGE_HEAD"));
      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" })).toThrow(/unmerged/);
      expect(git("log", "-1", "--format=%s")).toBe("Main change\n");
    });

    it("leaves the index byte for byte as it was when the commit-msg hook refuses", () => {
      useHooks({ "commit-msg": "exit 1" });
      write("src/other.ts", "export const other = 2;\n");
      git("add", "src/other.ts");
      write("README.md", "# Readme\n\nWidgets.\n");
      git("status");
      const before = index();

      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" })).toThrow();

      expect(index().equals(before)).toBe(true);
      expect(git("log", "--format=%s")).toBe("Start\n");
    });

    it("says how to finish when the index can't be updated after the commit", () => {
      useHooks({ "post-commit": "touch .git/index.lock" });
      write("README.md", "# Readme\n\nWidgets.\n");

      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" })).toThrow(
        /^Committed XX\.1: Build the widget, but couldn't update the index \(.*index\.lock.*\)\. Run in .+: git reset -- README\.md$/s,
      );
      expect(git("log", "-1", "--format=%s")).toBe("XX.1: Build the widget\n");
    });
  });

  describe("commitTask in another worktree", () => {
    let worktree: string;
    let worktreeParent: string;

    beforeEach(() => {
      mkdirSync(path.join(repo, ".githooks"));
      copyFileSync(path.join(HOOKS_DIR, "commit-msg"), path.join(repo, ".githooks", "commit-msg"));
      git("add", ".githooks");
      git("commit", "--quiet", "-m", "Add the hooks");
      git("config", "core.hooksPath", ".githooks");
      worktreeParent = mkdtempSync(path.join(tmpdir(), "rtfm-commit-task-worktree-"));
      worktree = path.join(worktreeParent, "task");
      git("worktree", "add", "--quiet", "-b", "task", worktree);
    });

    afterEach(() => rmSync(worktreeParent, { recursive: true, force: true }));

    const TASK_ONLY_IN_THE_CHECKOUT = `
### XX.3 — Added after the worktree
- **Status:** doing (agent a2)
- **Files:** \`src/widget/**\`
`;

    it("reads the task from the checkout's WORKLIST.md and commits on the worktree's branch, through its hook", () => {
      write("WORKLIST.md", `${WORKLIST}${TASK_ONLY_IN_THE_CHECKOUT}`);
      write("src/other.ts", "export const other = 2;\n");
      writeIn(worktree, "src/widget/new.ts", "export const widget = 1;\n");
      const mainBefore = git("rev-parse", "main");

      const result = commitTask(repo, "XX.3", { reviewedBy: "a7f3" }, worktree);

      expect(result).toEqual({
        subject: "XX.3: Added after the worktree",
        committed: ["src/widget/new.ts"],
        leftAlone: [],
      });
      expect(gitIn(worktree, "log", "-1", "--format=%B", "task")).toBe(
        `XX.3: Added after the worktree\n\nReviewed-by: a7f3\n${CO_AUTHOR}\n\n`,
      );
      expect(gitIn(worktree, "status", "--porcelain")).toBe("");
      expect(git("rev-parse", "main")).toBe(mainBefore);
      expect(git("status", "--porcelain")).toBe(" M WORKLIST.md\n M src/other.ts\n");
    });

    it("refuses changed files in the worktree that the task's Files don't match, listing them", () => {
      writeIn(worktree, "README.md", "# Readme\n\nWidgets.\n");
      writeIn(worktree, "src/other.ts", "export const other = 2;\n");
      writeIn(worktree, "notes/new.md", "Notes.\n");
      gitIn(worktree, "add", "src/other.ts");
      const status = gitIn(worktree, "status", "--porcelain", "--untracked-files=all");

      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" }, worktree)).toThrow(
        "XX.1's Files don't match these changed files in the worktree:\n  src/other.ts\n  notes/new.md\n" +
          "Add them to XX.1's Files in WORKLIST.md, or have the agent undo them.",
      );
      expect(gitIn(worktree, "status", "--porcelain", "--untracked-files=all")).toBe(status);
      expect(gitIn(worktree, "log", "-1", "--format=%s")).toBe("Add the hooks\n");
    });

    it("refuses another task's worktree, listing its changed files", () => {
      writeIn(worktree, "README.md", "# Readme\n\nWidgets.\n");
      expect(() => commitTask(repo, "XX.2", { reviewedBy: "a7f3" }, worktree)).toThrow(
        /^XX\.2's Files don't match these changed files in the worktree:\n {2}README\.md\n/,
      );
      expect(gitIn(worktree, "log", "-1", "--format=%s")).toBe("Add the hooks\n");
    });

    it("runs the hook in the worktree from the relative core.hooksPath", () => {
      writeIn(worktree, "README.md", "# Readme\n\nWidgets.\n");
      gitIn(worktree, "add", "README.md");
      const result = spawnSync("git", ["commit", "--quiet", "-m", "XX.1: Build the widget"], {
        cwd: worktree,
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/needs a Reviewed-by: trailer/);
    });

    it("refuses --no-review over 40 changed lines, and stages nothing in the worktree", () => {
      writeIn(worktree, "src/widget/new.ts", lines(41, "line"));
      expect(() => commitTask(repo, "XX.1", { noReviewReason: "small" }, worktree)).toThrow(/changes 41 lines/);
      expect(gitIn(worktree, "status", "--porcelain")).toBe("?? src/widget/new.ts\n");
      expect(gitIn(worktree, "log", "-1", "--format=%s")).toBe("Add the hooks\n");
    });

    it("refuses during a merge in the worktree, and with unmerged files", () => {
      writeIn(worktree, "README.md", "# Readme\n\nTask.\n");
      gitIn(worktree, "commit", "--quiet", "-am", "Task change");
      write("README.md", "# Readme\n\nMain.\n");
      git("commit", "--quiet", "-am", "Main change");
      expect(spawnSync("git", ["merge", "main"], { cwd: worktree }).status).not.toBe(0);
      writeIn(worktree, "src/widget/new.ts", "export {};\n");

      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" }, worktree)).toThrow(/A merge is in progress/);

      unlinkSync(path.resolve(worktree, gitIn(worktree, "rev-parse", "--git-path", "MERGE_HEAD").trim()));
      expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" }, worktree)).toThrow(/unmerged/);
      expect(gitIn(worktree, "log", "-1", "--format=%s")).toBe("Task change\n");
    });

    it("refuses a folder that isn't the top of one of the repository's worktrees", () => {
      const otherRepo = path.join(worktreeParent, "other");
      mkdirSync(otherRepo);
      gitIn(otherRepo, "init", "--quiet");
      writeIn(worktree, "README.md", "# Readme\n\nWidgets.\n");

      const subfolder = path.join(worktree, "src");
      const missing = path.join(worktreeParent, "missing");
      for (const folder of [otherRepo, subfolder, missing, worktreeParent]) {
        expect(() => commitTask(repo, "XX.1", { reviewedBy: "a7f3" }, folder)).toThrow(
          `${folder} is not a worktree of this repository.`,
        );
      }
      expect(gitIn(worktree, "log", "-1", "--format=%s")).toBe("Add the hooks\n");
    });

    it("commits in the worktree that --worktree names, relative to the working folder", () => {
      writeIn(worktree, "README.md", "# Readme\n\nWidgets.\n");
      const result = spawnSync(
        "node",
        [SCRIPT, "XX.1", "--worktree", path.relative(repo, worktree), "--reviewed-by", "a7f3"],
        { cwd: repo, encoding: "utf8" },
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("Committed XX.1: Build the widget\n  README.md\n");
      expect(gitIn(worktree, "log", "-1", "--format=%s")).toBe("XX.1: Build the widget\n");
      expect(git("log", "-1", "--format=%s")).toBe("Add the hooks\n");
    });
  });

  describe("the command", () => {
    it("commits and lists the files it left alone", () => {
      write("README.md", "# Readme\n\nWidgets.\n");
      write("src/other.ts", "export const other = 2;\n");
      const result = spawnSync("node", [SCRIPT, "XX.1", "--reviewed-by", "a7f3"], { cwd: repo, encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("Committed XX.1: Build the widget\n  README.md\nLeft alone:\n  src/other.ts\n");
    });

    it("commits from a folder below the top", () => {
      write("README.md", "# Readme\n\nWidgets.\n");
      const result = spawnSync("node", [SCRIPT, "XX.1", "--reviewed-by", "a7f3"], {
        cwd: path.join(repo, "src"),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(lastCommitFiles()).toEqual(["README.md"]);
    });

    it.each([[["XX.1"]], [["XX.1", "--reviewed-by", "a", "--no-review", "b"]], [["--reviewed-by", "a"]]])(
      "prints its usage for %j",
      (args) => {
        const result = spawnSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" });
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/^Usage: npm run commit-task/);
      },
    );
  });

  describe("the commit-msg hook", () => {
    it.each(["XX.1: Build the widget", "P0.1: Fix the build", "RC.12 tidy"])(
      "refuses %j without a Reviewed-by: trailer, naming the script",
      (subject) => {
        write("README.md", "# Readme\n\nWidgets.\n");
        git("add", "README.md");
        const result = commitByHand(subject);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/npm run commit-task/);
        expect(git("log", "--format=%s")).toBe("Start\n");
      },
    );

    it("passes a subject that only looks like a file name", () => {
      write("README.md", "# Readme\n\nWidgets.\n");
      git("add", "README.md");
      expect(commitByHand("PROCESS.md: tidy").status).toBe(0);
    });

    it("passes a task commit with a Reviewed-by: trailer", () => {
      write("README.md", "# Readme\n\nWidgets.\n");
      git("add", "README.md");
      expect(commitByHand(`XX.1: Build the widget\n\nReviewed-by: a7f3\n${CO_AUTHOR}`).status).toBe(0);
    });

    it("refuses a commit of Claude's that changes more than WORKLIST.md without a trailer", () => {
      write("src/other.ts", "export const other = 2;\n");
      write("WORKLIST.md", `${WORKLIST}\nmore\n`);
      git("add", ".");
      const result = commitByHand(`Fix a typo\n\n${CO_AUTHOR}`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Reviewed-by:/);
    });

    it("passes a commit of Claude's that changes only WORKLIST.md", () => {
      write("WORKLIST.md", `${WORKLIST}\nmore\n`);
      git("add", "WORKLIST.md");
      expect(commitByHand(`Update work list statuses\n\n${CO_AUTHOR}`).status).toBe(0);
    });

    it("passes the user's own commit", () => {
      write("src/other.ts", "export const other = 2;\n");
      git("add", "src/other.ts");
      expect(commitByHand("Tidy other.ts").status).toBe(0);
    });
  });
});
