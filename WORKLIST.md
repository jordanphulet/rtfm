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

## A library per recipient

The user shares RTFM with each job application as its own library: one secret link per library,
each library isolated from the others, starting from the same starter manuals, living until the
user revokes it, and with its activity visible to the user.

### LB.9 — Open a link in the browser
- **Status:** doing (agent a64276ed31ca4654f; done, in review by a458cf2a3c957e8a8)
- **Depends on:** —
- **Files:** `src/App.tsx`, `src/link/**`, `src/passcode/**`, `src/reportErrors.ts` and its test,
  `DESIGN.md`, `README.md`, `scripts/shot.ts`, `scripts/screenshots.ts`, `ARCHITECTURE.md`
- **Do:** the page route `/l` reads the secret from the fragment as it loads, with no button, posts
  it to `/api/link`, and on `204` replaces the address with `/`; on `401` it shows the passcode
  screen with "This link is closed." above the form, as does any API request answered
  `401 { error: "Link closed" }`. The page route `/admin` calls `DELETE /api/link` and opens `/`.
  Design the link page and the closed line in `DESIGN.md`, add their shots to `npm run shot`, and
  name both routes in `README.md` › Where things live.
- **Done when:** component tests cover opening, a closed link, a closed library mid-visit and
  `/admin` from a library, the address keeps no secret after opening, `npm run shot` takes the new
  states, and `npm run build` and `npm test` pass.

### LB.10 — Make, list and revoke libraries with the ops tools
- **Status:** doing (agent aa5395c0f371031a1; done, in review by af29fe840f7bbc050; the user approved its `CLAUDE.md` line)
- **Depends on:** —
- **Merges after:** LB.7, LB.8, LB.9
- **Files:** `scripts/ops/**`, `server/logging/log-reader.ts` and its test, `server/logs.ts`,
  `README.md`, `CLAUDE.md`
- **Do:** `npm run ops -- library create <libraryId> [--label <text>]`, `list`, `show <libraryId>`
  and `revoke <libraryId>`, as `research/libraries.md` › What `npm run ops` gains describes, under
  `README.md` › The ops tools' rules, with `--json`; `create` prints the link once on standard
  output and nowhere else, and keeps no secret; `show` lists the library's manuals with their titles
  and written sections, read as `rtfm-read`. `logs` and `npm run logs` gain `--library <libraryId>`.
  Add to `CLAUDE.md` › Shell that `library create` and `library revoke` are the user's, run in
  their own terminal outside the Claude app, and agents never run them, as for `passcode set`, and
  give its diff in the report. The tests run offline; no agent runs `create` or `revoke` against
  the deployed app.
- **Done when:** the ops tests (DynamoDB Local and the stand-in for the AWS CLI) cover each
  command's text and JSON, a refused id, a revoked library's activity and manuals, and that no
  output but `create`'s holds the link; `npm test` passes; and the user has approved the
  `CLAUDE.md` line.

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
