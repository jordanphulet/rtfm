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

### IN.2 — Prove the deploy path
- **Status:** doing (agent a8e21f88b7c3c399f; in review; on 2026-10-13 the user approved its `PROCESS.md` step 5 as sent in review round 1: deploy after any `infra/` change but docs and tests, with `--require-approval never`; on failure a `needs-human` task)
- **Depends on:** IN.1
- **Files:** `infra/**`, `README.md`, `PROCESS.md`
- **Do:**
  - With `npm run aws`, read `RtfmAccess`'s stack and its outputs, and show that a work profile
    in the user's own `~/.aws/config`, and the user's own CLI aliases, aren't reachable from it.
  - With `npm run cdk`, deploy an `RtfmApp` stack holding one log group and one `rtfm-` bucket with
    default props (no `blockPublicAccess`, which the boundary refuses to set), then show that it can't
    change `RtfmAccess`, create a role without the boundary, touch a resource not named for
    RTFM, create a Function URL with `AuthType NONE`, or lift the bucket's Block Public Access.
  - Check from Cost Explorer (through `npm run aws`) whether the `project=rtfm` tag catches
    Bedrock calls made with `rtfm-local`'s key. If it doesn't, say so: the budget then needs
    another filter, or the server's calls a tagged application inference profile.
  - Check the server still calls Bedrock with `rtfm-local`'s key (`npm run dev` with
    `RTFM_MODELS=bedrock`, one section, under $0.01).
  - `infra/README.md` › Your steps: the CloudShell route the user took (synthesize locally, upload
    both templates, `aws cloudformation deploy` each, `aws iam create-access-key` for both users),
    in place of `npx cdk bootstrap` with an admin profile.
  - `PROCESS.md` › Review loop: after merging a change to an app stack, the orchestrator runs
    `npm run cdk -- deploy`, then a smoke check. Give the diff in full; the user
    approves it.
- **Done when:** each check above passed and is recorded in `infra/README.md`, and the user has
  approved the `PROCESS.md` change.

### IN.3 — Keep the development loop local
- **Status:** todo
- **Depends on:** IN.2
- **Files:** `ARCHITECTURE.md`, `PROCESS.md`
- **Do:**
  - `PROCESS.md`, next to IN.2's deploy step in › Review loop: "Only the orchestrator deploys an
    app stack, and only from `main` after a merge. A task agent reaches AWS only when its task's
    **Do** says so."
  - `ARCHITECTURE.md` › Everything runs on one machine, two more bullets:
    - "No task's **Done when** needs the deployed app; a smoke check after each deploy covers what
      local can't show."
    - "Agents try out stored-data changes on throwaway data. Deployed data changes only when a
      change merges, and that change carries its migration or reads the old form."
- **Done when:** both changes are in, and the user has approved the `PROCESS.md` diff.

### IN.4 — Settle the AWS design
- **Status:** todo
- **Depends on:** IN.3
- **Files:** `research/aws-design.md`, `research/aws-hosting.md`, `research/lambda-and-dynamodb.md`,
  `ARCHITECTURE.md`, `infra/**`
- **Do:**
  - From the local server, list what the deployed app must do: each route and its stream (the
    section SSE stream, the librarian POST stream), one writer per section with joiners, abort on
    the last disconnect, the caps across instances, the passcode, the kill switch, idle cost.
  - Weigh, against that list:
    - CloudFront and a streaming Lambda Function URL behind origin access control (OAC): one
      domain keeps the Origin checks, the passcode cookie and `EventSource` working;
    - API Gateway REST with response streaming (check that it exists and how it behaves);
    - one always-on Node instance running the server unchanged;
    - rule out API Gateway HTTP API (no streaming) and AppSync (it would replace the REST and SSE
      contract), with the reasons;
    - for storage, DynamoDB alone against DynamoDB plus S3 for section bodies. Bodies are under
      about 10 KB at `max_tokens` 2048, and saving one needs a conditional write and a check
      that the manual exists.
  - Weigh each option by how much of it runs outside AWS: the AWS-only code should be thin
    adapters, with the logic in shared code that runs locally. Say where the design changes a
    shared interface and how its local implementation keeps up (`ARCHITECTURE.md` › Everything
    runs on one machine).
  - Spike in throwaway `RtfmSpike…` stacks, under a boundary change the user approves and
    deploys first (from CloudShell, as in `infra/README.md` › Your steps), for under $1 in all:
    - SSE through the front door;
    - a POST with a body through it (OAC needs a body-hash header);
    - whether Lambda sees a client disconnect;
    - the cold-start time to open a section.
  - Give the exact boundary diff the chosen design needs, the cost at idle and at the $20 cap,
    the local and AWS interface pairs to build, and the build tasks that follow.
- **Done when:** the doc recommends one design with the spikes' results, every spike stack is
  destroyed and any spike-only boundary change is withdrawn, and the user has decided. The
  decision then goes into `ARCHITECTURE.md`, the two older research docs' status lines say what
  was adopted, and the orchestrator adds the build tasks.

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

### IN.6 — Arguments reach AWS as given
- **Status:** todo
- **Depends on:** IN.2
- **Files:** `infra/run-aws.ts` and its test, `package.json`, `infra/README.md`
- **Do:** find why `npm run aws -- … --query 'Stacks[0].{Status:StackStatus,Protected:EnableTerminationProtection}'`
  reaches the AWS CLI with its braces gone and split at the comma (npm runs scripts through a
  shell), and make every argument after `--` reach the command unchanged.
- **Done when:** `npm test` passes, and a test shows arguments with braces, commas, spaces,
  quotes and `$` reach the spawned command exactly as given.

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
