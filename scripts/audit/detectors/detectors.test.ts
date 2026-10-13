import { describe, expect, it } from "vitest";
import type { Event } from "../events.ts";
import { folderStaging } from "./folder-staging.ts";
import { processStops } from "./process-stops.ts";
import { isRuleFile, ruleFileEdits } from "./rule-file-edits.ts";
import { sensitivePaths } from "./sensitive-paths.ts";
import { subagentGitWrites } from "./subagent-git-writes.ts";
import { taskAgentPeak } from "./task-agent-peak.ts";
import { namesTask, taskCommitReviews } from "./task-commit-reviews.ts";
import { toolErrors } from "./tool-errors.ts";
import { userMessages } from "./user-messages.ts";

const ORCHESTRATOR = { session: "s1", who: "session: Example orchestrator" };
const TASK_AGENT = { session: "s1", agent: "a1", who: "subagent: ZZ.1 example task" };

let nextId = 0;

function tool(name: string, input: Record<string, unknown>, from: Partial<Event> = ORCHESTRATOR, time = "2030-01-01T10:00:00.000Z"): Event {
  return { id: `e${nextId++}`, time, session: "s1", who: "", ...from, kind: "tool", tool: name, input, result: "ok" };
}

const bash = (command: string, from: Partial<Event> = ORCHESTRATOR, time?: string) => tool("Bash", { command }, from, time);

const notes = (candidates: { note?: string }[]) => candidates.map((candidate) => candidate.note);

describe("userMessages", () => {
  it("lists what the user typed, and nothing else", () => {
    const events: Event[] = [
      { id: "1", time: "2030-01-01T10:00:00.000Z", ...ORCHESTRATOR, kind: "human", text: "Please rename the example" },
      { id: "2", time: "2030-01-01T10:00:01.000Z", ...ORCHESTRATOR, kind: "text", text: "Renaming it" },
    ];
    expect(userMessages(events).map((candidate) => candidate.what)).toEqual(["Please rename the example"]);
  });
});

describe("subagentGitWrites", () => {
  it("finds a subagent's git commands that change the repo", () => {
    const events = [
      bash("git rm -r --cached lib/example && git restore --staged lib/example", TASK_AGENT),
      bash("git worktree add --detach /tmp/example-tree HEAD", TASK_AGENT),
      bash("for f in a.ts b.ts; do git rm $f; done", TASK_AGENT),
    ];
    expect(notes(subagentGitWrites(events))).toEqual([
      "git rm -r --cached lib/example; git restore --staged lib/example",
      "git worktree add --detach /tmp/example-tree HEAD",
      "git rm $f",
    ]);
  });

  it("leaves out reads, dry runs, the orchestrator's commits and a heredoc's text", () => {
    const events = [
      bash("git mv -n a.ts b.ts; git stash list; git tag -l; git status", TASK_AGENT),
      bash("cat > notes.md <<'EOF'\ngit commit -am done\nEOF", TASK_AGENT),
      bash("grep -n 'git push' notes.md", TASK_AGENT),
      bash("git commit -m 'ZZ.1: An example'"),
    ];
    expect(subagentGitWrites(events)).toEqual([]);
  });
});

describe("processStops", () => {
  it("finds pkill, killall, fuser -k, kill-port and kill given a pid it didn't start", () => {
    const events = [
      bash("pkill -f 'example-server --port 5999'"),
      bash("killall example-server"),
      bash("kill $(lsof -ti :5999)"),
      bash("lsof -ti :5999 | xargs kill"),
      bash("kill 12345"),
      bash("fuser -k 5999/tcp"),
      bash("npx kill-port 5999"),
    ];
    expect(notes(processStops(events))).toEqual([
      "pkill -f example-server --port 5999",
      "killall example-server",
      "kill $(…)",
      "kill",
      "kill 12345",
      "fuser -k 5999/tcp",
      "npx kill-port 5999",
    ]);
  });

  it("leaves out stopping its own process, checking one, and text about pkill", () => {
    const events = [
      bash("npm run server & PID=$!\nsleep 2\nkill $PID"),
      bash("kill -0 $(cat /tmp/example.pid)"),
      bash("command -v pkill"),
      bash("grep -rn pkill notes.md"),
      bash("cat > rules.md <<'EOF'\nNever pkill -f example-server\nEOF"),
    ];
    expect(processStops(events)).toEqual([]);
  });
});

describe("sensitivePaths", () => {
  it("finds the data folder, local env files and ~/.aws, in commands and tool paths", () => {
    const events = [
      bash("rm -r .data/example"),
      bash("stat .env.local"),
      bash("cat ~/.aws/config"),
      bash("echo EXAMPLE=1 >> .env.local"),
      bash("printf x > .data/example.lock"),
      tool("Read", { file_path: "/home/example/app/.data/example.jsonl" }),
      tool("Glob", { pattern: ".env*.local" }),
    ];
    expect(notes(sensitivePaths(events))).toEqual([
      "the data folder",
      "a local env file",
      "the AWS config",
      "a local env file",
      "the data folder",
      "the data folder",
      "a local env file",
    ]);
  });

  it("leaves out a search pattern, echoed text and a heredoc's text", () => {
    const events = [
      bash("grep -rn '.data/' notes.md"),
      bash("echo 'keep .env.local out of git'"),
      bash("cat > notes.md <<'EOF'\nrm -r .data\nEOF"),
      tool("Read", { file_path: "/home/example/app/lib/data-folder.ts" }),
    ];
    expect(sensitivePaths(events)).toEqual([]);
  });
});

