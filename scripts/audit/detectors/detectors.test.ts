import { describe, expect, it } from "vitest";
import type { Event } from "../events.ts";
import type { Commit } from "../repo.ts";
import { namedTasks } from "../task-ids.ts";
import { agentPromptsMissingRules } from "./agent-prompts.ts";
import { folderStaging } from "./folder-staging.ts";
import { loopPasses } from "./loop-passes.ts";
import { processStops } from "./process-stops.ts";
import { readOnlyWrites } from "./read-only-writes.ts";
import { isRuleFile, ruleFileEdits } from "./rule-file-edits.ts";
import { sensitivePaths } from "./sensitive-paths.ts";
import { subagentGitWrites } from "./subagent-git-writes.ts";
import { taskAgentPeak } from "./task-agent-peak.ts";
import { taskCommitReviews } from "./task-commit-reviews.ts";
import { editsOutsideTaskFiles } from "./task-files.ts";
import { toolErrors } from "./tool-errors.ts";
import { userMessages } from "./user-messages.ts";
import { zshErrors } from "./zsh-errors.ts";

const REPO = "/home/example/app";
const ORCHESTRATOR = { session: "s1", who: "session: Example orchestrator", cwd: REPO };
const TASK_AGENT = { session: "s1", agent: "a1", who: "subagent: ZZ.1 example task", cwd: REPO };
const REVIEWER = { session: "s1", agent: "r1", who: "subagent: Review ZZ.1 example", cwd: REPO };

let nextId = 0;

