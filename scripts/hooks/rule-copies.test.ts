import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ruleChangeNotice, saveRuleCopies } from "./rule-copies.ts";

const SCRIPT = fileURLToPath(new URL("./rule-copies.ts", import.meta.url));
const SESSION = "0b1c2d3e-session";

let folder: string;
let project: string;
let stateRoot: string;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "rtfm-rule-copies-test-"));
  project = path.join(folder, "project");
  stateRoot = path.join(folder, "tmp");
  mkdirSync(project);
  mkdirSync(stateRoot);
  write("CLAUDE.md", numberedLines("Rule", 200));
  write("PROCESS.md", "# Process\n\nRead the work list.\n");
});

afterEach(() => rmSync(folder, { recursive: true, force: true }));

function write(file: string, text: string) {
  writeFileSync(path.join(project, file), text);
}

function read(file: string): string {
  return readFileSync(path.join(project, file), "utf8");
}

function numberedLines(word: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `${word} ${index + 1}.\n`).join("");
}

function rulesDir(): string {
  return path.join(stateRoot, `rtfm-rules-${process.getuid?.() ?? "user"}`);
}

function check(agentId?: string) {
  return ruleChangeNotice(project, stateRoot, SESSION, agentId);
}

describe("ruleChangeNotice", () => {
  beforeEach(() => saveRuleCopies(project, stateRoot, SESSION));

  it("says nothing while the files match the session's copy", () => {
    expect(check()).toBeUndefined();
    expect(check()).toBeUndefined();
  });

  it("tells about a change once, then nothing until the file changes again", () => {
    write("PROCESS.md", read("PROCESS.md") + "Stop the loop when nothing can run.\n");

    const first = check();
    expect(first).toContain(`${path.join(project, "PROCESS.md")} changed after this conversation was given its copy`);
    expect(first).toContain("That file is the one in force");
    expect(first).toContain("+Stop the loop when nothing can run.");
    expect(first).not.toContain("CLAUDE.md");
    expect(check()).toBeUndefined();

    write("PROCESS.md", read("PROCESS.md") + "Commit with the script.\n");
    const second = check();
    expect(second).toContain("+Stop the loop when nothing can run.\n+Commit with the script.");
    expect(check()).toBeUndefined();
  });

  it("shows a change in two distant places as two hunks", () => {
    write("CLAUDE.md", read("CLAUDE.md").replace("Rule 5.\n", "Rule five.\n").replace("Rule 190.\n", "Rule 190, amended.\n"));

    const notice = check() ?? "";
    const diff = notice.slice(notice.indexOf("@@"));

    expect(diff).toBe(
      [
        "@@ -2,7 +2,7 @@ Rule 1.",
        " Rule 2.",
        " Rule 3.",
        " Rule 4.",
        "-Rule 5.",
        "+Rule five.",
        " Rule 6.",
        " Rule 7.",
        " Rule 8.",
        "@@ -187,7 +187,7 @@ Rule 186.",
        " Rule 187.",
        " Rule 188.",
        " Rule 189.",
        "-Rule 190.",
        "+Rule 190, amended.",
        " Rule 191.",
        " Rule 192.",
        " Rule 193.",
      ].join("\n"),
    );
  });

  it("cuts a long diff short and says how to see all of it", () => {
    write("CLAUDE.md", numberedLines("Changed rule", 200));
    const notice = check() ?? "";
    expect(notice.length).toBeLessThan(5000);
    expect(notice).toMatch(/… \(cut short; the whole diff is `git diff --no-index \S+CLAUDE\.md \S+CLAUDE\.md`\)$/);
  });

  it("says when a file is back to the copy after a change", () => {
    const original = read("PROCESS.md");
    write("PROCESS.md", original + "A rule.\n");
    check();
    write("PROCESS.md", original);
    expect(check()).toBe(
      `${path.join(project, "PROCESS.md")} is back to the copy of PROCESS.md this conversation was given when it started.`,
    );
    expect(check()).toBeUndefined();
  });

  it("tells each subagent once, about changes since the session's copy, including those before it started", () => {
    write("PROCESS.md", read("PROCESS.md") + "A rule.\n");
    expect(check()).toContain("+A rule.");

    expect(check("agent-early")).toContain("+A rule.");
    expect(check("agent-early")).toBeUndefined();
    expect(check()).toBeUndefined();

    write("CLAUDE.md", "Rule 0.\n" + read("CLAUDE.md"));
    const later = check("agent-early") ?? "";
    expect(later).toContain("+Rule 0.");
    expect(later).not.toContain("PROCESS.md");

    const late = check("agent-late") ?? "";
    expect(late).toContain("+A rule.");
    expect(late).toContain("+Rule 0.");
  });

  it("takes a fresh copy when the session starts again, and keeps what running subagents were told", () => {
    write("PROCESS.md", read("PROCESS.md") + "A rule.\n");
    expect(check("agent-running")).toContain("+A rule.");
    saveRuleCopies(project, stateRoot, SESSION);
    expect(check()).toBeUndefined();
    expect(check("agent-running")).toBeUndefined();
    expect(check("agent-new")).toBeUndefined();

    write("PROCESS.md", read("PROCESS.md") + "Another rule.\n");
    const notice = check();
    expect(notice).toContain("+Another rule.");
    expect(notice).not.toContain("+A rule.");
    expect(check("agent-running")).toContain("+Another rule.");
  });

  it("keeps its folder private to the user", () => {
    expect(statSync(rulesDir()).mode & 0o777).toBe(0o700);
  });

  it("says nothing while another check holds the lock, and takes over a stale lock", () => {
    write("PROCESS.md", read("PROCESS.md") + "A rule.\n");
    const lock = path.join(rulesDir(), SESSION, "seen", "session.json.lock");
    mkdirSync(lock, { recursive: true });
    expect(check()).toBeUndefined();

    const elevenSecondsAgo = new Date(Date.now() - 11_000);
    utimesSync(lock, elevenSecondsAgo, elevenSecondsAgo);
    expect(check()).toContain("+A rule.");
    expect(existsSync(lock)).toBe(false);
  });
});