describe("ruleFileEdits", () => {
  it("finds edits to the rule files and .claude/, by a tool or a shell command", () => {
    const events = [
      tool("Edit", { file_path: "/home/example/app/CLAUDE.md" }),
      tool("Write", { file_path: "/home/example/app/.claude/settings.json" }),
      bash("sed -i '' 's/a/b/' WORKLIST.md", TASK_AGENT),
      bash("echo '- an example rule' >> PROCESS.md"),
      bash("git checkout -- CLAUDE.md"),
    ];
    expect(ruleFileEdits(events).map((candidate) => candidate.note ?? candidate.what)).toEqual([
      "Edit /home/example/app/CLAUDE.md",
      "Write /home/example/app/.claude/settings.json",
      "WORKLIST.md",
      "PROCESS.md",
      "CLAUDE.md",
    ]);
  });

  it("leaves out reading, staging and committing them, the orchestrator's work list, and other files", () => {
    const events = [
      tool("Read", { file_path: "/home/example/app/CLAUDE.md" }),
      bash("git add CLAUDE.md WORKLIST.md && git commit -m 'Tidy the work list'"),
      bash("grep -n Status WORKLIST.md > /tmp/statuses.txt"),
      bash("sed -i '' 's/a/b/' WORKLIST.md"),
      tool("Edit", { file_path: "/home/example/app/WORKLIST.md" }),
      tool("Edit", { file_path: "/home/example/app/.claude/worktrees/side-0000/lib/example.ts" }),
    ];
    expect(ruleFileEdits(events)).toEqual([]);
  });

  it("reads a worktree's files by their path within it, absolute or relative", () => {
    expect(isRuleFile("/home/example/app/.claude/worktrees/side-0000/WORKLIST.md")).toBe(true);
    expect(isRuleFile(".claude/worktrees/side-0000/.claude/settings.json")).toBe(true);
    expect(isRuleFile(".claude/worktrees/side-0000/lib/example.ts")).toBe(false);
  });
});

describe("folderStaging", () => {
  it("finds the orchestrator staging or committing whole folders", () => {
    const events = [
      bash("git add -A lib docs && git commit -m x"),
      bash("git add examples/"),
      bash("git add ."),
      bash("git add lib scripts/example"),
      bash("git add -u"),
      bash("git commit -am 'An example'"),
    ];
    expect(notes(folderStaging(events))).toEqual([
      "git add -A lib docs",
      "git add examples/",
      "git add .",
      "git add lib scripts/example",
      "git add -u",
      "git commit -am An example",
    ]);
  });

  it("asks whether a path is a folder, against the event's working folder, before guessing", () => {
    const folders = new Set(["/home/example/app/lib.d"]);
    const isDirectory = (file: string) => (file.startsWith("/home/example/app/") ? folders.has(file) : undefined);
    const events = [bash("git add lib.d"), bash("git add Makefile")].map((event) => ({ ...event, cwd: "/home/example/app" }));
    expect(notes(folderStaging(events, isDirectory))).toEqual(["git add lib.d"]);
  });

  it("leaves out staging named files, and subagents", () => {
    expect(folderStaging([bash("git add lib/example.ts notes.md"), bash("git add -A lib", TASK_AGENT)])).toEqual([]);
  });
});

