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

### IN.7 — Let `rtfm-read` see a Web Function
- **Status:** doing (agent ac91ad0f4c2110ce8)
- **Depends on:** IN.4
- **Files:** `infra/access-stack.ts` and its test, `infra/README.md`, `research/aws-design.md`
- **Do:** `rtfm-read` gains reading the Web Functions `rtfm-*`, their revisions, endpoints and
  resource policy (`lambda:GetWebFunction`, `GetWebFunctionRevision`, `GetWebFunctionEndpoint`,
  `ListWebFunctionEndpoints`, `ListWebFunctionRevisions`, `GetResourcePolicy`), and describing the
  stacks `RtfmEdge*` in us-east-1 too, where the certificate's stack is (`RtfmAccess`, which the
  user approves and deploys). Its log reads already cover `/rtfm/*`. Replace
  `research/aws-design.md` › Build tasks with a pointer to these tasks in `WORKLIST.md`, which
  hold the planned work.
- **Done when:** the tests show `rtfm-read` reads those and changes nothing, `infra/README.md` ›
  The identities says so, and the user has deployed `RtfmAccess`.

### IN.8 — Put the app on a Web Function
- **Status:** todo
- **Depends on:** IN.7
- **Files:** `server/web-function.ts` and its test, `server/main.ts`, `server/app.ts`,
  `server/config.ts` and its test, `server/api/**`, `server/logging/**`, `server/README.md`,
  `README.md`, `infra/app-stack.ts` and its test, `infra/README.md`, `package.json`,
  `package-lock.json`, `scripts/**`, `vite.config.ts`, `ARCHITECTURE.md`
- **Do:**
  - An entry for the Web Function, `server/web-function.ts`: listens on
    `AWS_LAMBDA_HTTP_ENDPOINT`; the fake models only; a throwaway data folder in `/tmp` that each
    environment seeds; logs to standard output; serves the built app (`dist/`); answers only the
    origin `https://rtfm.moonfetus.com` (allowed hosts and origins become config, loopback by
    default). A comment on each event stream every 15s, so no silence reaches CloudFront's read
    timeout.
  - **A throwaway passcode**, not the user's real one: a fixed value committed in
    `infra/app-stack.ts`, guarding only the fake models, set as the revision's `RTFM_PASSCODE`.
    Agents get a cookie for `curl` by posting it to `/api/passcode` (`curl -c`). IN.15 replaces it.
  - `RtfmApp` gains the Web Function `rtfm-app`, whose name stays fixed (the edge's policy names
    it): `IamAuth`, `maxEnvironments` 2, `rateLimit` 100, `timeoutSeconds` 300, its logs in
    `/rtfm/app` and `/rtfm/app.local`, and the endpoint's domain as an output. The orchestrator
    deploys it after the merge.
  - The smoke check (`infra/README.md` › Deploying the app stack) adds the Web Function: its state
    `Active`, its endpoint's auth type `IamAuth`, its two log groups. Once this deploy leaves
    `RtfmApp` at `UPDATE_COMPLETE`, the check drops its "`UPDATE_ROLLBACK_COMPLETE` passes too"
    exception.
  - Before this task's smoke check can run, the user updates the AWS CLI on the laptop: the one
    installed (2.17, July 2024) has no `lambda-web` service, so `npm run aws -- lambda-web …`
    fails. `infra/README.md` › Your steps gains it.
  - Nothing secret goes in a revision's environment: `rtfm-read` can read it
    (`GetWebFunctionRevision`).
- **Done when:** the entry passes its tests locally (streams, a `POST`, a disconnect aborting a
  run, the origin check, the static app), `RtfmApp` synthesizes and passes its tests, and the
  smoke check's new commands are in `infra/README.md`.