describe("the hooks", () => {
  function run(command: string, input: object, env: NodeJS.ProcessEnv = process.env) {
    return spawnSync(process.execPath, [SCRIPT, command], {
      input: JSON.stringify(input),
      encoding: "utf8",
      env: { ...env, CLAUDE_PROJECT_DIR: project, TMPDIR: stateRoot },
    });
  }

  function runAsync(command: string, input: object): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT, command], {
        env: { ...process.env, CLAUDE_PROJECT_DIR: project, TMPDIR: stateRoot },
      });
      let stdout = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.on("error", reject);
      child.on("close", () => resolve(stdout));
      child.stdin.end(JSON.stringify(input));
    });
  }

  const startInput = { session_id: SESSION, hook_event_name: "SessionStart", source: "startup" };
  const toolInput = { session_id: SESSION, hook_event_name: "PostToolUse", tool_name: "Bash" };
  const subagentToolInput = { ...toolInput, agent_id: "a0083ed43e106a6c4", agent_type: "general-purpose" };
  const silent = { status: 0, stdout: "", stderr: "" };

  it("save prints nothing, and check tells the session and a subagent once each", () => {
    expect(run("save", startInput)).toMatchObject(silent);
    expect(run("check", toolInput)).toMatchObject(silent);

    write("PROCESS.md", read("PROCESS.md") + "A rule.\n");
    const told = run("check", toolInput);
    expect(told.status).toBe(0);
    const output = JSON.parse(told.stdout);
    expect(output.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(output.hookSpecificOutput.additionalContext).toContain("+A rule.");
    expect(run("check", toolInput)).toMatchObject(silent);

    expect(JSON.parse(run("check", subagentToolInput).stdout).hookSpecificOutput.additionalContext).toContain(
      "+A rule.",
    );
    expect(run("check", subagentToolInput)).toMatchObject(silent);
  });

  it("tells the session once when several tool calls check at the same time", async () => {
    run("save", startInput);
    write("PROCESS.md", read("PROCESS.md") + "A rule.\n");

    const outputs = await Promise.all(Array.from({ length: 6 }, () => runAsync("check", toolInput)));

    expect(outputs.filter((output) => output.includes("+A rule."))).toHaveLength(1);
    expect(outputs.filter((output) => output !== "")).toHaveLength(1);
    expect(run("check", toolInput)).toMatchObject(silent);
  });

  it("prints nothing and exits 0 without a saved copy, without git, or with bad input", () => {
    expect(run("check", toolInput)).toMatchObject(silent);

    run("save", startInput);
    write("PROCESS.md", read("PROCESS.md") + "A rule.\n");
    expect(run("check", toolInput, { PATH: folder })).toMatchObject(silent);
    expect(run("check", { ...toolInput, session_id: "../escape" })).toMatchObject(silent);
    expect(run("check", { tool_name: "Bash" })).toMatchObject(silent);
    expect(run("check", toolInput).stdout).toContain("+A rule.");

    rmSync(path.join(project, "CLAUDE.md"));
    expect(run("save", { ...startInput, session_id: "missing-file" })).toMatchObject(silent);
    expect(run("check", { ...toolInput, session_id: "missing-file" })).toMatchObject(silent);
  });
});
