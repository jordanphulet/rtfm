# RTFM in AWS: the design

Research, written 2026-10-13. Every source was read on 2026-10-13. The only AWS calls were
read-only ones through `npm run aws` and `npm run cdk -- diff`.

**Adopted 2026-10-13:** the user chose this design without running spikes. Adopted: CloudFront in
front of a Lambda Web Function running the server, with a streaming function URL through the AWS
Lambda Web Adapter as the fallback if the Web Function's idle cost passes $10 a month; DynamoDB
alone, as two tables, `rtfm-app` and `rtfm-usage`; one spending ledger, in `rtfm-usage`, for all
Bedrock spend, from a laptop or deployed; the passcode stored only as its SHA-256 digest; an
`rtfm-ops` role and ops tools built for agents; the domain `rtfm.moonfetus.com`, with its
certificate, DNS record and distribution in stacks the user deploys; and the boundary's
permanent change for Web Functions. `ARCHITECTURE.md` › Everything runs on one machine has the
rule that governs the code (the same server, AWS code only as adapters), `infra/README.md` › The
boundary has the boundary, and the build tasks at the end put the rest into what they govern.

## What the deployed app must do

Read from the local server as it is (`server/api/README.md`, `server/writer/README.md`,
`server/gateway/README.md`, `server/storage/README.md`).

- **Routes and streams.** JSON routes that must never be cached (statuses change while sections
  are written); `DELETE` with no body; the section stream, server-sent events opened by
  `EventSource`, which sends cookies but no custom header and never reconnects; the librarian's
  `POST`, a JSON body up to 256 KiB in and server-sent events out; `POST`s for the passcode (its
  answer sets a cookie) and for browser errors; and the built app, with `index.html` for every
  page route.
- **Silences, and no retries.** A section's first event waits for its first whole paragraph; the
  librarian's stream can be silent about 26s while the planner writes a tool parameter (its idle
  timeout is 60s); a reply takes up to 8 model turns. A repeated stream request pays for a second
  run or reply, so nothing in front may retry one.
- **One writer per section, with joiners.** `writer/runs.ts` keeps one run per section in the
  process; a later reader gets the text written until then, then the same events.
- **Abort on the last disconnect.** When the last reader leaves, the run and its Bedrock call
  stop. The server must see the client leave.
- **The caps across instances.** The gateway reserves each call's worst case against $2 a day and
  $20 a month in one synchronous step on totals in its memory; that holds for one process, which
  the data folder's lock enforces. More than one process needs the reservation to be one atomic
  step in shared storage.
- **The passcode.** Every request but entering it needs the `rtfm_passcode` cookie (`HttpOnly`,
  `SameSite=Strict`, `Path=/api`), which `EventSource` sends only same-origin: the app and the API
  share one origin.
- **Only the app's own pages.** The Node adapter refuses another `Host` or `Origin`, and a body
  that isn't JSON.
- **The kill switch.** Something the user flips without a deploy, read before every model call.
- **Idle cost.** Nobody reads most of the time: idle should cost little more than storage, all of
  it counted by the `rtfm-monthly` budget (`project=rtfm`).
- **Storage.** A manual is never replaced; a body is saved once and only while its manual exists;
  deleting a manual removes its sections; the ledger is append-only, read by month. A body is under
  about 10 KB (`max_tokens` 2048).

## The options weighed

