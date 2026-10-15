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
- **Note:** IN.18 found the `project` tag catches no cost at all on 2026-10-13 and 10-14:
  every cost was untagged.
- **Do:** with `npm run aws -- ce get-cost-and-usage`, group a day's Bedrock cost (the services
  "Claude Haiku 4.5 (Amazon Bedrock Edition)" and "Amazon Bedrock") by the `project` tag, and
  find whether `rtfm-local`'s calls carry `project=rtfm` and under which tag key. If the budget's
  `user:project` filter misses them, change its filter to the IAM principal tag if AWS Budgets
  accepts it, or propose a tagged application inference profile for the server. A change to
  `access-stack.ts` needs the user's approval and their redeploy from CloudShell.
- **Done when:** Cost Explorer shows RTFM's Bedrock cost under the budget's filter, and
  `infra/README.md` › The budget says how.

## A public repository

RTFM's history, scrubbed, published as the public GitHub repository `jordanphulet/rtfm`.

### GH.1 — Scrub the history and publish it
- **Status:** doing (the orchestrator; rewrite verified in a clone; waits for GH.2, as the user chose)
- **Depends on:** GH.2 (the README split is undone before publishing)
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
  - **Push from then on**, only when the user asks (the user's choice): add to `PROCESS.md` the
    wording the user approves. The draft: "The orchestrator pushes `main` to `origin` only when
    the user asks in chat: `git push origin main`, never `--all`, `--mirror`, a force-push,
    `pre-rewrite-main`, or a branch from before the rewrite." Say in `README.md` where the public
    repository is.
- **Done when:** the public repository holds the scrubbed `main`, verified from a fresh clone;
  the local `main` tracks it; and `PROCESS.md` carries the push step the user approved.

### GH.2 — Undo the README split
- **Status:** doing (agent a63eb071be701ec7c; done, being committed; the user approved reverting CLAUDE.md, PROCESS.md and the hook)
- **Depends on:** —
- **Files:** `README.md`, `OPERATING.md`, `ARCHITECTURE.md`, `DESIGN.md`, `CLAUDE.md`, `PROCESS.md`,
  `.claude/skills/orchestrate/SKILL.md`, `.claude/skills/rule-audit/SKILL.md`, `scripts/**`,
  `server/**`, `src/**`, `infra/README.md`, `research/libraries.md`
- **Do:** the user decided to keep `README.md` as the operating manual and drop the new front page.
  Commit f879260 moved README's operating sections into `OPERATING.md` and pointed every reference
  there. Undo it: delete `OPERATING.md` and return every file f879260 changed to its content before
  it (`git show f879260^:<file>`), except for what landed since. AW.4 (c8994d7) added a sentence
  to `OPERATING.md` › `npm run usage` about how aborted and failed calls are charged: carry it into
  `README.md`'s same section. The user approved reverting `CLAUDE.md`, `PROCESS.md` and the
  rule-change hook to their content before f879260: give their diffs, which must equal that.
- **Done when:** no `OPERATING.md` and no reference to it remain; `README.md` holds the operating
  sections with AW.4's sentence; `CLAUDE.md`, `PROCESS.md` and `scripts/hooks/behind-main.ts` equal
  their f879260^ content; and `npm test` passes.

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
