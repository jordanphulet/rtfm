# RTFM — Work List

The work still to do, with each task's status. **This file is the source of truth for status.**
`PROCESS.md` says how the orchestrator works through it; finished work is removed.

## Local first

The app is moving into AWS, and agents must still be able to run, test and check all of it on one
machine.

### LF.4 — The fake models behind the real gateway
- **Status:** doing (agent af334ef91305601dd)
- **Depends on:** —
- **Files:** `server/**`, `scripts/serve-temp.ts`, `scripts/shot.ts`, `README.md`, `ARCHITECTURE.md`
- **Do:**
  - Run the fake models through the same gateway as Bedrock, so the caps, the kill switch, the
    ledger and the stall timeout run under `npm run dev`, `serve-temp` and `shot` too.
  - Prefer the deepest seam: a fake `ModelClient` that answers each job, so the Bedrock writer's
    prompt, output handling and checks run as well. Where a fake can't do its job from the request
    alone (the fake writer replays a section's sample text), say why in the report and keep that
    fake one level up, still behind the gateway.
  - The fake models are priced at $0 in the price table, and their ledger entries name the fake
    model, so `npm run usage` keeps them apart from real spend.
  - Fold the hand-built gateways in `server/api/librarian.test.ts`, `server/config.test.ts` and
    `server/app.test.ts` into `testGateway`.
- **Done when:** `npm test` passes; under `serve-temp`, opening a section and asking the librarian
  each write ledger entries at $0, and a `STOP` file in its data folder stops them;
  `npm run shot -- --compare` shows no change; `README.md` and `ARCHITECTURE.md` no longer say
  the caps and kill switch apply only to Bedrock.

### LF.5 — The loopback guard and a custom `lookup`
- **Status:** todo
- **Depends on:** LF.3
- **Files:** `loopback-only.ts` and its test, `server/README.md`
- **Do:** block a connection whose own `lookup` (the `lookup` option of `net` and `tls`, or
  undici's `connect.lookup`) turns a loopback name into another address, for example by checking
  the address the socket's `lookup` event reports.
- **Done when:** `npm test` passes, and a test shows `net.connect({ host: "localhost", lookup })`
  with a `lookup` that answers `192.0.2.1` blocked, and an ordinary connection to `localhost`
  still allowed.

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

### IN.1 — The `infra/` app and the access stack
- **Status:** doing (agent a1e12c678639005f4)
- **Depends on:** LF.1
- **Files:** `infra/**`, `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`,
  `ARCHITECTURE.md`, `README.md`, `server/README.md`, `CLAUDE.md`, `PROCESS.md`
- **Do:**
  - `npm run aws -- <args>` and `npm run cdk -- <args>`, the only way to reach AWS from this repo.
    Each runs its command with `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointing at
    `~/.aws/rtfm/`, with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
    `AWS_PROFILE` and `AWS_DEFAULT_PROFILE` removed from its environment, and with the profile it
    chooses: `rtfm-read`, or `rtfm-deploy` for `cdk deploy`. Before a command that reaches AWS,
    it checks with `sts get-caller-identity` that it acts as an RTFM role in the account `infra/`
    names, and refuses otherwise; `cdk synth` needs no credentials and skips the check. Tests
    cover the environment it builds, without calling AWS.
  - A CDK app in TypeScript in `infra/`. Its stacks use
    `DefaultStackSynthesizer` with the qualifier `rtfm`, and name the account and region in code,
    with no context lookups, so synthesis and its tests run offline.
  - The `RtfmAccess` stack:
    - the Bedrock policy, from the user's hand-made one in account `438180219169`, any region:
      `bedrock-mantle:CreateInference` and `ListModels` on `project/default`;
      `bedrock:InvokeModel` and `InvokeModelWithResponseStream` on
      `inference-profile/*anthropic.claude-*` and `foundation-model/anthropic.claude-*` (keep
      the region a wildcard: a `global.` profile's foundation-model ARN has none); and
      `aws-marketplace:ViewSubscriptions` and `Subscribe` on `*`, which a model's first call
      needs. It leaves out the hand-made policy's `aws-marketplace:Unsubscribe`, and narrows its
      `inference-profile/*` to Claude's, since the account isn't only RTFM's;
    - the IAM user `rtfm-local`, with that policy, for the server's `.env.local` (the user makes
      its key in the console);
    - the IAM user `rtfm-agent`, whose only permission is to assume the two roles below;
    - `rtfm-read`: CloudWatch Logs, CloudFormation and S3 read on RTFM's resources, the lookups
      `cdk diff` needs, and Cost Explorer read;
    - `rtfm-deploy`: may assume the `rtfm`-qualified bootstrap roles and nothing else;
    - the permissions boundary: the policy `cdk bootstrap` gives CloudFormation's execution role,
      and that every role a stack creates must carry. It allows only RTFM's resources, and denies
      changing the boundary, `RtfmAccess`'s resources and the bootstrap stack;
    - a monthly AWS Budgets alarm on RTFM's spend, emailed to an address given as a parameter at
      deploy, so no address is committed.
  - Assertion tests for the stack: each role's reach, and the boundary's denials.
  - `infra/README.md`: what each identity is for, and the user's steps in order:
    1. `cdk bootstrap` with the qualifier, the boundary and the execution policy;
    2. deploy `RtfmAccess` with their own admin sign-in;
    3. make `rtfm-local`'s key, swap it into `.env.local`, delete the hand-made user;
    4. make `rtfm-agent`'s key and create `~/.aws/rtfm/credentials` with it and
       `~/.aws/rtfm/config` with the two profiles, leaving `~/.aws/config` alone.

    List what the boundary can't scope by name, and why.
  - `CLAUDE.md` › Shell: never read, print, copy or edit anything under `~/.aws`; run AWS only
    through `npm run aws` and `npm run cdk`, never `aws` or `cdk` directly. `PROCESS.md` ›
    Authority: the `RtfmAccess` stack joins the files only the user approves. Give both diffs in
    full; the user approves them.
- **Done when:** `npm run build` and `npm test` pass, offline; `npm run cdk -- synth` produces
  both templates; and the user has approved the `CLAUDE.md` and `PROCESS.md` changes.

### IN.2 — Prove the deploy path
- **Status:** blocked (the user follows `infra/README.md`'s steps)
- **Depends on:** IN.1
- **Files:** `infra/**`, `README.md`, `PROCESS.md`
- **Do:**
  - With `npm run aws`, read `RtfmAccess`'s stack and its outputs, and show that a work profile
    in the user's own `~/.aws/config` isn't reachable from it.
  - With `npm run cdk`, deploy an `RtfmApp` stack holding one log group, then show that it can't
    change `RtfmAccess`, create a role without the boundary, or touch a resource not named for
    RTFM.
  - Check the server still calls Bedrock with `rtfm-local`'s key (`npm run dev` with
    `RTFM_MODELS=bedrock`, one section, under $0.01).
  - `PROCESS.md` › Review loop: after merging a change to an app stack, the orchestrator runs
    `npm run cdk -- deploy`, then a smoke check. Give the diff in full; the user
    approves it.
- **Done when:** each check above passed and is recorded in `infra/README.md`, and the user has
  approved the `PROCESS.md` change.

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