| Option | For | Against |
| --- | --- | --- |
| **A. CloudFront + Lambda Web Function (adopted)** | The server runs as an HTTP server: streams, cookies and disconnects behave as they do locally; one environment serves many requests, so readers of one section usually share a process; scales to zero; `POST` bodies need no hash behind OAC | Launched 2026-10-12; memory is billed while an environment lives, idle time included; 2 or more environments may run, so the caps, leases and kill switch still go to storage |
| **B. CloudFront + streaming function URL (the fallback)** | Mature; free tier covers RTFM's scale | One request per environment, so every joiner goes through storage; a broken client connection doesn't stop the run; the browser must hash every `POST` body for OAC |
| C. API Gateway REST, streaming | Exists (`responseTransferMode: STREAM`, 15 minutes) | B with a second per-request charge, its own response format, and an `execute-api` domain that still needs CloudFront |
| D. One always-on Node server | The server unchanged, files and all | $5–9 a month idle (EC2, Lightsail or Fargate), a machine to patch, and nothing the boundary can name |
| API Gateway HTTP API | | Ruled out: no response streaming |
| AppSync | | Ruled out: GraphQL subscriptions over WebSockets would replace the REST and SSE contract |

**What A rests on**, from AWS's docs: a Web Function runs a Node.js 24 HTTP server on Arm64,
listening on `AWS_LAMBDA_HTTP_ENDPOINT`, with up to 128 concurrent requests per environment (64 by
default) and `timeoutSeconds` up to 900 for a whole stream. An endpoint's `maxEnvironments` is 2
or more, Lambda may briefly run past it, and it keeps spare environments ahead of demand. An idle
environment is removed after an undocumented time, with `SIGTERM` and 1 second. Billing is $0.30 a
million requests, $0.0000276944 an active vCPU-second and $0.0000036667 a GB-second of memory "for
as long as it runs, including time between requests" (us-east-1 list prices), with no free tier
listed. Behind CloudFront the endpoint is `IamAuth`, an origin access control signs with
`always-amz-auth`, and the Web Function's resource policy lets `cloudfront.amazonaws.com` invoke
it with `aws:SourceArn` set to the distribution.

### The idle-cost risk

Memory is billed while an environment lives, between requests too, and the docs don't say how long
an idle one lives. Each environment has 2 GB.

- Billed at its full 2 GB around the clock, one environment is about **$19 a month**; two, the
  smallest `maxEnvironments`, about **$38**.
- AWS's pricing examples bill the memory consumed, 0.14–0.50 GB, which is about **$1.30–4.75 a
  month** per environment that never goes away.
- If environments do go away when idle, it is far less.

IN.10 (below) measures it. **If it passes $10 a month, RTFM moves to B.**

### The fallback: B, through the Lambda Web Adapter

A regular streaming function behind a function URL, still behind CloudFront with OAC, running the
server unchanged through the AWS Lambda Web Adapter (awslabs): the adapter runs as a layer, starts
the server, waits for its port, and turns each invocation into an HTTP request to it. It supports
function URLs and response streaming (`AWS_LWA_INVOKE_MODE=response_stream`). What changes against
A:

- the browser hashes every `POST` body into `x-amz-content-sha256` (`apiFetch`, with
  `crypto.subtle`), since OAC can't sign a function URL request's body;
- one request per environment, so every joiner goes through the leases;
- a run doesn't stop when its reader leaves: AWS documents that a streamed response is not
  interrupted when the client connection breaks, so the call runs to its end and is charged;
- the function URL's two permissions for CloudFront go in a stack the user deploys, as the Web
  Function's resource policy does.

### The guard for the first deploy

`maxEnvironments` 2 and a `rateLimit` of 100 requests a second on the Web Function's endpoint, and
a cost check in Cost Explorer a couple of days after the first deploy.

## Storage: DynamoDB alone

DynamoDB alone fits, and S3 for bodies would gain nothing:

- a body under 10 KB is far below the 400 KB item limit;
- saving a body is one `TransactWriteItems`: a `Put` of the section with `attribute_not_exists`,
  and a `ConditionCheck` that the manual exists, so a deleted manual never gains a section (about
  20 write units, $0.0000125);
- with S3, `If-None-Match: *` makes the put once-only but can't be conditional on the manual item,
  so a delete can race a save and leave an orphan.

**Two tables, on-demand, single-table within each:**

- **`rtfm-app`**: manuals, their sections, and the passcode digest;
- **`rtfm-usage`**: the ledger, the spending totals, and the kill switch.

