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
- **Status:** blocked (the user follows `infra/README.md`'s steps)
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
