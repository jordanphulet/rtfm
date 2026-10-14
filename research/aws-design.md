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
boundary has the boundary, and the tasks in `WORKLIST.md` (Build tasks, below) put the rest
into what they govern.

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

Measured, they do go away: Lambda removes an idle environment within minutes (Measured, below).
**If the cost passes $10 a month, RTFM moves to B.**

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
the Web Function's environments while they live, which is only minutes after the last request
(Measured, below): about $0.

**Around the $20 cap** (about 2,000–2,800 sections of Haiku 4.5): Web Function requests and CPU
about $0.01, DynamoDB about $0.06, logs about $0.05, CloudFront $0 (free tier), plus memory.

## Measured

Measured 2026-10-13 and 2026-10-14 (UTC) on the deployed app with the fake models, revision
`rev-rxago` (and, for the later lifetimes, the revisions deployed after it), through
`https://rtfm.moonfetus.com` from CloudFront's Denver edge (`DEN52`), with `curl` and the throwaway
passcode's cookie; the server's side from `/rtfm/app`. Each response's `lambda-web-logstream`
header names the environment that served it, and Lambda's own events in the log
(`platform.initStart`, `invokeSummary` once a minute, `spinDownStart`) show each environment's
life.

**Events arrive one by one.** A section stream (`anatomy-of-a-scare`) sent 132 `append` events,
then `written`, over 12.7s. They arrived 84ms apart on average, at most 118ms, which is the fake
model's 85ms pace: neither CloudFront nor Lambda batches small writes.

**The headers wait for the first byte.** Locally the stream's headers arrive in 6ms; through the
edge they arrive with the first event, 1.4–1.6s later (the fake writer waits 1.2s before its first
chunk), and the librarian's with its first event at 0.78s. Something on the path, Lambda's endpoint
or CloudFront, holds the headers until the body's first byte, so a silent stream shows nothing
until its first event or heartbeat, and CloudFront's 60s read timeout runs until then.

**The heartbeat: not seen.** No fake stream lasts 15s: the longest unwritten section plays in
about 13s, and a librarian reply in about 3s. Since 100-byte `append` writes pass through at once,
a 13-byte heartbeat should too, but seeing one needs a stream longer than 15s, which only Bedrock
gives.

**A `POST` with a body.** The librarian answered "list my manuals" with 200, its first event at
0.78s and `done` at 3.0s. A conversation of 80 KB (ten earlier exchanges of 3,990 characters) also
got 200 and its reply: the Web Function needs no body hash behind the origin access control.

**A disconnect aborts the run.** `curl --max-time 3` on `bodies-that-move` left after 3.0s; the log
shows `model.call` `outcome: "aborted"` and `section.aborted` ("every reader left") 3.08s after
`section.started`, and the section stayed unwritten.

**The cold start.** With no environment running, a section stream's first byte took 2.27s, against
1.37–1.60s warm, and a section's JSON 1.07s, against 0.29s warm: a cold start adds about 0.8s.
Lambda's `initStart` came 0.85s after `curl` started, and `platform.initReport` gives 447–678ms
from the start of the runtime to the server listening.

**How long an environment lives.** Lambda scales to zero, and removes an idle environment within
minutes, with `SIGTERM`: each removal logs `spinDownStart`, then the server's own `server.stopped`
in the same millisecond, then `spinDownReport`.

