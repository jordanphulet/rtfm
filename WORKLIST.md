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

## A library per recipient

The user shares RTFM with each job application as its own library: one secret link per library,
each library isolated from the others, starting from the same starter manuals, living until the
user revokes it, and with its activity visible to the user.

### LB.4 — Carry the library through each request
- **Status:** doing (agent acdd99f166601e4d9; approved, small fixes)
- **Depends on:** —
- **Files:** `server/api/**`, `server/agent/**`, `server/app.ts` and its test, `server/testing.ts`,
  `server/replacement.test.ts`, `server/web-function.test.ts`, `scripts/shot.ts`,
  `scripts/serve-temp.ts`, `server/logging/README.md`, `server/README.md`, `ARCHITECTURE.md`
- **Do:** a `Library` per library id, built once per environment (its store, leases, writer, and
  the one shared gateway), as `research/libraries.md` › How the server carries the library
  describes. The Node adapter's gate puts the library on `ApiRequest.library`, and every route, the
  librarian, the planner and the previews take their store, runs scope and gateway from it. Add
  `libraryId` to `request`, `request.failed`, `librarian.reply`, `agent.tool-failed`,
  `client.error` and `client.limited`, `admin` for the admin's library. The gate gives every request
  the admin's library, so nothing anyone sees changes.
- **Done when:** the API's tests, run with two libraries put on requests directly, show neither
  reaches the other's manuals, sections, runs or librarian, the log lines carry `libraryId`, and
  `npm run build` and `npm test` pass.

### LB.5 — Cap each library's daily spend
- **Status:** todo
- **Depends on:** LB.4
- **Files:** `server/gateway/**`, `server/config.ts` and its test, `server/storage/types.ts`,
  `server/storage/file-ledger.ts` and its test, `server/app.ts` and its test, `server/usage.ts`,
  `README.md`, `server/README.md`, `server/logging/README.md`
- **Do:** as `research/libraries.md` › Spend describes: the gateway is bound to each `Library`
  (`server/gateway/gateway.ts`), and every reserve entry carries `libraryId` (an entry without one
  is the admin's); a recipient library's reservation also adds its worst case to its day's total
  (`TOTAL` / `LIBRARY#<libraryId>#<day>` in `rtfm-usage`, `<day>#<libraryId>` in the data folder's
  totals) within `caps.libraryDailyUsd`, $0.50, in the same atomic step, and its settle adds
  `usd − worst case` there; past it, `SpendingRefused("library-cap")`, after the kill switch and
  the central caps. The admin's calls have no library cap. `model.call` and `model.refused` carry
  `libraryId`, and `npm run usage` groups spend by library. Extend `spending-ledger-suite.ts` to the
  library cap on both ledgers, racing reservations included. Say the monthly exposure in
  `README.md` as that section does.
- **Done when:** the suite shows a library refused at its cap while another library and the admin
  still reserve, the central caps and kill switch refuse every library, and `npm run build` and
  `npm test` pass.

### LB.8 — Open a library by its link
- **Status:** todo
- **Depends on:** LB.4, LB.6
- **Merges after:** LB.5
- **Files:** `server/api/**`, `server/storage/**`, `server/config.ts` and its test,
  `server/app.ts` and its test, `server/web-function.test.ts`, `server/testing.ts`,
  `server/logging/**`, `scripts/serve-temp.ts`, `README.md`, `ARCHITECTURE.md`
- **Do:** as `research/libraries.md` › Access describes:
  - the gate, generalized, gives each request its library from an `rtfm_library` cookie (the
    secret, hashed, its link looked up; found links kept a minute, misses never; a failed lookup
    `500`), then the passcode's, then the admin's library without a gate; a revoked link gets
    `401 { error: "Link closed" }`;
  - `POST /api/link { secret }` seeds the library's starters (`starterManualIds` in
    `server/config.ts`: *The Haunt That Listens* and *Negotiating With Geese*, tables of contents
    only), one seeding at a time per library in the environment, records the use, and sets the
    cookie (a year) while clearing the passcode cookie, as two `Set-Cookie` headers;
    `DELETE /api/link` clears the library cookie, with or without a gate; `POST /api/passcode`
    clears it too;
  - every response to a request the library cookie opened renews the cookie;
  - count the activity in the gate and adapter (opens, `firstUsedAt`, `lastUsedAt`, `sectionsRead`,
    `librarianMessages`) and in a wrapper of the library's store and leases (`manualsCreated`,
    `sectionsWritten`), with seeding on the bare store; log `link.accepted`, `link.refused`,
    `library.seeded` and `library.activity-failed`;
  - give `npm run serve-temp` `--library <libraryId>`, which prints one link once;
  - say in `README.md`, as plainly as for the passcode, that the link is a bearer token, that a
    scanner that runs scripts opens it, and that `create` and `revoke` are the user's.
