# The transcript audit

`npm run audit` reads this repo's Claude Code transcripts and writes JSON files to a folder outside
the repo: the events, a scan for credentials, and candidates for rule breaks. A candidate is a
starting point for reading the transcripts, not a verdict.

```sh
npm run audit                                     # into a new temporary folder, printed at the end
npm run audit -- --out ~/rtfm-audit               # into this folder
npm run audit -- --exclude-session <session id>   # without this session, such as the one running it
```

- `--out` must be outside the repo. A relative folder is taken from where `npm run` was started
  (`INIT_CWD`). The audit compares the folder's real path with the repo's, through any symlink,
  both before creating it and after: inside the repo, it writes nothing and exits with 1.
- It creates the folder readable by you alone (`0700`), and its files too (`0600`). It replaces the
  files listed below and leaves anything else in the folder alone.
- `--exclude-session` leaves out the session and its subagents. Entries that a session forked from
  it repeats are kept, in that session.

The transcripts are the user's private record. The audit only reads them, and the tests run on
small synthetic transcripts of their own.

## What it reads

- **The transcripts.** Claude Code keeps a project's transcripts in `~/.claude/projects/<folder>`,
  where the folder is the project's path with every character but letters and digits turned into a
  dash. The audit reads the main checkout's folder and its worktrees' (under `.claude/worktrees/`).
  It finds the main checkout with `git rev-parse --git-common-dir`, so it runs from a worktree too.
- **In each folder:** every session's `<session>.jsonl`, with the session's title (its last
  `custom-title` line), and each of its subagents' `<session>/subagents/agent-<id>.jsonl`, with the
  subagent's description from `agent-<id>.meta.json`.
- **Git:** the commits on `main` with the files and lines each changed, the worktrees, the history
  of `CLAUDE.md`, `PROCESS.md` and `WORKLIST.md`, and when the zsh rule was added to `CLAUDE.md`
  (the first commit adding "zsh") and `PROCESS.md`'s rules on agent prompts (the first commit
  adding "Every agent prompt"), with read-only git commands.

## Events

`events.json` holds one event per message the user typed (`human`), message to a subagent from the
session that started it (`prompt`), assistant text (`text`) and tool call with its result
(`tool`), oldest first. Each says when (`time`, UTC), in which `session`, and `who`: the session's
title, or the subagent's description (with its id in `agent`).

Left out:

- **Repeats from forked sessions.** A forked session copies the entries of the one it came from,
  each with the same `uuid`. Each entry is kept once, in the transcript that started first (or,
  of two that started together, ended first).
- **Harness messages:** task notifications, subagent hand-backs, system reminders, skill bodies,
  summaries of a compacted conversation, and any other message marked meta or with an origin other
  than a human or the session that started a subagent.
- **Thinking**, and images (a result's image shows as `[image]`).

## Credentials

`credentials.json` counts every key- or secret-shaped value in the events, by kind, and lists each
with its `shape` (its length and the kinds of characters in it) and its `context`: the 60
characters on either side, redacted. A value is never shown. Every string the audit writes goes
through the same redaction first, which replaces each value with a marker such as
`[redacted named secret]`.

The kinds:

- **private key:** a `-----BEGIN … PRIVATE KEY-----` block.
- **AWS access key id:** `AKIA` or `ASIA` and 16 or more capitals and digits.
- **Anthropic API key** (`sk-ant-…`) and **API key** (any other `sk-…`).
- **GitHub token:** `ghp_…`, `gho_…`, `ghu_…`, `ghs_…` or `ghr_…`.
- **JWT** (three base64url parts starting `eyJ`) and **bearer token** (what follows `Bearer `).
- **named secret:** a value given to a name ending in TOKEN, SECRET, PASSWORD, PASSWD, API_KEY,
  ACCESS_KEY, ACCESS_KEY_ID or PRIVATE_KEY (in any case), or to a header such as `x-api-key:`.
- **AWS secret access key:** 40 base64 characters with capitals, small letters and digits.
- **base64 token:** 32 or more such characters with no slash.
- **long hex string:** 32 or more small hex digits, but not a 40-digit commit hash.

- A named secret counts as `NAME=value` (as in a shell or an env file) or as a quoted value
  (`name = "value"`, `name: "value"`). Code such as `token = provideToken()` and placeholders such
  as `$AWS_SECRET_ACCESS_KEY`, `<your key>`, `…` and `your-api-key` don't count.
- A base64 run with slashes counts only at an AWS secret's 40 characters, and a `sha512-` integrity
  hash doesn't count, so paths and lockfiles stay readable.
- **Known fakes** are marked (`knownFake`, and `a known fake` in the marker): values that say
  they are fake, as the fake keys and decoys of `server/gateway/`'s tests do (`FAKE`, `TESTSONLY`,
  `MUST-NOT-BE-USED`, `EXAMPLE`, in any case, with or without dashes or underscores).

## Candidates

Each candidate has its `time`, `session`, `who`, `what` (the command, or the tool and its path),
the first lines of the `result`, and a `note` on what in it matched.

A shell command is read as its simple commands, as a reader would pick them out:

