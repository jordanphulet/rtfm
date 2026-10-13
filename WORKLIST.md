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
- **Status:** todo
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
- **Status:** doing (agent a820e5dcd6453a836)
- **Depends on:** IN.11
- **Files:** `server/gateway/**`, `server/storage/**`, `server/app.ts`, `server/config.ts`,
  `server/usage.ts`, `server/README.md`, `README.md`, `ARCHITECTURE.md`, `infra/access-stack.ts`
  and its test, `infra/app-stack.ts` and its test, `infra/README.md`
- **Do:**
  - The ledger, spending totals and kill switch behind interfaces: the data folder's for `fake`,
    the table `rtfm-usage`'s for `bedrock`, from a laptop too; reserving as one conditional
    transaction.
  - The DynamoDB client for them lives under `server/gateway/**`, listed in
    `gateway/sdk-boundary.test.ts`'s SDK adapters; only `gateway/credentials.ts` reads
    `rtfm-local`'s keys.
  - `rtfm-local` gains read and write on `rtfm-usage` only (`RtfmAccess`, which the user approves
    and deploys); the Web Function's role, the same.
  - `ARCHITECTURE.md` and `README.md` say `RTFM_MODELS` chooses the ledger, and that with Bedrock
    the data folder's lock no longer guards money.
  - Share IN.11's DynamoDB client builder (`dynamoDbClient` in `server/storage/`, pinned, with no
    credential chain) rather than writing a second one.
- **Done when:** both implementations pass one shared suite, two servers with Bedrock share the
  caps in a test against DynamoDB Local, and the docs say so.

### IN.13 — One writer per section across environments
- **Status:** doing (agent a6eb3ca69062c8998)
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

## Waiting on AWS

Work that can't start until the user does something in AWS. Each task stays `blocked` until the
user says its step is done.

### AW.1 — Check the ledger against the AWS bill
- **Status:** blocked (the user compares Bedrock charges in Cost Explorer with `npm run usage`)
- **Depends on:** —
- **Files:** `server/gateway/prices.ts`, `server/README.md`, `server/gateway/README.md`
- **Do:** with the user's figures, correct the Haiku 4.5 prices if they differ, and decide from
  the bill whether a call that doesn't complete should still be charged its full `max_tokens`.
- **Done when:** the price table matches AWS's charges and `server/README.md` says what was
  checked.

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