The exact keys and item shapes are the storage task's.

## One spending ledger

`RTFM_MODELS` chooses the ledger:

- **`fake`**: the data folder's ledger and `.data/STOP`, as now. The fake models cost nothing.
- **`bedrock`**: always the central ledger, totals and kill switch in `rtfm-usage`, from a laptop
  or deployed. So the caps hold for all real spend, wherever it runs, and one kill switch stops it
  all.

Reserving is one atomic step: a transaction updating the day's and the month's total items, each
on the condition `committed <= cap − worstCase` (a condition can't add, so the limit is computed
first). `rtfm-local`, the laptop's key, gains read and write on `rtfm-usage` only (an `RtfmAccess`
change). With Bedrock, the data folder's lock no longer guards money; it still keeps one server
per data folder.

## The passcode

- Stored only as its SHA-256 digest, in `rtfm-app`. The cookie holds the digest, compared in
  constant time. Rotating it changes the digest, which logs every browser out.
- The user sets it with an ops command that needs a terminal and doesn't echo, so no agent sees it.
- Agents build a cookie from the digest, which `rtfm-ops` can read, for smoke checks.
- Locally, `RTFM_PASSCODE` as now, hashed the same way. No SSM.
- **The digest opens the app.** Since the cookie is the digest, anything that can read the
  passcode item can open the app: `rtfm-ops`, the Web Function's role, and any role an app stack
  creates, which the boundary allows `dynamodb:*` on `rtfm-*`. That is within the user's decision:
  the passcode itself stays the user's, and the digest guards a budget the caps already bound.

## `rtfm-ops` and the ops tools

**`rtfm-ops`** is a role in `RtfmAccess`, assumable by `rtfm-agent`. It writes only the passcode
item in `rtfm-app` and the kill-switch item in `rtfm-usage` (`dynamodb:LeadingKeys`), and reads the
passcode item. It grows with the ops tools.

**The ops tools** are built for agents first: non-interactive (except setting the passcode), plain
text with `--json`, a non-zero exit on failure, and documented where agents look.

