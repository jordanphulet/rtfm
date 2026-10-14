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

## Upkeep

Small fixes that keep the repo healthy.

### UP.14 — Keep wide inline formulas inside the column
- **Status:** todo
- **Depends on:** —
- **Files:** `src/manual/**`, `src/reader/**`, `src/ui/**`, `DESIGN.md`
- **Do:** UP.12's third review found that nothing limits an inline formula's width, and the
  reader's main column doesn't clip overflow: at 375px, 40 subscripts in a row were 923px wide and
  `\Bigg(` ×200 made the page 3,083px wide, so the whole page scrolls sideways. KaTeX breaks
  inline math only after top-level relations and operators. Keep an inline formula wider than the
  measure inside the column (for example its own sideways scroll, as display formulas have, or
  clipping with the source on hover), designed in `src/reader/DESIGN.md`.
- **Done when:** a test and `npm run shot` at phone width show the page's scroll width equal to
  the viewport with a too-wide inline formula, ordinary inline formulas unchanged, and `npm run
  build` and `npm test` pass.

### UP.13 — Bring in the UI design iteration
- **Status:** doing (agent a254561e13310c51d; done, in review by a6bd21566a2e0f95f)
- **Depends on:** —
- **Files:** `src/home/**`, `src/reader/**`, `src/ui/**`, `index.html`, `package.json`,
  `package-lock.json`, `DESIGN.md`, `ARCHITECTURE.md`, `research/ui-references.md`
- **Do:** port the UI changes the user made and approved in the session "UI design iteration",
  parked uncommitted in the worktree `.claude/worktrees/repo-agent-behavior-283c77` (branch
  `claude/ui-design-iteration-12464b`, at a4c2d64). Read them there without changing that
  worktree: `git -C <path> diff a4c2d64` for modified and deleted files, plus its untracked files
  `research/ui-references.md`, `src/home/Greeting.tsx`, `src/home/Greeting.css`,
  `src/home/Wordmark.tsx` and `src/ui/Icon.tsx`. Bring them into your worktree as they are,
  reconciling with what `main` has gained since a4c2d64. The changes:
  - Reader: a Library bar with a books icon at the top of the contents, and the same icon in the
    compact header; the contents' expanded outline no longer repeats the section's own title, and
    a section with no headings doesn't expand.
  - Landing page: an "rtfm" wordmark in Space Mono in place of the "Library" title, with an intro
    under it; "Start a new manual" is a button with a plus icon; a row's Delete is a trash icon
    with a hidden label and a tooltip.
  - Librarian panel: no visible header or message count; live status in the composer's readout;
    tighter composer padding; Esc leaves the field; a librarian greeting with three icon cues in
    place of the empty state.
  - Icons: Lucide (`lucide-react` 1.49.0, pinned) through a shared `Icon` in `src/ui`, with rules
    in `DESIGN.md` › Icons; `@fontsource/space-mono` 5.3.0 pinned for the wordmark.
  - The tab title is "rtfm".
  - Docs: `DESIGN.md`, `src/home/DESIGN.md`, `src/reader/DESIGN.md`, `src/ui/README.md` and
    `ARCHITECTURE.md` describe it; `research/ui-references.md` is the dated reference study behind
    the icon rules.
  Don't redesign: fix only what review or the checks find.
- **Done when:** the landing page and reader match the above; `npm run build` and `npm test`
  pass; `npm run shot` differs from `main`'s shots only in the landing page's states and the
  reader's Library icon.

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
