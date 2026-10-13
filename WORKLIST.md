# RTFM — Work List

The work still to do, with each task's status. **This file is the source of truth for status.**
`PROCESS.md` says how the orchestrator works through it; finished work is removed.

## Local first

The app is moving into AWS, and agents must still be able to run, test and check all of it on one
machine.

### LF.1 — The local-first rule and its guards
- **Status:** doing (agent a71df3eef5ecbb77c)
- **Depends on:** —
- **Files:** `ARCHITECTURE.md`, `README.md`, `server/README.md`, `server/gateway/README.md`,
  `server/gateway/sdk-boundary.test.ts`, `vite.config.ts`, `vitest.setup.ts` and its test,
  `tsconfig.node.json`
- **Do:**
  - Add a cross-cutting rule to `ARCHITECTURE.md`, "Everything runs on one machine":
    - every AWS service the app uses (DynamoDB, an IAM role, SSM, a Lambda handler, static
      hosting) sits behind an interface with a local implementation;
    - the local one is the default, and config chooses the AWS one through an environment
      variable, as `RTFM_MODELS` chooses the model;
    - `npm test`, `npm run serve-temp` and `npm run shot` need no network beyond this machine and
      no AWS credentials;
    - each such interface has one shared test suite that runs against every implementation, so
      the local one stays as strict as the AWS one;
    - a feature that works only in AWS needs the user's approval;
    - say what local can't show (IAM permissions, Lambda response streaming and disconnects, cold
      starts), which a smoke check against the deployed app covers.
  - Widen `sdk-boundary.test.ts` from one allowed importer to a named list of adapter files, still
    just `server/gateway/bedrock-client.ts`, so a later AWS adapter is added to the list on
    purpose.
  - Add a Vitest setup file that makes any test fail when it opens a connection to anything but
    loopback (`127.0.0.1`, `::1`, `localhost`), through `fetch`, `node:http(s)`, `node:net`,
    `node:tls` or a DNS lookup of another name.
  - Run `npm run serve-temp` and `npm run shot`, and report any request their pages make beyond
    this machine (fonts, say), without fixing it.
- **Done when:** `npm run build` and `npm test` pass; the setup file's own test shows a request to
  a non-loopback address failing through each of those paths, and a loopback server still
  reachable; `ARCHITECTURE.md` has the rule and `server/README.md` › Tests says tests reach only
  loopback.

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
