import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLeftovers, leftovers, preflightProblems, worklistTasks } from "./orchestrator-check.ts";

const SCRIPT = fileURLToPath(new URL("./orchestrator-check.ts", import.meta.url));

const WORKLIST = `# Work list

## A phase

### Rules for this phase

- **A rule.**

### XX.1 — Build the widget
- **Status:** doing (agent a1, in its own worktree; review
  round 2)
- **Files:** \`src/widget/**\`

### XX.2 — Polish the widget
- **Status:** doing (in its own worktree, agent
  b2)
- **Files:** \`src/widget/**\`

### XX.3 — Wait for the widget
- **Status:** todo
- **Files:** \`nowhere/**\`

### XX.4 — Start by hand
- **Status:** doing
- **Files:** \`nowhere/**\`

### XX.5 — Ask the user
- **Status:** needs-human (the user decides; agent c5)
- **Files:** \`nowhere/**\`
`;

describe("worklistTasks", () => {
  it("lists each task with its status on one line and the agent it records, across continuation lines", () => {
    expect(worklistTasks(WORKLIST)).toEqual([
      {
        id: "XX.1",
        title: "Build the widget",
        status: "doing (agent a1, in its own worktree; review round 2)",
        agent: "a1",
      },
      { id: "XX.2", title: "Polish the widget", status: "doing (in its own worktree, agent b2)", agent: "b2" },
      { id: "XX.3", title: "Wait for the widget", status: "todo", agent: undefined },
      { id: "XX.4", title: "Start by hand", status: "doing", agent: undefined },
      { id: "XX.5", title: "Ask the user", status: "needs-human (the user decides; agent c5)", agent: "c5" },
    ]);
  });
});

