# RTFM — Work List

The work still to do, with each task's status. **This file is the source of truth for status.**
`PROCESS.md` says how the orchestrator works through it; finished work is removed.

## Into AWS

Infrastructure as code in `infra/`, a CDK app, in an AWS account that also holds things that
aren't RTFM's.

### Rules for this phase

- **Nothing outside RTFM.** Every role and policy reaches only resources named for RTFM (`rtfm-*`,
  `Rtfm*`) wherever the service allows it, and RTFM's CDK bootstrap uses its own qualifier
  (`rtfm`), so it never touches another project's.
- **RTFM's AWS setup is its own.** RTFM's profiles live in `~/.aws/rtfm/config` and
  `~/.aws/rtfm/credentials`, never in the user's own `~/.aws/config`, which holds work profiles.
  Agents read nothing under `~/.aws` and never `.env.local`, and run AWS only through
  `npm run aws`, `npm run cdk` and `npm run ops`.
- **The user deploys the `RtfmAccess` stack**; the deployer role can't change it.

### IN.5 — Check the budget counts Bedrock
- **Status:** blocked (the user activates the `project` cost allocation tag, both the user-defined
  and the IAM principal one, a day after `rtfm-local` has called Bedrock)
- **Depends on:** IN.2
- **Files:** `infra/access-stack.ts` and its test, `infra/README.md`
- **Do:** with `npm run aws -- ce get-cost-and-usage`, group a day's Bedrock cost (the services
  "Claude Haiku 4.5 (Amazon Bedrock Edition)" and "Amazon Bedrock") by the `project` tag, and
  find whether `rtfm-local`'s calls carry `project=rtfm` and under which tag key. If the budget's
  `user:project` filter misses them, change its filter to the IAM principal tag if AWS Budgets
  accepts it, or propose a tagged application inference profile for the server. A change to
  `access-stack.ts` needs the user's approval and their redeploy from CloudShell.
- **Done when:** Cost Explorer shows RTFM's Bedrock cost under the budget's filter, and
  `infra/README.md` › The budget says how.

### IN.18 — Read the idle cost
- **Status:** blocked (until 2026-10-15, two days after the Web Function's first deploy)
- **Depends on:** IN.10
- **Files:** `research/aws-design.md`
- **Do:** the cost in Cost Explorer since the Web Function's first deploy (2026-10-13), by service
  (Lambda, CloudFront, DynamoDB, CloudWatch), not only by the `project` tag, until IN.5 settles
  what that tag catches; projected to a month.
- **Done when:** the cost is in the doc, and it is under $10 a month or the orchestrator has a task
  to move to the fallback (a streaming function URL through the AWS Lambda Web Adapter).

### AW.4 — Charge an aborted call as AWS does
- **Status:** blocked (until 2026-10-15, when Cost Explorer has 2026-10-13 complete)
- **Depends on:** AW.1
- **Files:** `server/gateway/gateway.ts` and its test, `server/gateway/README.md`, `server/README.md`,
  `README.md`
- **Do:** AW.1 found AWS bills an aborted call its full input and almost none of its output (on
  2026-10-11, two aborted sections were billed at most 6 output tokens between them), while the
  gateway charges every incomplete call its full `max_tokens` of output. Read 2026-10-13's
  complete numbers (two aborts, one of which had sent 1,788 characters): if AWS's `global.` output
  that day is about the ledger's reported 46,494 plus a few tokens, charge an `aborted` call 0
  output tokens; if it's 400–1,000+ higher, charge what the stream delivered (UTF-8 bytes received,
  capped at `max_tokens`). Either way it stays `estimated`; a `failed` call keeps its full
  `max_tokens`; the reservation keeps the worst case, so the caps don't change.
- **Done when:** the ledger's charge for an aborted call matches the bill, the docs say so with the
  evidence, and `npm test` passes.

## A public repository

RTFM's history, scrubbed, published as the public GitHub repository `jordanphulet/rtfm`.

