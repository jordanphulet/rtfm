---
name: rule-audit
description: Audits which of this repo's written rules agents actually break and what each break costs, ranks the rules by frequency and consequence, and proposes tasks that turn the top ones into code. Use when asked to "run the rule audit". Read-only; it changes no files.
---

# The rule audit

You are an **auditor** (`PROCESS.md` › Roles): you change no files, run no git command that
changes anything, and end with a report in this session. A task you propose becomes work only
when the orchestrator adds it to `WORKLIST.md`.

## What stays private

- **The transcripts are the user's private record.** Read them only through the audit's output,
  which redacts everything it writes. Never read the raw `.jsonl` files, and never use a tool that
  reads sessions (searching session transcripts, listing a session's events and the like): both
  skip the redaction. Never copy transcript content into the repo. The proposed tasks will go
  into `WORKLIST.md`, so they hold counts, times, session titles and descriptions of what
  happened, never quotes.
- **Never print a credential value.** `credentials.json` lists every key- or secret-shaped value
  the audit found: read its counts and each finding's `shape` and redacted `context`, which say
  where a credential showed and what kind it was. If anything secret-shaped shows unredacted
  anywhere, report where it was, redacted, and don't repeat it.
- **Never read `.env.local`** (`CLAUDE.md` › Shell).
- **The audit's output stays outside the repo.** Never give `--out` a folder inside it. Write
  scratch files only to your scratchpad or the system's temporary folder.

## Rank from the evidence

`WORKLIST.md`, `research/` and the git history may hold an earlier audit's conclusions, or tasks
built on them. They are not evidence. Rank from the rules and the transcripts, and compare with
planned work only once the ranking is done (step 6).

## 1. Collect the rules

List every written rule, each with its text, where it lives, when it appeared (commit and time),
what prompted it, and whether it later changed or was removed. Read every history from `main`,
not from `HEAD`, which in a worktree may be behind it. Rules live in:

- **The rule files and the docs:** `CLAUDE.md`, `PROCESS.md`, `OPERATING.md`, `ARCHITECTURE.md`
  (its cross-cutting rules), the design docs and the folder READMEs. Their history, newest first:

  ```sh
  git log main -p --format='%n### %h %cI %s' -- CLAUDE.md PROCESS.md OPERATING.md ARCHITECTURE.md '*DESIGN.md' '*README.md'
  ```

  It is long: narrow it to one file (`-- <file>`), or to when a rule's words appeared
  (`-S '<words of the rule>'`). The audit's `rule-file-commits.json` lists the commits to
  `CLAUDE.md` and `PROCESS.md`, with the first 30 changed lines of each.
- **The phase rules:** each phase in `WORKLIST.md` has a "Rules for this phase" block. A finished
  phase is removed from the file, so its rules live only in the file's history: read the blocks
  as they were added and removed in `git log main -p -- WORKLIST.md`.
- **The "Rules" blocks in agent prompts:** an orchestrator's prompt to a task agent carries one.
  In `events.json` these are the `Agent` tool calls' `input.prompt`, and the `prompt` events (a
  subagent's first message and each later one). A rule given only in prompts binds only the agents
  that got it.
- **The user's corrections:** `user-messages.json` has every message the user typed. Read all of
  them. A correction (stop that, don't do that, why did this happen, undo it) is a rule whether or
  not it was written down afterwards; note whether and when it was.
- **Review findings:** a review agent's report is its `SubagentHandback` call (`input.message`),
  and the orchestrator's notes back to a task agent are its `SendMessage` calls. A finding that
  recurs across reviews is a rule that keeps breaking.

**What prompted a rule:** the commit's subject, and the events in the hour or so before the
commit: the user's messages and what the sessions were doing. A rule usually follows an incident;
find it, and what it cost.

## 2. Run the audit and read every candidate

In a top-level session, leave this session out, so the audit doesn't audit itself:

```sh
npm run audit -- --exclude-session "$CLAUDE_CODE_SESSION_ID"
```

- First check that `CLAUDE_CODE_SESSION_ID` is set (`echo "$CLAUDE_CODE_SESSION_ID"`): if it is
  empty, the flag excludes nothing.
- The last line of the output gives how many transcripts were read. Check that it dropped by this
  session's own transcripts, its own and its subagents':
  `find ~/.claude/projects -path "*$CLAUDE_CODE_SESSION_ID*" -name '*.jsonl' | wc -l`.
- **In a subagent,** `CLAUDE_CODE_SESSION_ID` is the id of the session that started it, so leave
  the flag off: `npm run audit`. Then find your own `agent` id by your description in recipe 2
  below, and set aside the events that carry it. The candidate files carry no agent id: there,
  set aside those with your `session` and `who` from your first event on.

The audit writes a new temporary folder and names it on its last line. Below, `$AUDIT_DIR` stands
for that folder: set it at the start of each command (`AUDIT_DIR=<the folder>; …`), since shell
variables don't carry from one tool call to the next. `scripts/audit/README.md` says what each
file holds, and what each detector counts and leaves out.

Read **every** candidate in every file in its context: the events of the same session and agent
around its time. A candidate is a match, not a verdict. Check it against the rule's exact wording
and its exceptions, and drop the false positives, keeping a count per file with the reasons.

Then check the rules from step 1 that no detector covers, by searching `events.json` and the git
history for them. A rule with no detector can still break most often.

`events.json` has one event per user message, prompt, assistant text and tool call, oldest first.
A subagent's events carry the `session` of the session that started it, and their own `agent`.

```sh
# 1. One session's events in a time window, with `what` and `result` cut to 300 characters
jq -c --arg session <session id> --arg from 2026-10-11T17:00 --arg to 2026-10-11T18:00 '.[]
  | select(.session == $session and .time >= $from and .time <= $to)
  | {time, who, agent, kind, tool,
     what: ((.text // .input.command // .input.file_path // .input.description // .input.message // "")
       | tostring | .[0:300]),
     result: ((.result // "")[0:300])}' "$AUDIT_DIR/events.json"

# 2. Every session and subagent, with its session id, agent id and first and last event
jq -r 'group_by([.session, .agent]) | map({session: .[0].session, agent: (.[0].agent // "-"),
  who: .[0].who, first: .[0].time, last: .[-1].time}) | sort_by(.first)[]
  | "\(.first)  \(.last)  \(.session)  \(.agent)  \(.who)"' "$AUDIT_DIR/events.json"

# 3. The agents each session started, with their descriptions
jq -c '.[] | select(.kind == "tool" and .tool == "Agent")
  | {time, session, who, description: .input.description}' "$AUDIT_DIR/events.json"

# 4. The tool calls of one session or subagent that name CLAUDE.md or PROCESS.md
#    (agent "" for the session itself); keep those that read the file
jq -r --arg session <session id> --arg agent <agent id> '.[]
  | select(.session == $session and (.agent // "") == $agent and .kind == "tool")
  | select((.tool == "Read" and (.input.file_path // "" | test("(CLAUDE|PROCESS)\\.md$")))
      or (.tool == "Bash" and (.input.command // "" | test("(CLAUDE|PROCESS)\\.md"))))
  | "\(.time)  \(.tool)  \(.input.file_path // .input.command | .[0:120])"' "$AUDIT_DIR/events.json"
```

## 3. Judge each break

For each confirmed break:

- **The rule in force at the time.** The rule file as it was on `main` then: find the last commit
  to it before the break with `git log main -1 --before=<time> --format='%h %cI' -- <file>`, and
  read it with `git show <commit>:<file>`. Also the phase rules then, and what the agent's own
  prompt said.
- **Whether the agent could have known it.** A session reads `CLAUDE.md` when it starts, and the
  rule files again whenever it reads them (`PROCESS.md`'s loop re-reads them each pass). So it
  last saw a rule at its latest `Read` or `cat` of that file before the break (recipe 4), or at
  its start (its first event, recipe 2), whichever is later. Note what it read: part of a file, or
  a worktree's copy rather than `main`'s. What a subagent was given at its start beyond its prompt
  can't be seen in the audit's output, which strips system reminders; if a judgment rests on it,
  say it is an assumption. An agent already running never sees a rule added after it last read
  the file, unless a message tells it.
- **A worktree's base.** A session in a worktree reads the worktree's files, as of the commit its
  branch was based on. `worktrees-behind.json` says how far each worktree is behind `main` now,
  not when the break happened. To date it then, take the branch from `git worktree list`, the
  time of its base with `git show -s --format=%cI $(git merge-base main <branch>)`, and the times
  the branch moved with `git reflog show --date=iso <branch>`, and compare them with the agent's
  first event.

Record each break as one of:

- **knowing:** the rule was in what the agent last read, or in its prompt;
- **unknowing:** the rule was on `main`, but not in what the agent had read;
- **before the rule:** there was no rule yet. This is not a break; it may be the incident that
  prompted the rule.

An unknowing break still counts for its rule: the rule was in force, and the cost was real.
`PROCESS.md` › How rules spread is a rule like any other: judge its breaks by its own wording.

## 4. Weigh consequence

For each rule that broke:

- **What each break cost:** the user's tools, money, security, data, rework. Take it from what
  followed the break in the events and the git history. Name a cost only from evidence; when
  nothing followed, say so.
- **The incident that prompted the rule**, and what it cost.
- **Whether it recurred** after the rule was written, how often, and in how many sessions.
- **Whether code already enforces it:** the gateway (`server/gateway/gateway.ts`: the caps, the
  kill switch, the ledger), `server/gateway/sdk-boundary.test.ts` (only the gateway reaches
  Bedrock), the server lock (`server/storage/lock.ts`), and anything else that refuses the wrong
  way. Date when the enforcement landed by the code that does it, not the file's creation:
  `git log main -S '<symbol>' --format='%h %cI %s' -- <file>`. Then say whether breaks stopped
  after that.

## 5. Rank

Rank the rules by **frequency** (confirmed breaks, how many sessions and agents they span, whether
they recurred after the rule was written) and **consequence** (step 4). Say how you weighed
frequency against consequence, and weigh every rule the same way. A rule that broke often and one
that broke at a real cost both rank above one that only could break.

Recommend which rules to turn into code first, and how:

- Prefer **the repo's own scripts and tests** (a script that does the step correctly, a test that
  fails on the wrong code) over harness hooks. A hook fits where nothing in the repo runs at the
  moment the rule applies.
- Prefer rules that **actually break** over ones that only could.
- Say what the code would enforce, and what stays a written rule.

Name the **rules that contradict each other**: two files, or a file and a prompt, asking for things
that can't both hold. Say which side each break followed.

## 6. Report

Report in this session, not in a file:

1. **Sources:** the audit's folder, how many transcripts, sessions and subagents, the time span,
   and what was left out.
2. **The ranking:** a table, one row per rule that broke: rank, the rule and where it lives,
   confirmed breaks (and the sessions and agents they span), knowing / unknowing, cost, whether
   code enforces it, and the recommendation. Then how frequency was weighed against consequence.
3. **The evidence for the top rules:** when and where each broke (time, session title or agent
   description), what it cost, and what prompted the rule.
4. **False positives,** per audit file, with the reasons, so the detectors can improve.
5. **Contradictions** between rules.
6. **Proposed tasks** for the orchestrator. Now read `WORKLIST.md` for planned work: say which top
   rules a planned task already covers, and propose no duplicates. Write each task in its format:

   ```markdown
   ### <ID> — <title>
   - **Status:** todo
   - **Depends on:** <task ids, or —>
   - **Files:** <what it may change; new files marked "(new)", and `CLAUDE.md`, `PROCESS.md`,
     `.claude/settings.json` and hooks marked "(the user approves)">
   - **Do:** <what to build>
   - **Done when:** <`npm run build` and `npm test` pass, and how to see that the rule now holds>
   ```

   Tasks that share a goal go into a phase, as `WORKLIST.md`'s do: a short intro ending in "When
   this phase is done:", and a "Rules for this phase" block. Propose changes to the audit's
   detectors (`scripts/audit/`) too, where a false positive or a missed break shows one.