describe("in a git repository", () => {
  let repo: string;
  let worktreeParent: string;

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(path.join(tmpdir(), "rtfm-orchestrator-check-test-")));
    worktreeParent = realpathSync(mkdtempSync(path.join(tmpdir(), "rtfm-orchestrator-check-worktrees-")));
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.name", "Test User");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", ".githooks");
    write(repo, "WORKLIST.md", WORKLIST);
    write(repo, "README.md", "# Readme\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "Start");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(worktreeParent, { recursive: true, force: true });
  });

  function git(...args: string[]): string {
    return gitIn(repo, ...args);
  }

  function gitIn(dir: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  }

  function write(dir: string, file: string, text: string) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }

  function addWorktree(branch: string): string {
    const worktree = path.join(worktreeParent, branch.replaceAll("/", "-"));
    git("worktree", "add", "--quiet", "-b", branch, worktree);
    return worktree;
  }

  describe("preflightProblems", () => {
    it("finds none in the main checkout on main, clean, with core.hooksPath at .githooks", () => {
      expect(preflightProblems(repo)).toEqual([]);
      git("config", "core.hooksPath", path.join(repo, ".githooks"));
      expect(preflightProblems(repo)).toEqual([]);
    });

    it("names the main checkout when run in a linked worktree", () => {
      const worktree = addWorktree("worktree-agent-a1");
      expect(preflightProblems(worktree)).toEqual([
        `${worktree} is a linked worktree, not the main checkout. Run this command in the main checkout, ${repo}.`,
      ]);
    });

    it("says to check out main when the main checkout is on another branch or a detached HEAD", () => {
      git("switch", "--quiet", "-c", "side");
      expect(preflightProblems(repo)).toEqual([
        "The main checkout is on branch side, not main. Check out main there first.",
      ]);
      git("switch", "--quiet", "--detach", "main");
      expect(preflightProblems(repo)).toEqual([
        "The main checkout is on a detached HEAD, not main. Check out main there first.",
      ]);
    });

    it("lists uncommitted changes", () => {
      write(repo, "README.md", "# Readme\n\nChanged.\n");
      write(repo, "notes/new.md", "Notes.\n");
      expect(preflightProblems(repo)).toEqual([
        "The main checkout has uncommitted changes:\n   M README.md\n  ?? notes/\nCommit them or set them aside first.",
      ]);
    });

    it("says how to set core.hooksPath when it is unset or points elsewhere", () => {
      const expected = path.join(repo, ".githooks");
      const advice =
        "so git doesn't run this repo's commit-msg hook. Set it in the main checkout: git config core.hooksPath .githooks";
      git("config", "--unset", "core.hooksPath");
      expect(preflightProblems(repo)).toEqual([`core.hooksPath isn't set, not ${expected}, ${advice}`]);
      git("config", "core.hooksPath", "hooks");
      expect(preflightProblems(repo)).toEqual([
        `core.hooksPath is hooks, which is ${path.join(repo, "hooks")}, not ${expected}, ${advice}`,
      ]);
    });

    it("names every problem in the main checkout at once", () => {
      write(repo, "README.md", "# Readme\n\nChanged.\n");
      git("config", "--unset", "core.hooksPath");
      const problems = preflightProblems(repo);
      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(/^The main checkout has uncommitted changes/);
      expect(problems[1]).toMatch(/^core\.hooksPath isn't set/);
    });
  });

  describe("leftovers", () => {
    it("reports nothing when no task is doing and no task worktree is left", () => {
      write(repo, "WORKLIST.md", "# Work list\n\n### XX.5 — Ask the user\n- **Status:** needs-human (agent c5)\n");
      addWorktree("claude/older-session");
      expect(formatLeftovers(leftovers(repo))).toBe("Nothing is left from an earlier run.");
    });

    it("pairs tasks with task worktrees by agent ID, and lists either side with no match", () => {
      const paired = addWorktree("worktree-agent-a1");
      write(paired, "src/widget/done.ts", "export {};\n");
      gitIn(paired, "add", ".");
      gitIn(paired, "commit", "--quiet", "-m", "Widget work");
      const hash = gitIn(paired, "rev-parse", "--short", "HEAD").trim();
      write(paired, "src/widget/more.ts", "export {};\n");
      const needsHuman = addWorktree("worktree-agent-c5");
      const unpaired = addWorktree("worktree-agent-d4");
      addWorktree("claude/older-session");

      expect(formatLeftovers(leftovers(repo))).toBe(
        [
          "Doing tasks in WORKLIST.md:",
          `  XX.1 — Build the widget: agent a1, worktree ${paired}`,
          "  XX.2 — Polish the widget: agent b2, no worktree",
          "  XX.4 — Start by hand: no agent recorded",
          "",
          "Task worktrees:",
          `  ${paired} (worktree-agent-a1): task XX.1, doing (agent a1, in its own worktree; review round 2)`,
          "    commits ahead of main:",
          `      ${hash} Widget work`,
          "    uncommitted:",
          "      ?? src/widget/more.ts",
          `  ${needsHuman} (worktree-agent-c5): task XX.5, needs-human (the user decides; agent c5)`,
          "    no commits ahead of main",
          "    nothing uncommitted",
          `  ${unpaired} (worktree-agent-d4): no task records its agent`,
          "    no commits ahead of main",
          "    nothing uncommitted",
        ].join("\n"),
      );
    });

    it("says when a task worktree's folder is missing", () => {
      const worktree = addWorktree("worktree-agent-b2");
      rmSync(worktree, { recursive: true, force: true });
      expect(formatLeftovers(leftovers(repo))).toContain(
        `  ${worktree} (worktree-agent-b2): task XX.2, doing (in its own worktree, agent b2)\n` +
          "    no commits ahead of main\n    its folder is missing",
      );
    });
  });

  describe("the command", () => {
    it("fails from a linked worktree, naming the main checkout", () => {
      const worktree = addWorktree("worktree-agent-a1");
      const result = spawnSync("node", [SCRIPT], { cwd: worktree, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(
        `${worktree} is a linked worktree, not the main checkout. Run this command in the main checkout, ${repo}.\n`,
      );
      expect(result.stdout).toBe("");
    });

    it("passes in the main checkout and reports the leftovers", () => {
      const result = spawnSync("node", [SCRIPT], { cwd: repo, encoding: "utf8" });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^The main checkout is on main, clean, and runs the repo's hooks\.\n\nDoing tasks/);
      expect(result.stdout).toContain("XX.2 — Polish the widget: agent b2, no worktree");
    });
  });
});
