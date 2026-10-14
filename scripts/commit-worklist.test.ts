import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CO_AUTHOR } from "./commit-task.ts";
import { commitWorklist, worklistChanges } from "./commit-worklist.ts";

const HOOKS_DIR = fileURLToPath(new URL("../.githooks", import.meta.url));
const SCRIPT = fileURLToPath(new URL("./commit-worklist.ts", import.meta.url));

const BEFORE = `# Work list

## A phase

### Rules for this phase

- **A rule.**

### XX.1 — Build the widget
- **Status:** doing (agent a1)
- **Files:** \`src/widget/**\`
- **Do:** build it.

### XX.2 — Polish the widget
- **Status:** todo
- **Files:** \`src/widget/**\`

### XX.3 — Wait for the widget
- **Status:** blocked (waiting for
  XX.1)
- **Files:** \`nowhere/**\`
`;

const AFTER = `# Work list

## A phase

### Rules for this phase

- **A rule, reworded.**

### XX.2 — Polish the widget
- **Status:** doing (agent b2)
- **Files:** \`src/widget/**\`

### XX.3 — Wait for the widget
- **Status:** blocked (waiting for XX.1)
- **Files:** \`nowhere/**\`, \`README.md\`

### XX.4 — Document the widget
- **Status:** todo
- **Files:** \`README.md\`
`;

const AFTER_CHANGES = ["Added XX.4 (todo)", "Removed XX.1", "XX.2: todo → doing (agent b2)"];

describe("worklistChanges", () => {
  it("lists each task added, removed, or whose status changed, and nothing for other edits", () => {
    expect(worklistChanges(BEFORE, AFTER)).toEqual(AFTER_CHANGES);
  });

  it("lists nothing when no task's status changed", () => {
    expect(worklistChanges(BEFORE, BEFORE.replace("build it.", "build it well."))).toEqual([]);
  });
});

describe("in a git repository", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "rtfm-commit-worklist-test-"));
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.name", "Test User");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", HOOKS_DIR);
    write("WORKLIST.md", BEFORE);
    write("README.md", "# Readme\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "Start");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  function git(...args: string[]): string {
    return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  }

  function write(file: string, text: string) {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), text);
  }

  function index(): Buffer {
    return readFileSync(path.join(repo, ".git", "index"));
  }

  function run(...args: string[]) {
    return spawnSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" });
  }

  describe("commitWorklist", () => {
    it("commits WORKLIST.md through the hook, with the changes as the body before the trailer", () => {
      write("WORKLIST.md", AFTER);

      expect(commitWorklist(repo)).toBe(AFTER_CHANGES.join("\n"));

      expect(git("log", "-1", "--format=%B")).toBe(
        `Update work list statuses\n\n${AFTER_CHANGES.join("\n")}\n\n${CO_AUTHOR}\n\n`,
      );
      expect(git("show", "--name-only", "--format=", "HEAD")).toBe("WORKLIST.md\n");
      expect(git("status", "--porcelain")).toBe("");
    });

    it("adds the reason as the body's last line", () => {
      write("WORKLIST.md", AFTER);
      commitWorklist(repo, "XX.1 merged; XX.4 found in its review");
      expect(git("log", "-1", "--format=%b")).toBe(
        `${AFTER_CHANGES.join("\n")}\nXX.1 merged; XX.4 found in its review\n\n${CO_AUTHOR}\n\n`,
      );
    });

    it("commits the working tree's version of WORKLIST.md when it changed again after staging", () => {
      write("WORKLIST.md", BEFORE.replace("- **Status:** todo", "- **Status:** blocked"));
      git("add", "WORKLIST.md");
      write("WORKLIST.md", AFTER);

      commitWorklist(repo);

      expect(git("show", "HEAD:WORKLIST.md")).toBe(AFTER);
      expect(git("status", "--porcelain")).toBe("");
    });

    it("refuses when any other file is changed, staged or new, listing them, and leaves the index as it was", () => {
      write("WORKLIST.md", AFTER);
      write("README.md", "# Readme\n\nChanged.\n");
      write("notes/new.md", "Notes.\n");
      git("add", "README.md");
      git("status");
      const before = index();

      expect(() => commitWorklist(repo)).toThrow(
        "Only WORKLIST.md may be changed or staged, but these are too:\n  README.md\n  notes/new.md\n" +
          "Commit or set them aside first.",
      );
      expect(index().equals(before)).toBe(true);
      expect(git("log", "--format=%s")).toBe("Start\n");
    });

    it("refuses when WORKLIST.md has no change, even after a change was staged and undone", () => {
      expect(() => commitWorklist(repo)).toThrow("WORKLIST.md has no change to commit.");
      write("WORKLIST.md", AFTER);
      git("add", "WORKLIST.md");
      write("WORKLIST.md", BEFORE);
      expect(() => commitWorklist(repo)).toThrow("WORKLIST.md has no change to commit.");
      expect(git("log", "--format=%s")).toBe("Start\n");
    });

    it("refuses a change that adds, removes and moves no task without a reason, and commits it with one", () => {
      write("WORKLIST.md", BEFORE.replace("build it.", "build it well."));
      expect(() => commitWorklist(repo)).toThrow(/^No task was added, removed or changed status: .*--reason/);
      expect(git("log", "--format=%s")).toBe("Start\n");

      expect(commitWorklist(repo, "Reword XX.1's Do")).toBe("Reword XX.1's Do");
    });

    it("refuses outside main, with commit-task's message", () => {
      write("WORKLIST.md", AFTER);
      git("switch", "--quiet", "-c", "side");
      expect(() => commitWorklist(repo)).toThrow(
        "The main checkout is on branch side, not main. Check out main there first.",
      );
      expect(git("log", "--format=%s")).toBe("Start\n");
    });
  });

  describe("the command", () => {
    it("commits and prints the body", () => {
      write("WORKLIST.md", AFTER);
      const result = run("--reason", "XX.1 merged");
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        `Committed Update work list statuses\n${[...AFTER_CHANGES, "XX.1 merged"].map((line) => `  ${line}\n`).join("")}`,
      );
    });

    it("prints its refusal", () => {
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("WORKLIST.md has no change to commit.\n");
    });

    it.each([[["--reason", " "]], [["--reason"]], [["XX.1"]], [["--other"]]])("refuses %j", (args) => {
      write("WORKLIST.md", AFTER);
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).not.toBe("");
      expect(git("log", "--format=%s")).toBe("Start\n");
    });
  });
});