describe("taskCommitReviews", () => {
  const review = (description: string, time: string) => tool("Agent", { description, prompt: "…" }, ORCHESTRATOR, time);
  const commit = (hash: string, time: string, subject: string) => ({ hash, time, subject });

  it("compares commit times in the committer's time zone with UTC event times", () => {
    const events = [review("Review ZZ.7 example", "2030-01-02T04:30:00.000Z"), review("Review ZZ.8 example", "2030-01-02T05:10:00.000Z")];
    const commits = [
      commit("h8", "2030-01-01T23:00:00-06:00", "ZZ.8: Another example"),
      commit("h7", "2030-01-01T22:40:00-06:00", "ZZ.7: An example"),
    ];
    expect(taskCommitReviews(events, commits).map(({ tasks, time, reviewed }) => ({ tasks, time, reviewed }))).toEqual([
      { tasks: ["ZZ.7"], time: "2030-01-02T04:40:00.000Z", reviewed: true },
      { tasks: ["ZZ.8"], time: "2030-01-02T05:00:00.000Z", reviewed: false },
    ]);
  });

  it("matches a review to the task it names, not to a longer id that starts the same", () => {
    const events = [review("Review ZZ.11 and ZZ.14", "2030-01-01T00:00:00.000Z"), review("Code review of ZZ.4b", "2030-01-01T00:00:00.000Z")];
    const commits = [
      commit("a", "2030-01-01T01:00:00Z", "ZZ.1: An example"),
      commit("b", "2030-01-01T01:00:01Z", "ZZ.14: An example"),
      commit("c", "2030-01-01T01:00:02Z", "ZZ.4: An example"),
    ];
    expect(taskCommitReviews(events, commits).map(({ tasks, reviewed }) => [tasks[0], reviewed])).toEqual([
      ["ZZ.1", false],
      ["ZZ.14", true],
      ["ZZ.4", false],
    ]);
  });

  it("counts a review only since the task's previous commit, so a reused id starts afresh", () => {
    const events = [review("Review ZZ.3 first round", "2030-01-01T09:00:00.000Z")];
    const commits = [commit("b", "2030-01-03T10:00:00Z", "ZZ.3: Used again"), commit("a", "2030-01-01T10:00:00Z", "ZZ.3: First use")];
    expect(taskCommitReviews(events, commits).map(({ hash, reviewed }) => [hash, reviewed])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("takes only the word review: a preview isn't one", () => {
    const events = [review("Preview ZZ.5 in the browser", "2030-01-01T09:00:00.000Z")];
    expect(taskCommitReviews(events, [commit("a", "2030-01-01T10:00:00Z", "ZZ.5: An example")])[0].reviewed).toBe(false);
  });

  it("reads several task ids from one commit, and skips commits that aren't a task's", () => {
    const commits = [
      commit("a", "2030-01-01T01:00:00Z", "ZZ.5, ZZ.6: Two at once"),
      commit("b", "2030-01-01T01:00:01Z", "CLAUDE.md: An example rule"),
      commit("c", "2030-01-01T01:00:02Z", "Tidy the work list"),
    ];
    expect(taskCommitReviews([], commits).map((each) => each.tasks)).toEqual([["ZZ.5", "ZZ.6"]]);
  });

  it("names a task only at its own boundaries", () => {
    expect(namesTask("Review ZZ.1 example", "ZZ.1")).toBe(true);
    expect(namesTask("Review ZZ.1.", "ZZ.1")).toBe(true);
    expect(namesTask("Review ZZ.11", "ZZ.1")).toBe(false);
    expect(namesTask("Review ZZ.4b", "ZZ.4")).toBe(false);
    expect(namesTask("Review ZZ.6.A", "ZZ.6")).toBe(false);
  });
});

describe("taskAgentPeak", () => {
  const agentEvent = (agent: string, description: string, time: string, kind: Event["kind"] = "tool", resultTime?: string): Event => ({
    id: `${agent}-${time}`,
    time: `2030-01-01T${time}:00.000Z`,
    session: "s1",
    agent,
    who: `subagent: ${description}`,
    kind,
    resultTime: resultTime && `2030-01-01T${resultTime}:00.000Z`,
  });

  it("counts task agents running at once, and not one waiting for its next message", () => {
    const events = [
      agentEvent("a", "ZZ.1 first", "10:00", "prompt"),
      agentEvent("b", "ZZ.2 second", "10:01", "prompt"),
      agentEvent("a", "ZZ.1 first", "10:05"),
      agentEvent("c", "Review ZZ.1", "10:06", "prompt"),
      agentEvent("d", "ZZ.4 fourth", "10:10", "prompt"),
      agentEvent("b", "ZZ.2 second", "10:12"),
      agentEvent("d", "ZZ.4 fourth", "10:13"),
      agentEvent("a", "ZZ.1 first", "10:20", "prompt"),
      agentEvent("a", "ZZ.1 first", "10:22"),
    ].sort((x, y) => x.time.localeCompare(y.time));
    const peak = taskAgentPeak(events);
    expect(peak.peak).toBe(2);
    expect(peak.running.map((run) => run.who)).toEqual(["subagent: ZZ.1 first", "subagent: ZZ.2 second"]);
  });

  it("ends a run when its last tool call's result comes back", () => {
    const events = [
      agentEvent("a", "ZZ.1 first", "10:00", "prompt"),
      agentEvent("a", "ZZ.1 first", "10:01", "tool", "10:30"),
      agentEvent("b", "ZZ.2 second", "10:20", "prompt"),
    ];
    expect(taskAgentPeak(events).peak).toBe(2);
  });
});

describe("toolErrors", () => {
  it("groups failures by their first line, after a shell command's exit code", () => {
    const failed = (name: string, result: string): Event => ({ ...tool(name, { command: "x" }), result, isError: true });
    const groups = toolErrors([
      failed("Bash", "Exit code 128\nfatal: bad revision 'example'"),
      failed("Bash", "Exit code 128\nfatal: bad revision 'example'"),
      failed("Read", "Example failure."),
      tool("Bash", { command: "ls" }),
    ]);
    expect(groups.map(({ firstLine, count }) => [firstLine, count])).toEqual([
      ["Bash: Exit code 128: fatal: bad revision 'example'", 2],
      ["Read: Example failure.", 1],
    ]);
  });
});
