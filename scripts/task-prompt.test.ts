import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { taskPrompt } from "./task-prompt.ts";

const SCRIPT = fileURLToPath(new URL("./task-prompt.ts", import.meta.url));

const WORKLIST = `# Work list

Intro to the work list.

## Waiting on someone

Work that waits.

### XX.1 — One-line items
- **Status:** blocked (the user does a thing)
- **Depends on:** —
- **Files:** \`server/thing.ts\`, \`server/README.md\`
- **Do:** fix the thing.
- **Done when:** the thing works.

---

## A phase with rules

Why this phase exists. When this phase is done:

- the widget works.

### Rules for this phase

- **Phase rule one.** Applies to every task here.
- **Phase rule two.**

### YY.1 — Items across lines
- **Status:** needs-human (the user approves the \`PROCESS.md\`
  change; agent a1, reviewed by b2)
- **Depends on:** XX.1 (both change
  \`README.md\`)
- **Files:** \`scripts/widget.ts\` and its test (new), \`PROCESS.md\` (the user
  approves)
- **Do:**
  - Build the widget:
    - with a knob;
  - Document it.
- **Done when:** \`npm test\` passes.

### YY.10 — The last task
- **Status:** todo
- **Depends on:** —
- **Files:** \`nowhere/**\`
- **Do:** nothing.
- **Done when:** nothing changed.
`;

describe("taskPrompt", () => {
  it("carries a one-line-item block followed by a rule, with its phase and no Status", () => {
    const prompt = taskPrompt(WORKLIST, "XX.1", "task");
    expect(prompt).toContain(
      `## Waiting on someone

Work that waits.

### XX.1 — One-line items
- **Depends on:** —
- **Files:** \`server/thing.ts\`, \`server/README.md\`
- **Do:** fix the thing.
- **Done when:** the thing works.

Report back with:`,
    );
    expect(prompt).not.toContain("Status");
    expect(prompt).not.toContain("Rules for this phase");
  });

  it("carries a block whose items continue across lines and nest, with the phase's rules", () => {
    const prompt = taskPrompt(WORKLIST, "YY.1", "task");
    expect(prompt).toContain(
      `## A phase with rules

Why this phase exists. When this phase is done:

- the widget works.

### Rules for this phase

- **Phase rule one.** Applies to every task here.
- **Phase rule two.**

### YY.1 — Items across lines
- **Depends on:** XX.1 (both change
  \`README.md\`)
- **Files:** \`scripts/widget.ts\` and its test (new), \`PROCESS.md\` (the user
  approves)
- **Do:**
  - Build the widget:
    - with a knob;
  - Document it.
- **Done when:** \`npm test\` passes.

Report back with:`,
    );
    expect(prompt).not.toContain("Status");
    expect(prompt).not.toContain("agent a1");
    expect(prompt).not.toContain("YY.10");
  });

  it("carries the last block in the file, and only its own phase", () => {
    const prompt = taskPrompt(WORKLIST, "YY.10", "task");
    expect(prompt).toContain("### YY.10 — The last task\n- **Depends on:** —");
    expect(prompt).toContain("- **Done when:** nothing changed.\n\nReport back with:");
    expect(prompt).toContain("- **Phase rule two.**");
    expect(prompt).not.toContain("Waiting on someone");
    expect(prompt).not.toContain("### YY.1 —");
  });

  it("refuses an unknown ID, or a prefix of one", () => {
    expect(() => taskPrompt(WORKLIST, "XX.9", "task")).toThrow("There is no task XX.9 in WORKLIST.md.");
    expect(() => taskPrompt("### YY.10 — Ten\n- **Do:** it.", "YY.1", "task")).toThrow("There is no task YY.1");
  });

  const RESTATED_RULES = ["serve-temp", "npm run dev", "pkill", ".env.local", "zsh", "start with `=`", "Standing rules"];

  it("gives a task agent its role, pointers to the rule files and docs index, and what to report", () => {
    const prompt = taskPrompt(WORKLIST, "YY.1", "task");
    for (const part of [
      "**task agent**",
      "run `npm ci`",
      "`CLAUDE.md` and `PROCESS.md` as committed on `main` (`git show main:<file>`)",
      "`README.md` › The docs",
      "`CLAUDE.md` › Shell and Code standards",
      "`PROCESS.md` › Roles (the task agent), Authority, and Rules (Starting a task agent, Files outside the list, Only the orchestrator commits, Agents never edit `WORKLIST.md`)",
      "this prompt doesn't repeat them",
      "your worktree's path and branch",
      '"Outside Files" with the reason',
      "the full diff of any change to a file only the user approves (`PROCESS.md` › Authority)",
      "any work you found that belongs in `WORKLIST.md`",
      "the checks you ran",
      "anything unresolved",
    ]) {
      expect(prompt).toContain(part);
    }
    for (const rule of RESTATED_RULES) {
      expect(prompt).not.toContain(rule);
    }
    expect(prompt).not.toContain("src/manual/README.md");
  });

  it("gives a reviewer the read-only version, with the task and its phase's rules", () => {
    const prompt = taskPrompt(WORKLIST, "YY.1", "review");
    for (const part of [
      "**reviewer**",
      "change no files, and run no git command that changes anything",
      "under the worktree's path (`<worktree>/scripts/x.ts`)",
      "New files are untracked, so `git diff` doesn't show them: read them directly.",
      "as committed on `main` (`git show main:<file>`)",
      "**Done when**",
      "in the agent's Outside Files at the end",
      "Run the task's checks in the worktree (`npm ci` there first if `node_modules` is missing)",
      "Your commands, and any server you start, follow `CLAUDE.md` › Shell",
      "a concrete failure and what to change; say which must be fixed before commit",
    ]) {
      expect(prompt).toContain(part);
    }
    for (const rule of RESTATED_RULES) {
      expect(prompt).not.toContain(rule);
    }
    expect(prompt.endsWith("\n\n**Worktree:** <path>. **The agent's Outside Files:** <list, or none>.")).toBe(true);
    expect(prompt).toContain("- **Phase rule one.**");
    expect(prompt).toContain("### YY.1 — Items across lines");
    expect(prompt).not.toContain("**task agent**");
    expect(prompt).not.toContain("Status");
  });
});

describe("npm run task-prompt", () => {
  function run(...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  }

  it("refuses a task that isn't in WORKLIST.md", () => {
    const unknown = run("ZZ.999");
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("There is no task ZZ.999 in WORKLIST.md.");
  });

  it("prints its usage without exactly one ID", () => {
    const result = run("--review");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage: npm run task-prompt -- <ID> [--review]");
  });
});