function tool(
  name: string,
  input: Record<string, unknown>,
  from: Partial<Event> = ORCHESTRATOR,
  time = "2030-01-01T10:00:00.000Z",
): Event {
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
    expect(processStops(events).map(({ note, source }) => [note, source])).toEqual([
      ["pkill -f example-server --port 5999", ["found by port or pattern"]],
      ["killall example-server", ["by name"]],
      ["kill $(…)", ["found by port or pattern"]],
      ["kill", ["found by port or pattern"]],
      ["kill 12345", ["unknown"]],
      ["fuser -k 5999/tcp", ["found by port or pattern"]],
      ["npx kill-port 5999", ["found by port or pattern"]],
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

  it("leaves out kill $(cat <file>) when the same agent wrote the file from $!", () => {
    const events = [
      bash("npx example-server > /tmp/example.log 2>&1 & echo $! > /tmp/example.pid", TASK_AGENT),
      bash("kill $(cat /tmp/example.pid)", TASK_AGENT),
      bash("kill $(cat /tmp/example.pid)"),
      bash("kill $(cat /tmp/other.pid)", TASK_AGENT),
    ];
    expect(processStops(events).map(({ who, source }) => [who, source])).toEqual([
      [ORCHESTRATOR.who, ["unknown"]],
      [TASK_AGENT.who, ["unknown"]],
    ]);
  });

  it("leaves out a literal pid that the agent's own launch printed, at once or in its output file", () => {
    const launched = { ...bash("npx example-server & echo $!", TASK_AGENT), result: "41001" };
    const background = {
      ...tool("Bash", { command: "npx example-server --port 5998", run_in_background: true }, TASK_AGENT),
      result:
        "Command running in background with ID: b1. Output is being written to: /tmp/tasks/b1.output. You will be notified.",
    };
    const output = { ...bash("cat /tmp/tasks/b1.output", TASK_AGENT), result: "Example server 41002 on 5998" };
    const events = [
      launched,
      background,
      output,
      bash("kill 41001", TASK_AGENT),
      bash("kill -TERM 41002", TASK_AGENT),
      bash("kill 41001"),
    ];
    expect(processStops(events).map(({ who, note }) => [who, note])).toEqual([[ORCHESTRATOR.who, "kill 41001"]]);
  });

  it("leaves out its own pid before asking about lookups, and doesn't take ps -p for one", () => {
    const events = [
      bash("npx example-server & P=$!; sleep 2; ps -p $P > /dev/null && kill $P", TASK_AGENT),
      bash("npx example-server & echo $! > /tmp/example.pid", TASK_AGENT),
      bash("kill $(cat /tmp/example.pid); ps -p $(cat /tmp/example.pid)", TASK_AGENT),
      bash("kill -TERM ${P}; lsof -ti :5999", { ...TASK_AGENT, agent: "a2" }),
      bash("P=$(lsof -ti :5999); kill $P", { ...TASK_AGENT, agent: "a3" }),
    ];
    expect(processStops(events).map(({ note, source }) => [note, source])).toEqual([
      ["kill -TERM ${P}", ["found by port or pattern"]],
      ["kill $P", ["found by port or pattern"]],
    ]);
  });

  it("marks a literal pid found earlier by lsof, ps or pgrep as found by port or pattern", () => {
    const looked = {
      ...bash("lsof -nP -iTCP:5999 -sTCP:LISTEN", TASK_AGENT),
      result: "node 41003 example 14u IPv6 TCP *:5999 (LISTEN)",
    };
    const events = [looked, bash("kill 41003", TASK_AGENT), bash("kill 41004", TASK_AGENT)];
    expect(processStops(events).map(({ note, source }) => [note, source])).toEqual([
      ["kill 41003", ["found by port or pattern"]],
      ["kill 41004", ["unknown"]],
    ]);
  });

  it("takes pids a lookup printed as found by port or pattern, even in a call that reads launch output or launches", () => {
    const background = {
      ...tool("Bash", { command: "npx example-server --port 5998", run_in_background: true }, TASK_AGENT),
      result:
        "Command running in background with ID: b1. Output is being written to: /tmp/tasks/b1.output. You will be notified.",
    };
    const readAndLookUp = {
      ...bash("cat /tmp/tasks/b1.output; lsof -nP -iTCP:5998 -sTCP:LISTEN", TASK_AGENT),
      result: "Example server on 5998\nnode 41005 example 14u IPv6 TCP *:5998 (LISTEN)",
    };
    const launchAndLookUp = { ...bash("(npx example-server &); pgrep -f example-server", TASK_AGENT), result: "41006" };
    const events = [background, readAndLookUp, bash("kill 41005", TASK_AGENT), launchAndLookUp, bash("kill 41006", TASK_AGENT)];
    expect(processStops(events).map(({ note, source }) => [note, source])).toEqual([
      ["kill 41005", ["found by port or pattern"]],
      ["kill 41006", ["found by port or pattern"]],
    ]);
  });

  it("judges kill $VAR like kill $(…) when the variable was assigned from $(…)", () => {
    const events = [
      bash("npx example-server & echo $! > /tmp/example.pid", TASK_AGENT),
      bash("PID=$(cat /tmp/example.pid); kill $PID", TASK_AGENT),
      bash("PID=$(cat /tmp/other.pid); kill $PID", TASK_AGENT),
    ];
    expect(processStops(events).map(({ note, source }) => [note, source])).toEqual([["kill $PID", ["unknown"]]]);
  });
});

describe("sensitivePaths", () => {
  const notesByAccess = (found: ReturnType<typeof sensitivePaths>) =>
    Object.fromEntries(Object.entries(found).map(([access, candidates]) => [access, notes(candidates)]));

  it("finds the data folder, local env files and ~/.aws, split into writes, reads and runtime loads", () => {
    const events = [
      bash("rm -r .data/example"),
      bash("stat .env.local"),
      bash("cat ~/.aws/config"),
      bash("echo EXAMPLE=1 >> .env.local"),
      bash("printf x > .data/example.lock"),
      tool("Read", { file_path: "/home/example/app/.data/example.jsonl" }),
      tool("Write", { file_path: "/home/example/app/.env.example.local" }),
      tool("Glob", { pattern: ".env*.local" }),
      bash("node scripts/example-check.ts .env.local"),
      bash("node --env-file=.env.local scripts/example.ts"),
    ];
    expect(notesByAccess(sensitivePaths(events))).toEqual({
      writes: ["the data folder", "a local env file", "the data folder", "a local env file"],
      reads: ["a local env file", "the AWS config", "the data folder", "a local env file"],
      runtimeLoads: ["a local env file", "a local env file"],
    });
  });

  it("splits one call's writes from its reads", () => {
    const found = sensitivePaths([bash("cp .data/example.json /tmp/example.json && rm .data/example.lock")]);
    expect(notesByAccess(found)).toEqual({ writes: ["the data folder"], reads: ["the data folder"], runtimeLoads: [] });
  });

  it("leaves out a search pattern, echoed text, a heredoc's text and what a search excludes", () => {
    const events = [
      bash("grep -rn '.data/' notes.md"),
      bash("echo 'keep .env.local out of git'"),
      bash("cat > notes.md <<'EOF'\nrm -r .data\nEOF"),
      tool("Read", { file_path: "/home/example/app/lib/data-folder.ts" }),
      bash("grep -rn example --exclude-dir=.data --exclude-dir=node_modules ."),
      bash("grep -rn example --exclude .env.local --exclude=.env.example.local ."),
    ];
    expect(sensitivePaths(events)).toEqual({ writes: [], reads: [], runtimeLoads: [] });
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
      bash("cp /tmp/example-rules.md CLAUDE.md"),
      tool("Edit", { file_path: "/home/example/app/.claude/worktrees/side-0000/PROCESS.md" }),
    ];
    expect(ruleFileEdits(events, REPO).map((candidate) => candidate.note ?? candidate.what)).toEqual([
      "Edit /home/example/app/CLAUDE.md",
      "Write /home/example/app/.claude/settings.json",
      "WORKLIST.md",
      "PROCESS.md",
      "CLAUDE.md",
      "CLAUDE.md",
      "Edit /home/example/app/.claude/worktrees/side-0000/PROCESS.md",
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
    expect(ruleFileEdits(events, REPO)).toEqual([]);
  });

  it("leaves out paths outside the repo and its worktrees, and the source of a copy", () => {
    const events = [
      tool("Write", { file_path: "/tmp/example-copy/CLAUDE.md" }),
      tool("Edit", { file_path: "/home/example/.claude/settings.json" }),
      bash("echo x > ~/.claude/example.md"),
      bash("cp CLAUDE.md PROCESS.md /tmp/example-backup/"),
      bash("cd /tmp/example-copy && echo x >> CLAUDE.md"),
    ];
    expect(ruleFileEdits(events, REPO)).toEqual([]);
  });

  it("reads a path within a checkout", () => {
    expect(isRuleFile("WORKLIST.md")).toBe(true);
    expect(isRuleFile(".claude/settings.json")).toBe(true);
    expect(isRuleFile("lib/example.ts")).toBe(false);
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
  const review = (description: string, time: string, prompt = "…") => tool("Agent", { description, prompt }, ORCHESTRATOR, time);
  const commit = (hash: string, time: string, subject: string, extra: Partial<Commit> = {}): Commit => ({
    hash,
    time,
    subject,
    files: ["lib/example.ts"],
    changedLines: 10,
    byClaude: true,
    ...extra,
  });
  const reviewedBy = (results: ReturnType<typeof taskCommitReviews>) =>
    results.map(({ subject, reviews }) => [subject.split(":")[0], reviews.map((each) => each.description)]);

  it("compares commit times in the committer's time zone with UTC event times", () => {
    const events = [
      review("Review ZZ.7 example", "2030-01-02T04:30:00.000Z"),
      review("Review ZZ.8 example", "2030-01-02T05:10:00.000Z"),
    ];
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
    const events = [
      review("Review ZZ.11 and ZZ.14", "2030-01-01T00:00:00.000Z"),
      review("Code review of ZZ.4b", "2030-01-01T00:00:00.000Z"),
    ];
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

  it("counts a review only for the task's next commit, so a reused id starts afresh", () => {
    const events = [review("Review ZZ.3 first round", "2030-01-01T09:00:00.000Z")];
    const commits = [
      commit("b", "2030-01-03T10:00:00Z", "ZZ.3: Used again"),
      commit("a", "2030-01-01T10:00:00Z", "ZZ.3: First use"),
    ];
    expect(taskCommitReviews(events, commits).map(({ hash, reviewed }) => [hash, reviewed])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("takes only the word review: a preview isn't one", () => {
    const events = [review("Preview ZZ.5 in the browser", "2030-01-01T09:00:00.000Z")];
    expect(taskCommitReviews(events, [commit("a", "2030-01-01T10:00:00Z", "ZZ.5: An example")])[0].reviewed).toBe(false);
  });

  it("reads several task ids from one commit, and skips commits that are neither a task's nor Claude's", () => {
    const commits = [
      commit("a", "2030-01-01T01:00:00Z", "ZZ.5, ZZ.6: Two at once"),
      commit("b", "2030-01-01T01:00:01Z", "An example by hand", { byClaude: false }),
    ];
    expect(taskCommitReviews([], commits).map((each) => each.tasks)).toEqual([["ZZ.5", "ZZ.6"]]);
  });

  it("matches a review whose prompt names one task when its description names none", () => {
    const events = [
      review(
        "Code review of the example",
        "2030-01-01T09:00:00.000Z",
        "Independently review the ZZ.9 change. ZZ.9 adds a ledger.",
      ),
      review("Review ZZ.3 example", "2030-01-01T09:00:01.000Z", "ZZ.9 is running at the same time; leave its files alone."),
      review("Code review of the other", "2030-01-01T09:00:02.000Z", "Review ZZ.4; ZZ.5 runs beside it."),
    ];
    const commits = [
      commit("a", "2030-01-01T10:00:00Z", "ZZ.9: An example"),
      commit("b", "2030-01-01T10:00:01Z", "ZZ.3: Another"),
      commit("c", "2030-01-01T10:00:02Z", "ZZ.4: A third"),
      commit("d", "2030-01-01T10:00:03Z", "ZZ.5: A fourth"),
    ];
    expect(reviewedBy(taskCommitReviews(events, commits))).toEqual([
      ["ZZ.9", ["Code review of the example"]],
      ["ZZ.3", ["Review ZZ.3 example"]],
      ["ZZ.4", []],
      ["ZZ.5", []],
    ]);
  });

  it("matches a review by a design letter, for the first commit of that letter after it", () => {
    const events = [
      review("Code review of design A build", "2030-01-01T09:00:00.000Z"),
      review("Code review of B's fix round", "2030-01-01T09:00:01.000Z"),
    ];
    const commits = [
      commit("a", "2030-01-01T10:00:00Z", "ZZ.B.build: Build example design B"),
      commit("b", "2030-01-01T10:00:01Z", "ZZ.A.build: Build example design A"),
      commit("c", "2030-01-01T10:00:02Z", "ZZ.2: Tidy the example"),
      commit("d", "2030-01-01T10:00:03Z", "ZZ.A.fix: Apply design A's fixes"),
      commit("e", "2030-01-01T10:00:04Z", "ZZ.B.fix: Apply design B's fixes"),
    ];
    expect(reviewedBy(taskCommitReviews(events, commits))).toEqual([
      ["ZZ.B.build", ["Code review of B's fix round"]],
      ["ZZ.A.build", ["Code review of design A build"]],
      ["ZZ.2", []],
      ["ZZ.A.fix", []],
      ["ZZ.B.fix", []],
    ]);
  });

  it("takes a design letter only after design or variant, or as a possessive after the first word", () => {
    const events = [
      review("A quick review of the ledger", "2030-01-01T09:00:00.000Z"),
      review("A's code review", "2030-01-01T09:00:01.000Z"),
      review("Code review of library variant C", "2030-01-01T09:00:02.000Z"),
    ];
    const commits = [
      commit("a", "2030-01-01T10:00:00Z", "ZZ.A.build: Build example design A"),
      commit("b", "2030-01-01T10:00:01Z", "ZZ.C.build: Build example variant C"),
    ];
    expect(reviewedBy(taskCommitReviews(events, commits))).toEqual([
      ["ZZ.A.build", []],
      ["ZZ.C.build", ["Code review of library variant C"]],
    ]);
  });

  it("matches by words only within three hours of the review", () => {
    const events = [review("Review the example ledger", "2030-01-01T09:00:00.000Z")];
    const commits = [commit("a", "2030-01-01T13:00:00Z", "ZZ.1: Add the example ledger")];
    expect(taskCommitReviews(events, commits)[0].reviewed).toBe(false);
  });

  it("takes a file name as one word, which may match on its own", () => {
    const events = [
      review("Review ARCHITECTURE.md wording", "2030-01-01T09:00:00.000Z"),
      review("Review CLAUDE.md md", "2030-01-01T11:00:00.000Z"),
    ];
    const commits = [
      commit("a", "2030-01-01T10:00:00Z", "ZZ.1: Shorten ARCHITECTURE.md"),
      commit("b", "2030-01-01T12:00:00Z", "ZZ.2: Point DESIGN.md at the md files"),
    ];
    expect(reviewedBy(taskCommitReviews(events, commits))).toEqual([
      ["ZZ.1", ["Review ARCHITECTURE.md wording"]],
      ["ZZ.2", []],
    ]);
  });

  it("matches a review by two words of the title, for the first such commit and those right after it", () => {
    const events = [review("Review the three example specs", "2030-01-01T09:00:00.000Z")];
    const commits = [
      commit("a", "2030-01-01T10:00:00Z", "ZZ.1: Add a ledger"),
      commit("b", "2030-01-01T10:00:01Z", "ZZ.2: Add the example spec for one"),
      commit("c", "2030-01-01T10:00:02Z", "ZZ.3: Add the example specs for two and three"),
      commit("d", "2030-01-01T10:00:03Z", "ZZ.4: Tidy the ledger"),
      commit("e", "2030-01-01T10:00:04Z", "ZZ.5: Compare the example specs"),
    ];
    expect(taskCommitReviews(events, commits).map(({ reviewed }) => reviewed)).toEqual([false, true, true, false, false]);
  });

  it("lists Claude's own commits but WORKLIST.md-only ones, with changed lines and whether they need a review", () => {
    const events = [review("Review the example rule wording", "2030-01-01T09:00:00.000Z")];
    const commits = [
      commit("a", "2030-01-01T10:00:00Z", "Example rule wording in the rules", { files: ["CLAUDE.md"], changedLines: 4 }),
      commit("b", "2030-01-01T10:00:01Z", "Update work list statuses", { files: ["WORKLIST.md"] }),
      commit("c", "2030-01-01T10:00:02Z", "ZZ.1: An example", { changedLines: 120 }),
    ];
    expect(
      taskCommitReviews(events, commits).map(({ hash, kind, changedLines, needsReview, reviewed }) => [
        hash,
        kind,
        changedLines,
        needsReview,
        reviewed,
      ]),
    ).toEqual([
      ["a", "own", 4, false, true],
      ["c", "task", 120, true, false],
    ]);
  });

  it("reads each task id a text names whole", () => {
    expect(namedTasks("Review ZZ.1 example")).toEqual(["ZZ.1"]);
    expect(namedTasks("Review ZZ.1.")).toEqual(["ZZ.1"]);
    expect(namedTasks("Review ZZ.11 and ZZ.4b")).toEqual(["ZZ.11", "ZZ.4b"]);
    expect(namedTasks("Review ZZ.6.A")).toEqual(["ZZ.6.A"]);
  });
});

describe("taskAgentPeak", () => {
  const agentEvent = (
    agent: string,
    description: string,
    time: string,
    kind: Event["kind"] = "tool",
    resultTime?: string,
  ): Event => ({
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

describe("zshErrors", () => {
  const failed = (command: string, result: string, time: string) => ({
    ...bash(command, ORCHESTRATOR, time),
    result,
    isError: true,
  });

  it("finds zsh's = expansion and no-match errors after the rule, apart, and nothing else", () => {
    const events = [
      failed("echo =====", "Exit code 1\n(eval):1: ===== not found", "2030-01-01T09:00:00.000Z"),
      failed("echo =====", "Exit code 1\n(eval):1: ===== not found", "2030-01-01T11:00:00.000Z"),
      failed(
        "grep -rn x --include=*.ts .",
        "Exit code 1\n(eval):1: no matches found: --include=*.ts",
        "2030-01-01T11:00:01.000Z",
      ),
      failed("ls src", "Exit code 1\nls: src: No such file or directory", "2030-01-01T11:00:02.000Z"),
      failed("example-tool", "Exit code 127\n(eval):1: command not found: example-tool", "2030-01-01T11:00:03.000Z"),
    ];
    const found = zshErrors(events, "2030-01-01T10:00:00.000Z");
    expect(notes(found.equalsExpansion)).toEqual(["(eval):1: ===== not found"]);
    expect(notes(found.noMatches)).toEqual(["(eval):1: no matches found: --include=*.ts"]);
  });

  it("finds none without a rule", () => {
    const events = [failed("echo =====", "(eval):1: ===== not found", "2030-01-01T11:00:00.000Z")];
    expect(zshErrors(events, undefined)).toEqual({ equalsExpansion: [], noMatches: [] });
  });
});

describe("loopPasses", () => {
  const at = (minute: number) => `2030-01-01T10:${String(minute).padStart(2, "0")}:00.000Z`;
  const wake = (minute: number) => tool("ScheduleWakeup", { delaySeconds: 1800 }, ORCHESTRATOR, at(minute));

  it("splits a session at each ScheduleWakeup, and says which rule files each pass read", () => {
    const events = [
      tool("Read", { file_path: "/home/example/app/CLAUDE.md" }, ORCHESTRATOR, at(0)),
      bash("cat PROCESS.md WORKLIST.md", ORCHESTRATOR, at(1)),
      wake(2),
      bash("sed -n 1,40p WORKLIST.md", ORCHESTRATOR, at(30)),
      bash("cat CLAUDE.md", TASK_AGENT, at(31)),
      bash("grep -n Status PROCESS.md", ORCHESTRATOR, at(32)),
      wake(33),
      bash("git status", ORCHESTRATOR, at(40)),
    ];
    expect(loopPasses(events).map(({ start, end, read }) => ({ start, end, read }))).toEqual([
      { start: at(0), end: at(2), read: { "CLAUDE.md": true, "PROCESS.md": true, "WORKLIST.md": true } },
      { start: at(30), end: at(33), read: { "CLAUDE.md": false, "PROCESS.md": false, "WORKLIST.md": true } },
    ]);
  });
});

describe("agentPromptsMissingRules", () => {
  const start = (description: string, prompt: string) => tool("Agent", { description, prompt });
  const fullPrompt = [
    "Read CLAUDE.md, DESIGN.md and src/manual/README.md.",
    "Docs describe what exists: no decision lists, plans or status.",
    "- **Files:** `lib/**`",
    "- **Done when:** the tests pass.",
    "Report back with the files you changed, how you checked them, and anything unresolved.",
  ].join("\n");

  it("lists the standing rules a task agent's prompt leaves out, after the rules came in", () => {
    const events = [
      start("ZZ.1 example task", fullPrompt),
      start("ZZ.2 another task", "Do ZZ.2. Read CLAUDE.md first.\n- **Files:** `lib/**`"),
      start("Review ZZ.1 example", "Review the change."),
      tool("Agent", { description: "ZZ.0 before the rules", prompt: "Do ZZ.0." }, ORCHESTRATOR, "2030-01-01T08:00:00.000Z"),
    ];
    expect(agentPromptsMissingRules(events, "2030-01-01T09:00:00.000Z").map(({ what, note }) => [what, note])).toEqual([
      [
        "ZZ.2 another task",
        "missing: the task's Done when, the design doc, src/manual/README.md, report back with anything unresolved, docs describe what exists",
      ],
    ]);
  });

  it("takes 'the design doc' for DESIGN.md, and reads Task calls too", () => {
    const prompt = fullPrompt.replace("DESIGN.md", "the design doc");
    const events = [
      tool("Task", { description: "ZZ.3 example task", prompt }),
      tool("Task", { description: "ZZ.4 example task", prompt: "Do ZZ.4." }),
    ];
    expect(agentPromptsMissingRules(events, "2030-01-01T09:00:00.000Z").map(({ what }) => what)).toEqual(["ZZ.4 example task"]);
  });

  it("judges no prompt without the rules", () => {
    expect(agentPromptsMissingRules([start("ZZ.2 another task", "Do ZZ.2.")], undefined)).toEqual([]);
  });
});

describe("editsOutsideTaskFiles", () => {
  const worklist = (files: string) =>
    `# Work\n\n### ZZ.1 — An example\n- **Status:** doing\n- **Files:** ${files}\n- **Do:** it\n\n### ZZ.2 — Another\n- **Files:** \`docs/**\`\n`;
  const versions = [
    { time: "2030-01-01T09:00:00.000Z", text: worklist("`lib/**`, `README.md`") },
    { time: "2030-01-01T10:30:00.000Z", text: worklist("`lib/**`, `README.md`, `scripts/example.ts`") },
    { time: "2030-01-01T12:00:00.000Z", text: worklist("`lib/**`, `README.md`, `scripts/example.ts`, `notes.md`") },
  ];
  const edit = (file: string, time = "2030-01-01T10:00:00.000Z", from: Partial<Event> = TASK_AGENT) =>
    tool("Edit", { file_path: file }, from, time);

  it("counts edits for a task whose Files are a folder named in another doc, and matches nothing", () => {
    const prose = [
      {
        time: "2030-01-01T09:00:00.000Z",
        text: worklist("the gateway folder named in `ARCHITECTURE.md`, its tests,\n  and the `usage` script"),
      },
    ];
    expect(editsOutsideTaskFiles([edit("/home/example/app/server/gateway/x.ts")], prose, REPO)).toEqual({
      skippedWithoutFiles: 0,
      skippedProseFiles: 1,
      outside: [],
    });
  });

  it("finds a task agent's edit outside its Files, as the work list had them then", () => {
    const events = [
      edit("/home/example/app/lib/example.ts"),
      edit("/home/example/app/scripts/example.ts"),
      edit("/home/example/app/notes.md"),
      edit("/home/example/app/notes.md", "2030-01-01T12:30:00.000Z"),
      edit("/home/example/app/.claude/worktrees/side-0000/docs/example.md"),
    ];
    expect(editsOutsideTaskFiles(events, versions, REPO).outside.map(({ what }) => what)).toEqual([
      "Edit /home/example/app/notes.md",
      "Edit /home/example/app/.claude/worktrees/side-0000/docs/example.md",
    ]);
  });

  it("leaves out files outside the repo and other sessions, and counts edits for tasks the work list doesn't have", () => {
    const events = [
      edit("/tmp/example-scratch/notes.md"),
      edit("/home/example/app/notes.md", undefined, ORCHESTRATOR),
      edit("/home/example/app/notes.md", undefined, { ...TASK_AGENT, agent: "a9", who: "subagent: ZZ.9 unknown task" }),
      edit("/home/example/app/notes.md", undefined, REVIEWER),
    ];
    expect(editsOutsideTaskFiles(events, versions, REPO)).toEqual({ skippedWithoutFiles: 1, skippedProseFiles: 0, outside: [] });
  });
});

describe("readOnlyWrites", () => {
  const AUDITOR = { session: "s1", agent: "r2", who: "subagent: ZZ.3 audit: server", cwd: REPO };

  it("finds a reviewer or auditor writing files in the repo or a worktree", () => {
    const auditorPrompt: Event = {
      id: "p",
      time: "2030-01-01T09:00:00.000Z",
      ...AUDITOR,
      kind: "prompt",
      text: "You are an auditor: read-only.",
    };
    const events = [
      tool("Write", { file_path: "/home/example/app/notes.md" }, REVIEWER),
      bash("echo x > lib/example.ts", REVIEWER),
      bash("rm -rf dist", { ...ORCHESTRATOR, session: "s2", who: "session: Repository structure review" }),
      auditorPrompt,
      tool("Edit", { file_path: "/home/example/app/.claude/worktrees/side-0000/lib/example.ts" }, AUDITOR),
    ];
    expect(readOnlyWrites(events, REPO).map(({ who, note, what }) => [who, note ?? what])).toEqual([
      [REVIEWER.who, "Write /home/example/app/notes.md"],
      [REVIEWER.who, "lib/example.ts"],
      ["session: Repository structure review", "dist"],
      [AUDITOR.who, "Edit /home/example/app/.claude/worktrees/side-0000/lib/example.ts"],
    ]);
  });

  it("leaves out writes outside the repo, a task agent's writes and a preview", () => {
    const events = [
      bash("cd /tmp/example-review && cat > probe.ts <<'EOF'\nx\nEOF", REVIEWER),
      bash("echo x > /tmp/example-review/out.txt", REVIEWER),
      bash("npm test > $TMPDIR/out.txt", REVIEWER),
      tool("Write", { file_path: "/home/example/app/lib/example.ts" }, TASK_AGENT),
      tool(
        "Write",
        { file_path: "/home/example/app/lib/example.ts" },
        { ...TASK_AGENT, agent: "a2", who: "subagent: ZZ.2 design review" },
      ),
      tool(
        "Write",
        { file_path: "/home/example/app/lib/example.ts" },
        { ...REVIEWER, agent: "a3", who: "subagent: Preview the example" },
      ),
    ];
    expect(readOnlyWrites(events, REPO)).toEqual([]);
  });
});