- **Done when:** tests open two libraries by their links on one server and in `web-function.test.ts`
  (DynamoDB Local), and show each sees only its own manuals, a new library starts with the two
  starters and no section written, a revoked link is refused within the minute, a failed lookup
  answers `500`, each counter counts as defined, the loopback path with no passcode is unchanged
  and `DELETE /api/link` leaves a library there, no log line or file holds the secret or its digest,
  and `npm run build` and `npm test` pass.

### LB.9 — Open a link in the browser
- **Status:** todo
- **Depends on:** LB.8
- **Files:** `src/App.tsx`, `src/link/**`, `src/passcode/**`, `src/reportErrors.ts` and its test,
  `DESIGN.md`, `README.md`, `scripts/shot.ts`, `scripts/screenshots.ts`, `ARCHITECTURE.md`
- **Do:** the page route `/l` reads the secret from the fragment as it loads, with no button, posts
  it to `/api/link`, and on `204` replaces the address with `/`; on `401` it shows the passcode
  screen with "This link is closed." above the form, as does any API request answered
  `401 { error: "Link closed" }`. The page route `/admin` calls `DELETE /api/link` and opens `/`.
  Design the link page and the closed line in `DESIGN.md`, add their shots to `npm run shot`, and
  name both routes in `README.md` › Where things live.
- **Done when:** component tests cover opening, a closed link, a closed library mid-visit and
  `/admin` from a library, the address keeps no secret after opening, `npm run shot` takes the new
  states, and `npm run build` and `npm test` pass.

### LB.10 — Make, list and revoke libraries with the ops tools
- **Status:** todo (its `CLAUDE.md` line is the user's to approve)
- **Depends on:** LB.2, LB.5, LB.6
- **Merges after:** LB.7, LB.8, LB.9
- **Files:** `scripts/ops/**`, `server/logging/log-reader.ts` and its test, `server/logs.ts`,
  `README.md`, `CLAUDE.md`
- **Do:** `npm run ops -- library create <libraryId> [--label <text>]`, `list`, `show <libraryId>`
  and `revoke <libraryId>`, as `research/libraries.md` › What `npm run ops` gains describes, under
  `README.md` › The ops tools' rules, with `--json`; `create` prints the link once on standard
  output and nowhere else, and keeps no secret; `show` lists the library's manuals with their titles
  and written sections, read as `rtfm-read`. `logs` and `npm run logs` gain `--library <libraryId>`.
  Add to `CLAUDE.md` › Shell that `library create` and `library revoke` are the user's, run in
  their own terminal outside the Claude app, and agents never run them, as for `passcode set`, and
  give its diff in the report. The tests run offline; no agent runs `create` or `revoke` against
  the deployed app.
- **Done when:** the ops tests (DynamoDB Local and the stand-in for the AWS CLI) cover each
  command's text and JSON, a refused id, a revoked library's activity and manuals, and that no
  output but `create`'s holds the link; `npm test` passes; and the user has approved the
  `CLAUDE.md` line.

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