### GH.1 — Scrub the history and publish it
- **Status:** doing (the orchestrator; descriptions in review by a50258c535962020d)
- **Depends on:** —
- **Files:** `PROCESS.md`, `README.md`
- **Do:** the orchestrator does this itself, step by step, with the user's OK at each outward step,
  while no task is running, every task branch is merged, and no worktree is mid-task.
  - **What the user decided to scrub:**
    - Every commit's author and committer email, the user's work address, becomes
      `1161666+jordanphulet@users.noreply.github.com`. It appears in no file or message.
    - The 16 images under `docs/inspo/` (`*.png`, `*.jpg`) leave every commit. They are already
      gone from `main` (08db542), so `main`'s final tree must come out identical.
    - The AWS account id stays, by the user's choice.
  - **The license** is MIT (UP.15). The user chose not to change GitHub's email settings.
  - **Backup:** a full mirror clone is at `/Users/jordan/projects/rtfm-backup-2026-10-14.git`
    (`main` at 92c88c9). Make a fresh one of the `main` of the day before rewriting.
  - **Descriptions** (the user's choice): the 375 non-merge commits with only a subject get a
    body. The 122 work commits get 1–4 lines drafted from each diff; the 253 work-list commits
    get the task lines `commit-worklist` writes. The drafts live in the orchestrator's
    scratchpad (`history/bodies-*.json`, keyed by the original sha), and a review agent checks
    them against the diffs. The rewrite puts each body between the subject and the trailers
    (`--msg-filter` keyed on `$GIT_COMMIT`); subjects, trailers and merges stay as they are.
  - **Rewrite** in a fresh clone of `main` outside the repo, never in the repo: `git
    filter-branch` with an `--env-filter` for the email and an `--index-filter` running `git rm
    --cached --ignore-unmatch` on the `docs/inspo` images; then delete `refs/original`, expire the
    reflog and `gc`.
  - **Verify:** `git log -p` holds no trace of the work address; every rewritten commit's tree equals its
    original's but for the `docs/inspo` images; every commit that had no body has one; no commit names a `docs/inspo` image and no
    blob of one is left; the commit count is unchanged; `main^{tree}` equals the original's.
  - **Publish**, with the user's explicit OK in chat: `gh repo create jordanphulet/rtfm
    --public`, push `main` only; then clone it fresh from GitHub and re-run the checks.
  - **Switch locally:** keep the current `main` as `pre-rewrite-main`; point `main` at the
    rewritten history; add GitHub as `origin`. Branches from the old history (`claude/*`,
    `worktree-agent-*`) are never pushed, and are removed once merged or no longer needed.
  - **Push from then on:** add to `PROCESS.md` › Review loop › Approved, after the fast-forward,
    the wording the user approves. The draft: "Then `git push origin main`. Push only `main`:
    never `--all`, `--mirror`, a force-push, `pre-rewrite-main`, or a branch from before the
    rewrite." Say in `README.md` where the public repository is.
- **Done when:** the public repository holds the scrubbed `main`, verified from a fresh clone;
  the local `main` tracks it; and `PROCESS.md` carries the push step the user approved.

### GH.2 — A README for the people who visit the public repository
- **Status:** todo (the user reads and approves the new `README.md` in chat before it's committed)
- **Depends on:** —
- **Files:** `README.md`, `OPERATING.md`, `docs/images/*.png`, `ARCHITECTURE.md`, `DESIGN.md`,
  `src/home/DESIGN.md`, `.claude/skills/orchestrate/SKILL.md`, `scripts/licenses.ts`,
  `server/gateway/dynamodb-spending-ledger.ts`, `scripts/doc-references.test.ts`,
  `scripts/task-prompt.ts` and its test, `scripts/hooks/behind-main.ts` and its test,
  `CLAUDE.md`, `PROCESS.md`
- **Do:** proposed by the session "Resume project README strategy" for the user, who puts RTFM on
  a résumé; recruiters land on the public repository.
  - Move everything `README.md` holds about running and operating RTFM into a new `OPERATING.md`,
    keeping its sections and their names (Running it and its subsections, The models, A passcode,
    A library's link, Configuration, The data folder and spending, Logs, The ops tools,
    Screenshots, Where things live, License), and update every `README.md` › <section> reference
    to them (`git grep -n "README.md\` ›"`), in docs, the orchestrate skill and code comments.
    Add `OPERATING.md` to `RULE_FILES` in `scripts/hooks/behind-main.ts`. `CLAUDE.md`,
    `PROCESS.md` and the hook are the user's to approve: give their full diffs.
  - Rewrite `README.md` as a front page read in under a minute:
    - what RTFM is in one line; a screenshot of each page from `npm run shot`, copied into
      `docs/images/`; that it runs at rtfm.moonfetus.com, where each visitor can be given a
      library of their own by a private link (how to ask for one is the user's choice at review);
      never a real link in any file;
    - AI agents wrote every line of code; the user designed and runs the system that makes that
      safe and reliable; commits name the user as author and Claude as co-author;
    - how it's built: the roles and the loop (`PROCESS.md`), a worktree and an independent reviewer
      per task, the rules enforced in code (`commit-task`, the commit-msg hook, the preflight, the
      rule-change hooks, the rule audit), the steps kept for humans (passcode, links, kill switch,
      Authority files), the least-privilege ops tools and `run-aws.ts`;
    - engineering highlights, each linking to the doc that proves it: the spending gateway (one
      conditional DynamoDB transaction, caps per day, month and library, a kill switch, a ledger
      checked against the bill), section leases with fencing, the agent loop with deletes
      confirmed in the app, fake models behind the real gateway, pixel-diffed screenshots and the
      design bar, the CDK stacks under a permissions boundary;
    - the stack in one line, the three commands to run it locally, and `## The docs` with
      `OPERATING.md`.
  - No counts or status that go stale, and no roadmap (`CLAUDE.md` › Code standards).
- **Done when:** `README.md` is that front page; `OPERATING.md` holds the rest, word for word but
  for references; every reference resolves and `npm test` passes; and the user has read the new
  `README.md` in the agent's worktree and approved it in chat, with the `CLAUDE.md`, `PROCESS.md`
  and hook diffs, before the orchestrator commits.

## Waiting on AWS

Work that can't start until the user does something in AWS. Each task stays `blocked` until the
user says its step is done.

### AW.2 — Claude Platform on AWS
- **Status:** blocked (the user signs up, following `research/aws-hosting.md` › "Your steps")
- **Depends on:** LF.1
- **Files:** `server/gateway/**`, `server/config.ts`, `package.json`, `package-lock.json`,
  `ARCHITECTURE.md`, `README.md`, `research/aws-hosting.md`
- **Do:** swap the gateway's client to Claude Platform on AWS as the research describes, keeping
  the credential lockdown and its tests; one live Haiku 4.5 call under $0.01; check whether the
  newer models answer.
- **Done when:** `npm run build` and `npm test` pass, a real call through the gateway succeeds,
  and the research doc's status line says what was adopted.

### AW.3 — Model bake-off
- **Status:** blocked (access to the newer Claude models, through AW.2 or an AWS Support case)
- **Depends on:** AW.2 or the Support case
- **Files:** `research/bedrock-models.md`, `server/config.ts`
- **Do:** run the bake-off in `research/bedrock-models.md` on the models now open to the account,
  under $0.50, and pick each job's model.
- **Done when:** the research doc records the results and status, and `server/config.ts` uses
  the chosen models.
