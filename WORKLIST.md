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

### IN.20 — Claude on Bedrock in the deployed app
- **Status:** doing (agent a7545610be7bdd537)
- **Depends on:** —
- **Files:** `infra/app-stack.ts` and its test, `server/web-function.ts` and its test,
  `server/gateway/credentials.ts` and its test, `server/config.ts` and its test, `server/app.ts`,
  `infra/README.md`, `README.md`, `server/README.md`, `server/gateway/README.md`
- **Do:**
  - The Web Function runs `RTFM_MODELS=bedrock`: `server/web-function.ts` stops refusing it, and
    the revision sets it.
  - The Bedrock client in the Web Function signs with the execution role's credentials, chosen
    explicitly as IN.11's DynamoDB store does (the container endpoint or the environment, with
    whatever IN.10 found about their lifetime); on the laptop, `credentials.ts` still reads only
    `.env.local`.
  - The web role gets `claudeStatements()` (`infra/bedrock.ts`), which the boundary already
    allows, so no `RtfmToolkit` change; it already reaches `rtfm-usage`, so every call reserves
    against the central caps.
  - The docs stop describing the deployed app as fake-models-only.
- **Done when:** `npm test` passes; after the orchestrator's deploy, the smoke check writes one real
  section through `https://rtfm.moonfetus.com` (under $0.01) and `npm run usage` (or the ops tool)
  shows it in `rtfm-usage`.

### IN.22 — See the heartbeat through the edge
- **Status:** todo
- **Depends on:** IN.20
- **Files:** `research/aws-design.md`
- **Do:** through `https://rtfm.moonfetus.com`, `curl -N` a section stream or a librarian reply
  with each line timestamped, and confirm a `: heartbeat` arrives about 15 s into a silence, and
  that a silence before the first event shows nothing until that first heartbeat (the edge holds
  the headers until the first byte, IN.10).
- **Done when:** the doc's Measured section records it.

### IN.24 — Record what the keys' expiry does on the deployed app
- **Status:** todo
- **Depends on:** IN.20 (so environments see real traffic first)
- **Files:** `research/aws-design.md`
- **Do:** IN.21's measurement, read with `npm run ops -- logs` (no other AWS call). Since IN.21's
  deploy, `server.started` logs `credentialsExpireAt=unset` (first seen 2026-10-14T01:40Z):
  Lambda doesn't set `AWS_CREDENTIAL_EXPIRATION`, so only a refused key starts a replacement.
  Record that in `research/aws-design.md` › Measured, and any `server.keys-refused` line since
  then with its error name, the gap to that environment's `server.stopped`, and the next
  `server.started`.
- **Done when:** Measured records whether Lambda sets the expiry and, if any environment was
  refused its keys, what followed; if none was, it says so with the date range read.

### IN.25 — The Web Function can't write the passcode
- **Status:** doing (agent a987d7eec36be8f48; done, in review by ad939a2c4a4374574)
- **Depends on:** —
- **Files:** `infra/app-stack.ts` and its test, `infra/README.md`, `README.md`,
  `infra/access-stack.ts` (the comment only)
- **Do:** the Web Function's role may put, update and delete any item of `rtfm-app`, so it could
  rewrite the passcode's item, which only `rtfm-ops` (the user's `passcode set`) should. Add a
  `Deny` of `PutItem`, `UpdateItem`, `DeleteItem` and `BatchWriteItem` on `rtfm-app` where
  `dynamodb:LeadingKeys` includes `PASSCODE` (`ForAnyValue:StringEquals`), and update what
  `README.md` › A passcode says can write it. Also correct the comment on `opsStatements` in
  `infra/access-stack.ts`: `rtfm-ops` may touch the items of the `KILL_SWITCH` partition in
  `rtfm-usage` and the `PASSCODE` partition in `rtfm-app`, not one item each. The user approved
  this comment change; the template doesn't change.
- **Done when:** the policy evaluator's tests show the role reading the passcode's item and every
  other item as before, and refused each write to the `PASSCODE` partition.

## Upkeep

Small fixes that keep the repo healthy.

### UP.6 — "and its test" across a line break
- **Status:** doing (agent af2120585fde655f7; done, being committed)
- **Depends on:** —
- **Files:** `scripts/commit-task.ts` and its test
- **Do:** `commit-task` reads "`x.ts` and its test" as also naming `x.test.*` only when the words
  sit on one line. When **Files** wraps between "and its" and "test", the test file goes unmatched
  and the commit is refused (IN.14 and UP.5 both hit it). Read the item's text with its line
  breaks and indentation collapsed to single spaces before matching.
- **Done when:** a test shows a **Files** item wrapped inside "and its test" matching the test
  file, and the existing tests pass.

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
