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

### IN.4 — Settle the AWS design
- **Status:** doing (agent a67c46fb4f3ef74f8; reviewed; waiting for the user to approve and redeploy `RtfmToolkit` from the worktree's template, then the orchestrator commits it and adds IN.7–IN.15 from `research/aws-design.md`)
- **Depends on:** IN.3
- **Files:** `research/aws-design.md`, `research/aws-hosting.md`, `research/lambda-and-dynamodb.md`,
  `ARCHITECTURE.md`, `infra/**`
- **Do:**
  - Record in `research/aws-design.md` the design the user decided on 2026-10-13, in place of the
    spike plan:
    - the front door: CloudFront in front of a Lambda Web Function, with no spikes; if the Web
      Function's idle cost passes $10 a month, move to a streaming function URL run through the
      AWS Lambda Web Adapter;
    - one spending ledger in AWS: `RTFM_MODELS=bedrock` always uses the central ledger, totals
      and kill switch in DynamoDB, from a laptop or deployed; `fake` keeps the local ones;
    - two DynamoDB tables, single-table within each: `rtfm-app` (manuals, sections, the passcode
      digest) and `rtfm-usage` (ledger, totals, kill switch);
    - the passcode stored only as its SHA-256 digest in `rtfm-app`; the cookie holds the digest;
      the user sets it from a terminal, so no agent sees it; agents build a cookie from the
      digest for smoke checks; `RTFM_PASSCODE` locally, hashed the same way;
    - an `rtfm-ops` role in `RtfmAccess`, assumable by `rtfm-agent`, that writes only the
      passcode and kill-switch items and grows with the ops tools;
    - the ops tools, built for agents: rotate the passcode (the user's), the kill switch, usage,
      logs, status;
    - the domain `rtfm.moonfetus.com` (a Route 53 zone in this account): its certificate, DNS
      record and distribution in stacks the user deploys, so RTFM's roles get no Route 53 or ACM
      permission; the app answers only on that origin.
  - Turn the boundary change into its permanent form: `rtfm-*` Web Functions instead of
    `rtfm-spike-*`, the `PutResourcePolicy` deny and the Web Function auth-type denials, and the
    user's edge stacks among those RTFM's roles may only read. Delete the spike code.
  - Write the build tasks that follow, the first deploying the app on a Web Function behind
    CloudFront with the fake models and throwaway storage, measuring streaming, disconnects,
    cold starts and idle cost.
- **Done when:** the doc records the decided design and its build tasks, the spike code is gone,
  the user has approved the boundary change and redeployed `RtfmToolkit` with it, the decision is
  in `ARCHITECTURE.md`, and the two older research docs' status lines say what was adopted. The
  orchestrator then adds the build tasks.

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