| Environment | Started | Last request ended | `SIGTERM` | Idle | Lived | Requests |
| --- | --- | --- | --- | --- | --- | --- |
| `172cf338` (first, by the smoke check) | 23:50:32 | 23:59:50 | 00:06:21 | 6m31s | 15m49s | 31 |
| `3b67cd24` (a second, while the first was busy) | 23:54:10 | 23:55:39 | 23:57:21 | 1m41s | 3m11s | 4 |
| `0bf0c596` (cold, for one section) | 00:10:24 | 00:10:36 | 00:16:21 | 5m44s | 5m57s | 1 |
| `7e8d93ca` (cold, for a section's JSON) | 00:24:05 | 00:28:40 | 00:34:06 | 5m26s | 10m01s | 3 |
| `d1ad3611` (`rev-spqhj`) | 00:37:03 | 00:39:51 | 00:44:53 | 5m02s | 7m50s | 3 |
| `e98a30a9` (`rev-up5bx`, a deploy's smoke check) | 00:49:42 | 00:49:44 | 00:56:15 | 6m31s | 6m33s | 4 |
| `c3d6abcf` (`rev-o98kt`, a reader) | 00:53:00 | 00:58:06 | 01:04:42 | 6m36s | 11m42s | 29 |

- Three deploys changed the endpoint's revision meanwhile (`RtfmApp`'s stack events): to
  `rev-spqhj` at 00:30:06, `rev-up5bx` at 00:49:14 and `rev-o98kt` at 00:52:34, each deleting the
  revision before. `7e8d93ca`'s revision left the endpoint at 00:30:06, 4 minutes before it
  stopped, and `e98a30a9`'s at 00:52:34, so those two stops may be the deploys', and the lifetimes
  below leave them out. `d1ad3611` stopped at 00:44:53, before the next deploy began at 00:49.
- The last environment running goes 5–6½ minutes after its last request (`172cf338`, `0bf0c596`,
  `d1ad3611`, `c3d6abcf`); a second one, beside a busy first, went after under 2 minutes. An
  environment idle for 2m10s was kept.
- The longest life was 15m49s, for 31 requests in 9 minutes. An environment lives as long as
  requests keep coming less than about 5 minutes apart, and no upper bound showed.
- An idle environment uses 70–93ms of CPU a minute (`invokeSummary`), and up to 201 MB of its
  2 GB.
- So the idle-cost risk above doesn't arise: memory is billed until about 6 minutes after the last
  request, not around the clock. A 16-minute environment's memory is about $0.007 (2 GB for 949s).
- Visitors other than RTFM's reader start environments too: a `GET /robots.txt` at 00:37, likely a
  crawler's, started `d1ad3611`.

**The credentials.** Every `server.started` logged `credentials: "environment"`: Lambda gives the
execution role's keys as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`, and
no container credentials endpoint. It doesn't set `AWS_CREDENTIAL_EXPIRATION` (The keys' expiry,
below), and the Web Function docs neither name the variable nor say how long the keys last or how
they are renewed. `/rtfm/app` holds no `ExpiredToken`, `UnrecognizedClient` or
`AccessDenied` error: no environment measured here, the longest living 15m49s, outlived its keys.
A busy one could: nothing seen bounds an environment's life while a reader keeps opening sections
a few minutes apart, the docs promise no lifetime either way, and keys in its environment variables
can't be renewed inside a running process. Once they expire, every DynamoDB call that environment
makes fails until Lambda removes it.

**The keys' expiry.** Measured 2026-10-14 (UTC), read with `npm run ops -- logs` at 02:54 over the
whole of `/rtfm/app`, whose first entry is the first deploy's at 2026-10-13T23:50:33. Since IN.21's
deploy, every `server.started` logs `credentialsExpireAt=unset`: nine starts, from 01:40:34 to
02:51:23, all with `credentials=environment`, the last one with the Bedrock models. So Lambda
doesn't set `AWS_CREDENTIAL_EXPIRATION`, the server sets no `server.keys-expiring` timer, and only a
refused key starts a replacement (`server/README.md` › The Web Function). The log holds no
`server.keys-refused` or `server.keys-expiring` line, and no warning naming `ExpiredTokenException`,
`UnrecognizedClientException` or `AccessDenied`: no environment has been refused its keys. The
server's entries don't say which environment wrote them, so where two overlap, each `server.stopped`
below is paired with the start it leaves 5–6½ minutes idle after its last request, as above; deploys
in this range may have stopped some early.

| Started | Stopped | Lived |
| --- | --- | --- |
| 01:40:34 | 01:46:32 | 5m57s |
| 01:43:00 | 01:49:01 | 6m01s |
| 01:49:49 | 01:55:01 | 5m12s |
| 01:52:12 | 01:58:55 | 6m43s |
| 02:07:21 | 02:13:55 | 6m34s |
| 02:10:46 (a reader, until 02:17:43) | 02:23:44 | 12m57s |
| 02:27:46 (alone) | 02:43:21 | 15m35s |
| 02:49:58, 02:51:23 | running at 02:54 | |

The longest was 15m35s, or 16m22s if the 02:07 and 02:10 environments stopped the other way round:
about IN.10's 15m49s. With no expiry given, the log bounds the keys' lifetime only from below: they
outlasted every environment's life.

## Build tasks

The work that puts this design into what it governs is planned as the tasks in `WORKLIST.md` ›
Into AWS.

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