- set the passcode (the user's, terminal only);
- the kill switch: on, off, status;
- `npm run usage` on the central ledger;
- `npm run logs` on CloudWatch;
- a status command.

Deleting or rewriting a deployed section and exporting the library come after.

## The domain and the edge

The app answers at **`https://rtfm.moonfetus.com`**, in the Route 53 public zone `moonfetus.com`
in this account, where nothing uses `rtfm`.

- **In stacks the user deploys** (`RtfmEdge*`, with `LegacyStackSynthesizer` and no assets): an
  ACM certificate in us-east-1, validated by DNS, whose ARN the distribution's stack takes as a
  parameter; and in us-west-2 the CloudFront distribution, its origin access control, a Route 53
  alias record and the Web Function's resource policy for that distribution. RTFM's roles get no
  Route 53, ACM or CloudFront permission and no resource policy. They can still delete the Web
  Function or its resource policy, which cuts CloudFront off silently, so the Web Function's name
  stays fixed and the smoke check goes through the domain.
- **The distribution:** no caching for `/api/*`, every viewer header but `Host`, one connection
  attempt (CloudFront retries a `GET` that times out, which would pay for a second run), and a
  60s read timeout.
- **Only that origin.** The server's allowed origin is `https://rtfm.moonfetus.com`, and a
  CloudFront Function on viewer requests refuses any other `Host`, so CloudFront's default domain
  is refused: the server can't see the viewer's `Host`, since CloudFront sends the endpoint's.

## How much runs outside AWS

`ARCHITECTURE.md` › Everything runs on one machine: every AWS service sits behind an interface
with a local implementation, the default, and one shared test suite. This design adds or changes:

| Interface | Local | AWS |
| --- | --- | --- |
| `ManualStore` | files | `rtfm-app` |
| `UsageLedger`, spending totals, kill switch | the data folder (with `fake`) | `rtfm-usage` (with `bedrock`, anywhere) |
| Section leases (out of `runs.ts`) | in memory | a conditional lease on the section item; a reader on another environment waits for the stored body |
| The passcode | `RTFM_PASSCODE`, hashed | its digest in `rtfm-app` |
| Where the server listens, whom it answers | `127.0.0.1`, local `Host` and `Origin` | `AWS_LAMBDA_HTTP_ENDPOINT`, the endpoint's `Host`, `https://rtfm.moonfetus.com` |
| Model credentials | `.env.local` | the Web Function's role |
| Logs | standard output and the data folder | standard output (CloudWatch) |
| The built app | Vite | the server serves `dist/`; CloudFront caches `/assets/*` |

The DynamoDB adapters' suites run against DynamoDB Local on loopback, so `npm test` needs no
network or credentials.

## The boundary

Permanent, in `infra/boundary.ts`, `infra/rtfm.ts` and `infra/toolkit-stack.ts`
(`infra/README.md` › The boundary):

- **Web Functions `rtfm-*`** join RTFM's resources, with their revisions and endpoints; the
  staging bucket lets `lambda.amazonaws.com` read code and its versions for a revision of one in
  this account, and the execution role reads object versions too.
- **Denied:** `lambda:PutResourcePolicy` on `*` (a whole resource policy could grant anyone
  anything); `lambda:AddPermission` on `*`, as before; a Web Function endpoint created with any
  auth type but `IamAuth`; a Web Function made, or an endpoint changed, giving any auth type but
  `IamAuth`. A request giving none passes, which is how CloudFormation makes a Web Function; the
  API requires an endpoint's auth type.
- **The user's stacks are a prefix**, `RtfmEdge*`, beside `RtfmAccess` and `RtfmToolkit`: RTFM's
  roles may only read them, so new edge stacks need no toolkit redeploy. No app stack may be named
  with it (a test checks).
- Not denied: `lambda:PutFunctionConcurrency`, which could reserve most of the account's shared
  concurrency; a reserved-concurrency cap may later be a cost guard.

## Cost

**At idle:** DynamoDB storage under 1 MB (free tier), log storage, CloudFront at no requests, and
the Web Function's environments while they live: about $0 if they go away, up to the figures in
"The idle-cost risk" if they don't.

**Around the $20 cap** (about 2,000–2,800 sections of Haiku 4.5): Web Function requests and CPU
about $0.01, DynamoDB about $0.06, logs about $0.05, CloudFront $0 (free tier), plus memory.

## Build tasks

Draft blocks for `WORKLIST.md`, in order. Each task that changes `RtfmAccess`, `RtfmToolkit` or an
`RtfmEdge*` stack needs the user's approval, and the user deploys it. Only IN.10 needs the
deployed app, since measuring it is the task; every other task's **Done when** holds on this
machine (`ARCHITECTURE.md` › Everything runs on one machine).

### IN.7 — Let `rtfm-read` see a Web Function
- **Depends on:** IN.4
- **Files:** `infra/access-stack.ts` and its test, `infra/README.md`
- **Do:** `rtfm-read` gains reading the Web Functions `rtfm-*`, their revisions, endpoints and
  resource policy (`lambda:GetWebFunction`, `GetWebFunctionRevision`, `GetWebFunctionEndpoint`,
  `ListWebFunctionEndpoints`, `ListWebFunctionRevisions`, `GetResourcePolicy`), and describing the
  stacks `RtfmEdge*` in us-east-1 too, where the certificate's stack is (`RtfmAccess`, which the
  user approves and deploys). Its log reads already cover `/rtfm/*`.
- **Done when:** the tests show `rtfm-read` reads those and changes nothing, `infra/README.md` ›
  The identities says so, and the user has deployed `RtfmAccess`.

### IN.8 — Put the app on a Web Function
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
- **Done when:** the entry passes its tests locally (streams, a `POST`, a disconnect aborting a
  run, the origin check, the static app), `RtfmApp` synthesizes and passes its tests, and the
  smoke check's new commands are in `infra/README.md`.

