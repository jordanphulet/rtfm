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
- **Git:** the commits on `main`, the worktrees, and the history of `CLAUDE.md` and `PROCESS.md`,
  with read-only git commands.

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
| `process-stops.json`       | Stopping processes the session didn't start.                   |
| `sensitive-paths.json`     | Touches of the data folder, `.env*.local` and `~/.aws`.        |
| `rule-file-edits.json`     | Edits to `CLAUDE.md`, `PROCESS.md`, `WORKLIST.md`, `.claude/`. |
| `task-commit-reviews.json` | Each task commit on `main`, with its review agents.            |
| `folder-staging.json`      | A session staging or committing whole folders.                 |
| `task-agent-peak.json`     | The most task agents running at once.                          |
| `worktrees-behind.json`    | How far each worktree is behind (and ahead of) `main`.         |
| `tool-errors.json`         | Failed tool calls, grouped by their first line.                |
| `rule-file-commits.json`   | Each commit that changed `CLAUDE.md` or `PROCESS.md`.          |

What each one counts, and what it leaves out:

- **Git writes:** any git subcommand but those that only read, such as `status`, `log`, `diff`,
  `show`, `reflog`, `stash list`, `tag -l`, `branch -a`, `worktree list`, `hash-object` without
  `-w`, and a dry run (`git mv -n`, `git clean -nd`, `git rm --dry-run`).
- **Process stops:** `pkill`, `killall`, `fuser -k`, `kill-port` (also through `npx`), and `kill`
  given a literal pid (most likely looked up in an earlier call) or a pid it looks up (`$(…)`,
  backticks, `lsof`, `ps`, `pgrep`, `fuser`). `kill $PID` after `PID=$!` stops the session's own
  process and doesn't count, nor does `kill -0`, which only checks that a process exists.
- **Sensitive paths:** any word of a command, and a tool's `file_path`, `path` or (for Glob)
  `pattern`. A search's pattern (`grep '.data/' README.md`) and what `echo` or `printf` print don't
  count, but where they print to does (`echo X >> .env.local`).
- **Rule file edits:** the Edit, MultiEdit, Write and NotebookEdit tools; and shell commands that
  write a file (a redirect, `sed -i`, `perl -i`, `tee`, `mv`, `cp`, `rm`, `touch`, and `git mv`,
  `rm`, `checkout` or `restore` without `--staged` or `--cached`). Staging or committing a file
  doesn't change it. In a worktree, a file's path within the worktree is what counts. The
  orchestrator edits `WORKLIST.md` by design, so only a subagent's edit of it counts.
- **Task commit reviews:** a task commit's subject starts `<ID>: ` or `<ID>, <ID>: `, where an id
  is two or three capitals or digits and dotted parts (`OH.1`, `BE.4b`, `P1.A.spec`). A review
  agent is an Agent call whose description has the word "review" (not "preview") and names the
  id, at its own boundaries (`OH.1` isn't named by `OH.11` or `BE.4` by `BE.4b`). `reviewed` says
  whether one was started before the commit and after the previous commit for any of the same
  tasks, so an id used again doesn't inherit an old review. Commit times come from `git log` in the
  committer's time zone, are compared as instants, and are written in UTC.
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

## Files

- `audit.ts`: the command: reads, scans, runs the detectors and writes the files.
- `transcripts.ts`: finds the transcript folders and reads sessions and subagents, each entry once.
- `events.ts`: turns transcripts into events.
- `credentials.ts`: the patterns, `scanText`, `redact` and `redactDeep`; `credential-report.ts`
  scans the events.
- `shell.ts`: splits a shell script into simple commands; `git-commands.ts` says which git
  commands write.
- `repo.ts`: the git facts: commits on `main`, worktrees, and the rule files' history.
- `detectors/`: one file per detector, each a function of the events, and `candidate.ts`, the
  candidate's shape.
