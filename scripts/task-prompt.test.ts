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

  it("gives a task agent the standing rules and pointers to the rule files and docs index", () => {
    const prompt = taskPrompt(WORKLIST, "YY.1", "task");
    for (const rule of [
      "**task agent**",
      "run `npm ci`",
      "`CLAUDE.md`",
      "`PROCESS.md`",
      "`README.md` › The docs",
      "as committed on `main` (`git show main:<file>`)",
      "Planned work belongs in `WORKLIST.md`, which only the orchestrator edits: name it in your report.",
      '"Outside Files" with the reason',
      "Run no git command that changes anything",
      "Don't edit `WORKLIST.md`",
      "`npm run serve-temp`",
      "never `npm run dev`",
      "Stop only processes you started, by the handle or PID",
      "never `pkill`",
      "`.env.local`",
      "Docs describe what exists",
      "start with `=`",
      "your worktree's path and branch",
      "the checks you ran",
      "anything unresolved",
    ]) {
      expect(prompt).toContain(rule);
    }
    expect(prompt).not.toContain("src/manual/README.md");
  });

  it("gives a reviewer the read-only version, with the task and its phase's rules", () => {
    const prompt = taskPrompt(WORKLIST, "YY.1", "review");
    for (const rule of [
      "**reviewer**",
      "change no files, and run no git command that changes anything",
      "under the worktree's path (`<worktree>/scripts/x.ts`)",
      "New files are untracked, so `git diff` doesn't show them: read them directly.",
      "as committed on `main` (`git show main:<file>`)",
      "**Done when**",
      "in the agent's Outside Files at the end",
      "Run the task's checks in the worktree (`npm ci` there first if `node_modules` is missing)",
      "`npm run serve-temp`",
      "`.env.local`",
      "start with `=`",
      "a concrete failure and what to change; say which must be fixed before commit",
    ]) {
      expect(prompt).toContain(rule);
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