- It is split at `;`, `&&`, `||`, pipes, newlines and subshells, never inside quotes, and without
  comments or heredoc bodies, which are text. A here-string (`<<<`), a shift in arithmetic
  (`$((1<<3))`) and a quoted `<<` don't start a heredoc.
- A command substitution (`$(…)` or backticks) stays in its command as the word `$(…)`, and its own
  commands are listed after it, so `git -C $(pwd) commit` is still a commit.
- Leading assignments, shell keywords (`if`, `then`, `else`, `elif`, `while`, `until`, `do`, `!`,
  `{`) and wrappers (`sudo`, `env`, `xargs`, `time`, `timeout <n>`, `nohup` and the like) are
  dropped, so `do git rm $f` is a `git rm`. `command -v pkill` only looks a name up and stays as it
  is.
- The script given to `sh -c`, `bash -c` or `zsh -c` is read as commands too.

| File                       | What                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `user-messages.json`       | Every message the user typed: where corrections live.          |
| `subagent-git-writes.json` | Git commands run by subagents that change the repo.            |
| `process-stops.json`       | Stopping a process by port, pattern, name or another's pid.    |
| `sensitive-paths.json`     | Writes, reads and runtime loads of the sensitive paths.        |
| `rule-file-edits.json`     | Edits to `CLAUDE.md`, `PROCESS.md`, `WORKLIST.md`, `.claude/`. |
| `task-commit-reviews.json` | Task commits and Claude's own commits, with review agents.     |
| `folder-staging.json`      | A session staging or committing whole folders.                 |
| `task-agent-peak.json`     | The most task agents running at once.                          |
| `worktrees-behind.json`    | How far each worktree is behind (and ahead of) `main`.         |
| `tool-errors.json`         | Failed tool calls, grouped by their first line.                |
| `rule-file-commits.json`   | Each commit that changed `CLAUDE.md` or `PROCESS.md`.          |
| `zsh-errors.json`          | zsh's `=` and, apart, "no matches found" errors.               |
| `loop-passes.json`         | Each orchestrator loop pass, and the rule files it read.       |
| `agent-prompts.json`       | Task agent prompts that leave out standing rules.              |
| `task-files.json`          | A task agent's edits outside its task's **Files**, and skips.  |
| `read-only-writes.json`    | A reviewer or auditor writing files in the repo.               |

What each one counts, and what it leaves out:

- **Git writes:** any git subcommand but those that only read, such as `status`, `log`, `diff`,
  `show`, `reflog`, `stash list`, `tag -l`, `branch -a`, `worktree list`, `hash-object` without
  `-w`, and a dry run (`git mv -n`, `git clean -nd`, `git rm --dry-run`).
- **Process stops:** stopping a process by port, pattern or name, or by a pid that didn't come
  from the agent's own launch, which `CLAUDE.md` forbids: `pkill`, `killall`, `fuser -k`,
  `kill-port` (also through `npx`), and `kill` given a pid. Each says where its pids came from
  (`source`): `found by port or pattern` (`pkill -f`, `kill-port`, `fuser -k`, `kill` in a call
  that looks pids up with `lsof`, `ps`, `pgrep` or `fuser`, or a pid such a lookup printed
  earlier), `by name` (`pkill` without `-f`, `killall`) or `unknown` (a pid seen nowhere earlier,
  or from `$(…)`, directly or through a variable assigned from it, that isn't a file written from
  `$!`). `ps -p <pid>` only checks a pid already known, so it isn't a lookup. Any other `kill $VAR`
  is left out, and so are these, first, as the agent's own, whatever else the call does:
  - `kill $PID` after `PID=$!` in the same call;
  - `kill $(cat <file>)`, or `PID=$(cat <file>)` then `kill $PID`, when the same session or
    subagent wrote the file from `$!`;
  - `kill <pid>` when the pid was in its own launch output: what a call that left a process
    running (in the background, or with `&`, `$!` or `nohup`) printed, or what it wrote to its
    output file, read later. Pids printed by a call that also looked pids up count as found by
    port or pattern instead;
  - `kill -0`, which only checks that a process exists.
- **Sensitive paths:** any word of a command, and a tool's `file_path`, `path` or (for Glob)
  `pattern`, split three ways: `writes` (an edit tool, or a command that writes the path, as
  below), `runtimeLoads` (a path given to a script that `node`, `npx`, `npm` and the like run,
  which loads it) and `reads` (any other touch). A search's pattern (`grep '.data/' README.md`),
  what `echo` or `printf` print, and what `--exclude` or `--exclude-dir` leave out don't count, but
  where `echo` prints to does (`echo X >> .env.local`).
- **Which files a call writes:** the Edit, MultiEdit, Write and NotebookEdit tools; and shell
  commands that write a file: a redirect, `sed -i` and `perl -i` (not their script), `tee`, `mv`,
  `rm`, `touch`, `mkdir`, the destination of `cp` or `ln`, and `git mv`, `rm`, `checkout` or
  `restore` without `--staged` or `--cached`. Staging or committing a file doesn't change it. A
  relative path is taken from the event's working folder, as the script's `cd` commands change
  it; after a `cd` to a folder that can't be told (`cd $DIR`), it counts as outside the repo.
