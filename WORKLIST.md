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

### IN.15 — The passcode as a digest
- **Status:** doing (agent afd47823474f3e015)
- **Depends on:** IN.11, IN.14
- **Files:** `server/api/**`, `server/storage/**`, `server/config.ts`, `server/app.ts`,
  `infra/app-stack.ts` and its test, `infra/README.md`, `scripts/**`, `README.md`
- **Do:**
  - The passcode's SHA-256 digest in `rtfm-app`; the cookie holds the digest, compared in constant
    time; `RTFM_PASSCODE` hashed the same way locally. The throwaway passcode of IN.8 goes.
  - The user's `ops` command to set it, which needs a terminal and doesn't echo; agents' smoke
    checks build the cookie from the digest, read with `rtfm-ops`.
  - `README.md` says the digest opens the app: whatever can read the passcode item (`rtfm-ops`,
    the Web Function's role, any role an app stack creates) can.
- **Done when:** the tests show the digest compared in constant time, a rotated digest refusing
  the old cookie, and the set command refusing to run without a terminal; no file or log an agent
  can read holds the passcode.

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
- **Status:** todo
- **Depends on:** IN.10, IN.14, IN.15, IN.19
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

### IN.21 — Replace an environment before its keys run out
- **Status:** doing (agent a93636117612befb0; done, being committed)
- **Depends on:** —
- **Files:** `server/web-function.ts` and its test, `server/config.ts` and its test, `server/app.ts`,
  `server/storage/dynamodb-manual-store.ts` and its test, `server/README.md`,
  `research/aws-design.md`, `server/replacement.ts` and its test,
  `server/storage/dynamodb-testing.ts`, `server/storage/README.md`, `ARCHITECTURE.md`
- **Do:** Lambda gives the Web Function its role's keys as environment variables, which a running
  process can't renew, and nothing bounds an environment's life while requests keep coming less
  than about 5 minutes apart (IN.10).
  - `server.started` logs when the keys expire, from `AWS_CREDENTIAL_EXPIRATION` when Lambda sets
    it (a time, never a key), or that it is unset.
  - When DynamoDB (or, once IN.20 lands, Bedrock) refuses the keys (`ExpiredTokenException`,
    `UnrecognizedClientException`), the Web Function logs it and exits with code 1 once its open
    requests end or after a short bound, so Lambda replaces the environment with fresh keys; when
    the expiry is known, it also exits that way shortly before it.
- **Done when:** tests show the logged expiry or "unset", and the exit on a refused key and before
  a known expiry; after the next deploy, `research/aws-design.md` › Measured records whether Lambda
  sets the expiry and what happens after the exit.

### IN.22 — See the heartbeat through the edge
- **Status:** todo
- **Depends on:** IN.20
- **Files:** `research/aws-design.md`
- **Do:** through `https://rtfm.moonfetus.com`, `curl -N` a section stream or a librarian reply
  with each line timestamped, and confirm a `: heartbeat` arrives about 15 s into a silence, and
  that a silence before the first event shows nothing until that first heartbeat (the edge holds
  the headers until the first byte, IN.10).
- **Done when:** the doc's Measured section records it.

### IN.23 — Close the delete race, and the section route's status
- **Status:** doing (agent a638f795b3a12ff50; approved, wording fixes)
- **Depends on:** IN.19
- **Files:** `server/storage/**`, `server/writer/**`, `server/api/**`
- **Do:** two small gaps IN.19's review found, both documented in `server/api/README.md`:
  - a lease taken between the delete's `409` check and its transaction: condition each section
    item's `Delete` in `deleteManual`'s transaction on `attribute_exists(body) OR leaseExpiresAt <
    :now`, and answer `409` when that cancels it; and say what remains (a lease taken after the
    delete's query, whose run's save then fails after a full paid section);
  - the section route's `statusOf` sees only this environment's runs: use the lease attributes the
    section item's strongly consistent read already returns, so a section written elsewhere shows
    as writing.
- **Done when:** the runs' shared suite covers both on both implementations, and `npm test` passes.

## Upkeep

Small fixes that keep the repo healthy.

### UP.2 — One retry loop, and the kill switch's path with its ledger
- **Status:** todo
- **Depends on:** IN.12, IN.13
- **Files:** `server/storage/**`, `server/gateway/**`, `server/writer/section-writer.test.ts`,
  `server/api/librarian.test.ts`
- **Do:** share the `TransactionConflict` retry loop that `storage/dynamodb-manual-store.ts` and
  `gateway/dynamodb-spending-ledger.ts` each have (about 12 lines), and move `killSwitchPath` from
  `gateway.ts` into `file-spending-ledger.ts`, updating its two test users.
- **Done when:** one retry loop serves both, `killSwitchPath` lives with the data folder's ledger,
  and `npm test` passes.

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