### IN.9 — Put the app at rtfm.moonfetus.com
- **Status:** todo
- **Depends on:** IN.8
- **Files:** `infra/edge-*.ts` and their tests, `infra/app.ts`, `infra/README.md`, `PROCESS.md`
  (with the user's approval)
- **Do:**
  - Stacks the user approves and deploys from CloudShell, like `RtfmAccess`:
    - **`RtfmEdgeCertificate`** (us-east-1): the ACM certificate for `rtfm.moonfetus.com`,
      validated by DNS in the zone `moonfetus.com`, whose ID is a parameter.
    - **`RtfmEdge`** (us-west-2): the origin access control (`always-amz-auth`); a CloudFront
      Function on viewer requests that refuses any `Host` but `rtfm.moonfetus.com`, so
      CloudFront's default domain is refused; the distribution (alias `rtfm.moonfetus.com`, no
      caching for `/api/*`, every viewer header but `Host`, one connection attempt, a 60s read
      timeout); the Route 53 alias records; and the Web Function's resource policy letting only
      that distribution invoke `rtfm-app` (`aws:SourceArn`). Parameters: the certificate's ARN
      (from `RtfmEdgeCertificate`'s output), the zone's ID, and the Web Function's domain (from
      `RtfmApp`'s output).
  - Edge stacks use `LegacyStackSynthesizer` and carry no assets at all: no CDK custom
    resources, no `crossRegionReferences`, no `DnsValidatedCertificate`, no `BucketDeployment`.
    Any asset goes through the staging bucket, which `rtfm-deploy` can write. The CloudFront
    Function's code is inline in the template. A test fails any edge stack with an asset or a
    custom resource, or a template over the inline limit.
  - Tag every edge resource `project=rtfm`.
  - `PROCESS.md` › Authority names the `RtfmEdge*` stack files among those only the user approves.
  - Note in `infra/README.md`: RTFM's roles can still delete the Web Function or its resource
    policy (`lambda:DeleteResourcePolicy`), which cuts CloudFront off without a word, so the Web
    Function's name stays fixed and the smoke check goes through the domain.
  - The smoke check adds a request through `https://rtfm.moonfetus.com`, with the throwaway
    passcode's cookie, and one to CloudFront's default domain, which must be refused.
  - `infra/README.md` › Your steps gains the edge stacks' CloudShell steps, in order.
- **Done when:** the edge stacks synthesize and pass their tests, the user has approved the
  `PROCESS.md` change, and the steps are in `infra/README.md`. The user's deploy follows.

### IN.10 — Measure the deployed app
- **Status:** todo
- **Depends on:** IN.9, and the user's deploy of the edge stacks
- **Files:** `research/aws-design.md`
- **Do:** through `rtfm.moonfetus.com`, with `npm run aws` and `curl` (this task's work is in
  AWS): events arriving one by one; a `POST` with a body; a disconnect aborting the run; the cold
  start to a section's first byte; how long an idle environment lives (its `SIGTERM` in the
  logs); and the cost in Cost Explorer two days after the deploy, by service (Lambda, CloudFront,
  DynamoDB, CloudWatch), not only by the `project` tag, until IN.5 settles what that tag catches.
- **Done when:** the measurements are in this doc, and the idle cost is under $10 a month or the
  orchestrator has a task to move to B.

### IN.11 — Store the library in DynamoDB
- **Status:** todo
- **Depends on:** IN.8 (storage is the same for A and its fallback, so it doesn't wait for IN.10)
- **Files:** `server/storage/**`, `server/app.ts`, `server/config.ts`, `server/README.md`,
  `infra/app-stack.ts` and its test, `package.json`, `package-lock.json`, `scripts/**`,
  `vite.config.ts`, `vitest.setup.ts`, `ARCHITECTURE.md`
- **Do:**
  - `ManualStore` on the table `rtfm-app`, with its shared suite run against the file store and
    against DynamoDB Local; the table in `RtfmApp`; the Web Function on it, seeding once.
  - DynamoDB Local for `npm test`: a script fetches one pinned release of AWS's jar once, checks
    its checksum, and keeps it in a gitignored folder; the tests' global setup starts it with
    `java` on 127.0.0.1 on a free port and stops it after. No network during `npm test` once the
    jar is there; without it, the suite says how to fetch it.
  - `ARCHITECTURE.md` gains the table and the store pair.
- **Done when:** both stores pass the shared suite, and `npm test` stays loopback-only.

### IN.12 — One ledger for real spend
- **Status:** todo
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
- **Done when:** both implementations pass one shared suite, two servers with Bedrock share the
  caps in a test against DynamoDB Local, and the docs say so.

### IN.13 — One writer per section across environments
- **Status:** todo
- **Depends on:** IN.11
- **Files:** `server/writer/**`, `server/storage/**`, `server/api/**`, `server/app.ts`,
  `server/writer/README.md`
- **Do:** section leases behind an interface in `runs.ts`, in memory locally and on the section
  item in `rtfm-app`; a reader on another environment waits for the stored body, then gets it as
  one `append` and `written`, or `failed`.
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