- **Rule file edits:** writes to the rule files inside this repo or its worktrees; in a worktree,
  a file's path within the worktree is what counts. The orchestrator edits `WORKLIST.md` by
  design, so only a subagent's edit of it counts.
- **Task commit reviews:** a task commit's subject starts `<ID>: ` or `<ID>, <ID>: `, where an id
  is two or three capitals or digits and dotted parts (`OH.1`, `BE.4b`, `P1.A.spec`). Claude's own
  commits (`kind: "own"`) are the other commits with Claude's co-author line that change more than
  `WORKLIST.md`. Each has its `changedLines`, added and removed, with a pure rename adding none,
  and `needsReview`: more than the 40 that `npm run commit-task -- --no-review` allows.
  Commit times come from `git log` in the committer's time zone, are compared as instants, and are
  written in UTC. A review agent is an Agent call whose description has the word "review" (not
  "preview"). It counts for:
  - each task its description names, at the id's own boundaries (`OH.1` isn't named by `OH.11` or
    `BE.4` by `BE.4b`): the first commit of that task after it, so an id used again doesn't inherit
    an old review;
  - else the one task its prompt names, if it names exactly one, the same way;
  - else the first commit within three hours after it that it matches, and those that directly
    follow that one and match too. It matches by a design letter that is a part of the task id:
    one after "design" or "variant" (`design A`), or a possessive after the first word
    (`Code review of A's fix round` and `P3.A.fix`). Naming none, it matches by two words it
    shares with the commit's title, or one file name (`ARCHITECTURE.md` is one word), small words
    and words such as "review" and "code" aside.
- **Folder staging:** by a session (the orchestrator), not a subagent: `git add` with `-A`, `--all`,
  `-u`, `--update`, `.` or a folder, and `git commit -a`. A path is a folder if it is one on disk,
  from the event's working folder; if it no longer exists, if it ends in `/` or its last part has
  no `.`.
- **Task agent peak:** a task agent is a subagent whose description starts with a task id. It runs
  from each message it is given until its last event before the next one ends (a tool call ends
  when its result comes back); between them it waits.
- **Tool errors:** a failed shell command's first line is its exit code, so the next line joins the
  key. Each group keeps three examples.
- **Rule file commits:** each commit's added and removed lines, up to 30.
- **zsh errors:** after the commit that added the zsh rule to `CLAUDE.md`, a shell command whose
  result has zsh's `(eval):1: ===== not found` (`equalsExpansion`, which the rule is about) or,
  apart, `no matches found: …` (`noMatches`, a glob that matched nothing, which no rule names).
- **Loop passes:** a session that calls `ScheduleWakeup` runs a loop. Each pass is its own events
  (not its subagents') up to and including that call, with whether it read `CLAUDE.md`,
  `PROCESS.md` and `WORKLIST.md` (the Read tool, or `cat`, `head`, `tail`, `sed`, `awk` and the
  like).
- **Agent prompts:** each Agent or Task call whose description starts with a task id, made after
  the commit that brought in `PROCESS.md`'s rules on agent prompts, and which of those standing
  rules its prompt leaves out: the task's **Files** and **Done when**, `CLAUDE.md`, the design doc
  (`DESIGN.md` or "design doc"), `src/manual/README.md`, reporting back anything unresolved, and
  that docs describe what exists.
- **Task files:** an edit tool call by a task agent (its description starts with a task id) on a
  file in the repo or a worktree that its task's **Files** don't cover (`outside`). The **Files**
  are read by `scripts/commit-task.ts` from the task's block in `WORKLIST.md` as committed last
  before the edit, together with the next version, which may have widened them. A **Files** item
  that says "anything" allows every file, and "root config" every file at the root, on any of its
  lines. An edit whose task neither version has is counted in `skippedWithoutFiles`, and one whose
  **Files** name a folder "named in" another doc, which can't be matched, in `skippedProseFiles`.
- **Read-only writes:** a session or subagent whose title or description says "review" or
  "audit" and doesn't start with a task id, or a subagent whose first prompt says "read-only" near
  its start, writing a file in the repo or a worktree (as above). Writing outside the repo, as to a
  scratchpad, is allowed.

## Files

- `audit.ts`: the command: reads, scans, runs the detectors and writes the files.
- `transcripts.ts`: finds the transcript folders and reads sessions and subagents, each entry once.
- `events.ts`: turns transcripts into events.
- `credentials.ts`: the patterns, `scanText`, `redact` and `redactDeep`; `credential-report.ts`
  scans the events.
- `shell.ts`: splits a shell script into simple commands; `git-commands.ts` says which git
  commands write.
- `repo.ts`: the git facts: commits on `main`, worktrees, the rule files' history and
  `WORKLIST.md`'s versions.
- `task-ids.ts`: what a task id looks like, and which ids a text names.
- `file-writes.ts`: which files a tool call writes, and where each is within a checkout.
- `worklist.ts`: a task's **Files** in the versions of `WORKLIST.md` around a given time.
- `detectors/`: one file per detector, each a function of the events, and `candidate.ts`, the
  candidate's shape.