### IN.9 — Put the app at rtfm.moonfetus.com
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
- **Depends on:** IN.10
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
- **Depends on:** IN.11
- **Files:** `server/writer/**`, `server/storage/**`, `server/api/**`, `server/app.ts`,
  `server/writer/README.md`
- **Do:** section leases behind an interface in `runs.ts`, in memory locally and on the section
  item in `rtfm-app`; a reader on another environment waits for the stored body, then gets it as
  one `append` and `written`, or `failed`.
- **Done when:** the shared suite covers two runs racing for one section on both implementations.

### IN.14 — `rtfm-ops` and the ops tools
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

## Sources

All read 2026-10-13.

- AWS, Lambda Web Functions: https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html, with
  its pages Core concepts (`web-functions-how-it-works.html`), Scaling behavior
  (`web-functions-scaling.html`), Execution environment lifecycle
  (`web-functions-env-lifecycle.html`), HTTP requests and responses (`web-functions-http.html`),
  Request timeout (`web-functions-revisions-timeout.html`), Runtimes
  (`web-functions-runtimes.html`), Endpoint access control
  (`web-functions-endpoint-access-control.html`), Permissions (`web-functions-permissions.html`),
  Deploying code from S3 (`web-functions-code-s3.html`) and Troubleshooting
  (`web-functions-troubleshooting.html`)
- AWS News Blog, "Announcing AWS Lambda Web Functions" (2026-10-12):
  https://aws.amazon.com/blogs/aws/announcing-aws-lambda-web-functions-for-fast-consistent-web-app-performance-anywhere/
- AWS Lambda pricing (Web Functions, Event Functions, response streaming):
  https://aws.amazon.com/lambda/pricing/
- AWS Lambda Web Adapter (function URLs, `AWS_LWA_INVOKE_MODE=response_stream`, layer setup):
  https://github.com/awslabs/aws-lambda-web-adapter
- AWS, Response streaming for Lambda Event Functions (a broken client connection doesn't stop a
  stream): https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
- CloudFront, Restrict access to a Lambda function URL origin (the body hash for `POST`):
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
- CloudFront, Restrict access to a Lambda Web Function origin:
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda-web.html
- CloudFront, Origin settings (response timeout, connection attempts):
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html
- CloudFront, CreateDistributionWithTags (needs `CreateDistribution` and `TagResource`):
  https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CreateDistributionWithTags.html
- API Gateway, Stream the integration response:
  https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html, and
  Choose between REST APIs and HTTP APIs (response streaming: REST only):
  https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html
- DynamoDB on-demand pricing: https://aws.amazon.com/dynamodb/pricing/on-demand/
- The Service Authorization Reference as JSON, for CloudFront's and Lambda's actions, resources
  and condition keys: https://servicereference.us-east-1.amazonaws.com/v1/cloudfront/cloudfront.json
  and https://servicereference.us-east-1.amazonaws.com/v1/lambda/lambda.json
- CloudFormation's resource schemas for us-west-2 (`AWS::Lambda::WebFunction*`,
  `…::ResourcePolicy`, `AWS::CloudFront::Distribution`):
  https://schema.cloudformation.us-west-2.amazonaws.com/CloudformationSchema.zip
- `@aws-sdk/client-lambda-web` 3.1151.0 (an endpoint's `authType` is required):
  https://unpkg.com/@aws-sdk/client-lambda-web@3.1151.0/dist-types/commands/CreateWebFunctionCommand.d.ts
- EC2, Lightsail and Fargate prices are approximate, from memory of their pricing pages; they
  only set option D's order of magnitude.
- RTFM: `ARCHITECTURE.md`, `server/api/README.md`, `server/writer/README.md`,
  `server/gateway/README.md`, `server/storage/README.md`, `infra/README.md`,
  `research/lambda-and-dynamodb.md`, `research/aws-hosting.md`
