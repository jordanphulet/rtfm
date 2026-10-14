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
  `npm run aws` and `npm run cdk`.
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

### IN.10 — Measure the deployed app
- **Status:** doing (agent a7748e10835ba97ca)
- **Depends on:** —
- **Files:** `research/aws-design.md`, `infra/README.md`
- **Do:** through `https://rtfm.moonfetus.com`, with `npm run aws` and `curl` (this task's work is
  in AWS), with the throwaway passcode's cookie, and recorded in `research/aws-design.md`:
  - events arriving one by one on a section stream, and the 15s heartbeat through CloudFront;
  - a `POST` with a body (the librarian);
  - a disconnect aborting the run (the server's log shows the abort);
  - the cold start to a section's first byte;
  - how long an idle environment lives (its `SIGTERM` in `/rtfm/app`), over at least a few hours;
  - the credentials: `server.started` logs `credentials: "environment"` (Lambda sets the role's
    keys as environment variables, which a running process can't renew), so check whether any
    environment outlives its keys: look for `ExpiredToken` or `server` errors in `/rtfm/app`, and
    compare environment lifetimes with the keys' expiry if `AWS_CREDENTIAL_EXPIRATION` is
    visible. If environments can outlive their keys, propose the fix as a task.
- **Done when:** each measurement is in the doc, and any problem it found is a proposed task.

### IN.18 — Read the idle cost
- **Status:** blocked (until 2026-10-15, two days after the Web Function's first deploy)
- **Depends on:** IN.10
- **Files:** `research/aws-design.md`
- **Do:** the cost in Cost Explorer since the Web Function's first deploy (2026-10-13), by service
  (Lambda, CloudFront, DynamoDB, CloudWatch), not only by the `project` tag, until IN.5 settles
  what that tag catches; projected to a month.
- **Done when:** the cost is in the doc, and it is under $10 a month or the orchestrator has a task
  to move to the fallback (a streaming function URL through the AWS Lambda Web Adapter).

### IN.12 — One ledger for real spend
- **Status:** doing (agent a820e5dcd6453a836; in review)
- **Depends on:** IN.11
- **Files:** `server/gateway/**`, `server/storage/**`, `server/app.ts`, `server/config.ts`,
  `server/usage.ts`, `server/README.md`, `README.md`, `ARCHITECTURE.md`, `infra/access-stack.ts`
  and its test, `infra/app-stack.ts` and its test, `infra/README.md`
- **Do:**
  - The ledger, spending totals and kill switch behind interfaces: the data folder's for `fake`,
    the table `rtfm-usage`'s for `bedrock`, from a laptop too; reserving as one conditional
    transaction.
  - The adapter that issues their DynamoDB commands lives under `server/gateway/**`, listed in
    `gateway/sdk-boundary.test.ts`'s SDK adapters, and builds its client with IN.11's
    `dynamoDbClient` (`server/storage/`); only `gateway/credentials.ts` reads `rtfm-local`'s keys.
  - `rtfm-local` gains read and write on `rtfm-usage` only (`RtfmAccess`, which the user approves
    and deploys); the Web Function's role, the same.
  - `ARCHITECTURE.md` and `README.md` say `RTFM_MODELS` chooses the ledger, and that with Bedrock
    the data folder's lock no longer guards money.
- **Done when:** both implementations pass one shared suite, two servers with Bedrock share the
  caps in a test against DynamoDB Local, and the docs say so.

### IN.13 — One writer per section across environments
- **Status:** doing (agent a6eb3ca69062c8998; review round 1: the holder fences itself when renewals fail)
- **Depends on:** IN.11
- **Files:** `server/writer/**`, `server/storage/**`, `server/api/**`, `server/app.ts`,
  `server/writer/README.md`
- **Do:** section leases behind an interface in `runs.ts`, in memory locally and on the section
  item in `rtfm-app`; a reader on another environment waits for the stored body, then gets it as
  one `append` and `written`, or `failed`.
  - `deleteManual` deletes only the ids in the manual's `written` set, so a section item holding only
    a lease would be left behind and block a recreated manual's section: delete those too (for
    example by querying `pk = MANUAL#<id>`).
- **Done when:** the shared suite covers two runs racing for one section on both implementations.

### IN.14 — `rtfm-ops` and the ops tools
- **Status:** todo
- **Depends on:** IN.12
- **Files:** `infra/access-stack.ts` and its test, `infra/run-aws.ts` and its test,
  `infra/README.md`, `scripts/**`, `server/usage.ts`, `server/logs.ts`, `package.json`, `README.md`
- **Do:**
  - The role `rtfm-ops` in `RtfmAccess` (the user approves and deploys it, and adds its profile to
    `~/.aws/rtfm/config`): writes only the passcode item in `rtfm-app` and the kill-switch item in
    `rtfm-usage` (`dynamodb:LeadingKeys`), and reads the passcode item. `rtfm-read` gains reading
    `rtfm-usage`.
  - The tools: kill switch on, off and status; `npm run usage` on the central ledger;
    `npm run logs` on CloudWatch; status. Non-interactive, plain text with `--json`, a non-zero
    exit on failure, documented in `README.md`.
- **Done when:** each tool's tests pass offline (DynamoDB Local, a stubbed CLI), the tests cover
  the roles' reach, and `README.md` documents every tool.

### IN.15 — The passcode as a digest
- **Status:** todo
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

### IN.19 — Statuses and deletes see every environment's runs
- **Status:** todo
- **Depends on:** IN.13
- **Files:** `server/writer/**`, `server/storage/**`, `server/api/**`
- **Do:** the manual route's written and writing statuses, and the delete route's refusal while a
  section is being written (`409`), see only the answering environment's runs. Make them also see
  other environments' live leases in the manual's partition, so a section being written elsewhere
  shows as writing and its manual can't be deleted mid-run.
  This comes before the deployed app uses Bedrock: until then a delete answered on one
  environment can abort a paid run on the other.
- **Done when:** the runs' shared suite covers a status and a delete seen from another environment.

### AW.1 — Check the ledger against the AWS bill
- **Status:** todo
- **Depends on:** IN.12
- **Files:** `server/gateway/prices.ts`, `server/README.md`, `server/gateway/README.md`
- **Do:** with `npm run aws -- ce get-cost-and-usage` (as `rtfm-read`), compare what AWS charged
  for Claude Haiku 4.5 with the ledger's totals for the same days (`npm run usage`, central and the
  data folder's), and find from the bill's usage types whether a call that doesn't complete is
  charged its full `max_tokens` or only what it used. Correct `prices.ts` or the gateway's charge
  for an incomplete call if they differ. Read-only in AWS.
- **Done when:** the price table and the charge for an incomplete call match AWS's, and
  `server/README.md` says what was checked and when.

## Upkeep

Small fixes that keep the repo healthy.

### UP.1 — The flaky repair test
- **Status:** doing (agent a6e14796ef423fb5e)
- **Depends on:** —
- **Files:** `src/manual/repair.test.tsx`, `src/manual/**`
- **Do:** `src/manual/repair.test.tsx` failed once in a full `npm test` run during IN.17 (the
  streaming test for `giving-the-dead-a-voice.md`) and passed on its own. Find why (a timer race,
  shared state, load from other test files) by running it repeatedly alone and in the full suite,
  and fix the cause, in the test or the code.
- **Done when:** the cause is named in the report, and the test passes 50 runs in a row alone and
  10 full `npm test` runs in a row.

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

### UP.3 — Commit messages with bodies
- **Status:** todo
- **Depends on:** —
- **Files:** `scripts/commit-task.ts` and its test, `scripts/commit-worklist.ts` and its test,
  `package.json`, `README.md`, `PROCESS.md` (with the user's approval)
- **Do:**
  - `npm run commit-task` requires a body, `--body-file <path>`, and refuses an empty one; the
    body goes between the subject and the trailers.
  - A new `npm run commit-worklist` commits `WORKLIST.md` alone as "Update work list statuses",
    with a body generated from its diff: each task added, removed, or whose status changed (with
    the new status), plus an optional `--reason "<text>"` line. It refuses any other staged or
    changed file in the commit.
  - `PROCESS.md` › Review loop › Approved, step 1, and When the orchestrator does work itself: say
    what the bodies hold (the user approves the wording).
  - `README.md` › Committing task work describes both commands.
- **Done when:** both commands' tests cover the body (required, refused when empty, placed before
  the trailers, generated from a `WORKLIST.md` diff), and the user has approved the `PROCESS.md`
  change.

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
