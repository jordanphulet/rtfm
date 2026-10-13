# RTFM in AWS: the design

Research, written 2026-10-13. Every source was read on 2026-10-13. The only AWS calls were
read-only ones through `npm run aws` (the status of `RtfmToolkit` and `RtfmApp`).

**Status (2026-10-13):** nothing here is adopted; it is under review. This is the first stage:
what the deployed app must do, the options weighed against it, and the spikes that will settle
what the docs leave open. The spikes need the boundary change in "The boundary change", which
the user approves and deploys before any spike runs, and an edge stack the user deploys. Their
results and the recommendation go into this doc once they have run.

## What the deployed app must do

Read from the local server as it is (`server/api/README.md`, `server/writer/README.md`,
`server/gateway/README.md`, `server/storage/README.md`).

### Routes and their streams

| Route | Shape | What it needs from the front door |
| --- | --- | --- |
| `GET /api/manuals`, `GET /api/manuals/:id`, `GET …/sections/:sectionId` | JSON | Nothing cached: statuses change while sections are written |
| `DELETE /api/manuals/:id` | `204`, `404` or `409` | No body |
| `GET …/sections/:sectionId/stream` | Server-sent events, opened by `EventSource` | Streams event by event; `EventSource` sends no custom header, only cookies; the browser never reconnects |
| `POST /api/librarian` | JSON body in, server-sent events out, read with `fetch` | A body up to 256 KiB, and the response streamed back |
| `POST /api/client-errors` | JSON body, `204` | A body |
| `POST /api/passcode` | JSON body, `204` with `Set-Cookie` | A body; the cookie reaches the browser |
| `/`, `/read/<manual>`, `/read/<manual>/<section>` | The built app (Vite) | Every route serves `index.html` |

- **Silences inside a stream.** A section stream's first event can wait for the first whole
  paragraph. The librarian's stream can be silent while the planner writes its largest tool
  parameter: about 26s measured, inside the planner's 60s idle timeout
  (`server/gateway/README.md` › The Bedrock client). A librarian reply takes up to 8 model turns.
- **A stream may not be retried.** A repeated section-stream `GET` starts a run or joins one, and
  a repeated librarian `POST` pays for a second reply.

### One writer per section, with joiners

`writer/runs.ts` keeps one run per section in a `Map` in the process. The first reader starts it;
a later reader joins, gets the text written until then as one `append` at offset 0, then the same events as
everyone else. Finished runs stay in the map as `written` to close the gap between reading
storage and a run finishing. `isWriting` and `writingSectionIds` read the map.

### Abort on the last disconnect

When the last listener of a run disconnects, the run is aborted at once, which aborts the Bedrock
call. The gateway charges an aborted call its full `max_tokens` and marks it estimated. This
needs the server to see a client leave, as `res.on("close")` does in the Node adapter.

### The caps, across instances

The gateway reserves each call's worst case against the daily ($2) and monthly ($20) caps in one
synchronous step on totals in its own memory, replayed from the ledger on start. That holds only
for one process, which the data folder's lock enforces. Any design with more than one process
needs the check and the reservation to be one atomic step in shared storage. The concurrency
limits (3 section runs, 5 model calls) are per process; they protect the process, not the budget.

### The passcode

With `RTFM_PASSCODE` set, every request but `POST /api/passcode` needs the `rtfm_passcode` cookie
(`HttpOnly; SameSite=Strict; Path=/api`, and `Secure` when the `Host` isn't local). The reader's
`EventSource` sends it because the stream is same-origin. So the app and the API must share one
origin, and the front door must forward the `Cookie` header and the `Set-Cookie` response. The
passcode must not sit in a template or anything `rtfm-read` can read.

### Only the app's own pages

The Node adapter refuses a `Host` that isn't this machine, an `Origin` that isn't a page on this
machine, and a body that isn't `application/json`. Deployed, the `Host` is whatever the front
door sends, and the allowed `Origin` is the app's public origin.

### The kill switch

`.data/STOP` refuses every new model call at once, with no restart, checked before each call.
Deployed, it has to be something the user can flip without a deploy, read by every instance.

### Idle cost

Nobody uses the app most of the time. At idle it should cost nothing but storage, and every
dollar should be counted by the `rtfm-monthly` budget (the `project=rtfm` tag).

### Storage

`ManualStore` and `UsageLedger` (`server/storage/types.ts`): a manual is never replaced
(`createManual` answers `exists`); a body is saved once (`saveBody` answers `already-written`)
and only while its manual exists; deleting a manual removes its sections; the ledger is
append-only and read by month. A section body is under about 10 KB (`max_tokens` 2048).

## The front door and compute

### A. CloudFront and a Lambda Web Function, behind origin access control

**Lambda Web Functions** were announced on 2026-10-12, in five regions including us-west-2. A Web
Function runs an ordinary Node.js HTTP server that listens on the address in
`AWS_LAMBDA_HTTP_ENDPOINT`, on Node.js 24 on Arm64. What matters for RTFM:

- **One environment serves many requests at once** (`maxConcurrencyPerEnvironment`, 1–128,
  default 64). So two tabs on one section usually share one process, as they do locally.
- **It scales to zero.** No minimum, no reserved environments. An environment that goes away
  gets `SIGTERM` and 1 second.
- **More than one environment can run.** `maxEnvironments` is 2 or more (its minimum is 2), and
  Lambda may briefly run past it "during revision weight changes, internal fleet cycling, and
  other operational events". Lambda also starts environments ahead of demand to keep headroom.
  So nothing may rely on there being one process.
- **Streaming needs no adapter**: the server writes its response as it goes. A request may run
  up to `timeoutSeconds` (3–900, default 30), which bounds a whole stream.
- **Billing:** $0.30 per million requests, $0.0000276944 per active vCPU-second, and
  $0.0000036667 per GB-second of memory "for as long as it runs, including time between
  requests" (us-east-1 list prices; the pricing page lists no others). Each environment has 2 GB;
  the pricing examples bill 0.14–0.50 GB of memory consumed. No free tier is listed. How long an
  idle environment lives before it is removed isn't documented.
- **CloudFront in front, with OAC:** the endpoint's auth type is `IamAuth`; an origin access
  control with signing behavior `always-amz-auth` signs each request; the Web Function's resource
  policy lets `cloudfront.amazonaws.com` invoke the endpoint with an `aws:SourceArn` condition
  naming the distribution. **A `POST` body needs no hash**: CloudFront signs with
  `UNSIGNED-PAYLOAD`. The origin request policy must not forward the viewer's `Host`
  (`AllViewerExceptHostHeader`).
- **IAM can scope it**: a Web Function's ARN carries its name (`web-function/<name>`, with
  `/revision/<id>` and `/endpoint/<name>` under it), so `rtfm-*` names it. The condition key
  `lambda:Request/WebFunctionAuthType` lets the boundary refuse any auth type but `IamAuth`, and
  Lambda refuses a public resource policy itself. A resource policy can still name another
  account, so the boundary denies `lambda:PutResourcePolicy`, and the policy that lets CloudFront
  in belongs to a stack the user deploys.
- **CloudFormation has it** in us-west-2: `AWS::Lambda::WebFunction`, `…WebFunctionRevision`,
  `…WebFunctionEndpoint`, with `AWS::Lambda::ResourcePolicy` for the policy. The CDK in this repo
  (2.273.0) has their L1 constructs. A revision's code is a zip in a versioned S3 bucket, which
  Lambda reads as its own service principal, so the bucket's policy must let it.
- **Logs** go to a log group the revision names, plus a `.local` companion in each region.

Against the list:

| Need | How it holds |
| --- | --- |
| Routes and streams | The server unchanged behind one domain; CloudFront forwards cookies and bodies |
| One writer, joiners | In the process, as now, when readers share an environment; across environments it needs a lease in storage (below) |
| Abort on disconnect | A real HTTP server, so `close` should fire when CloudFront closes the origin connection: **spike 3** |
| Caps across instances | Atomic counters in DynamoDB (below) |
| Passcode | Same origin; the cookie passes through CloudFront |
| Own pages only | The `Host` is the endpoint's domain; the allowed `Origin` becomes configuration |
| Kill switch | An item in DynamoDB; and, for the whole app, the endpoint's `rateLimit` set to 0 |
| Idle cost | Scales to zero; memory is billed while an environment lives: **spike 4** measures how long |
| Runs outside AWS | Almost all of it: the AWS-only code is the entry that listens on `AWS_LAMBDA_HTTP_ENDPOINT` and the storage adapters |

Risks: it is one day old, and the docs leave open how long an idle environment lives and how
fast a cold start is. The spikes measure both.

### B. CloudFront and a streaming Lambda function URL, behind OAC

The task's first candidate, and what a Lambda function was until Web Functions: one invocation
per request, each in its own execution environment (an "Event Function" in the new naming).

- **Streaming** through `awslambda.streamifyResponse` and a function URL with
  `InvokeMode: RESPONSE_STREAM`, up to 200 MB and 15 minutes.
- **Disconnects:** "streamed responses are not interrupted or stopped when the invoking client
  connection is broken. Customers are billed for the full function duration." Whether the
  handler can see the disconnect at all is **spike 3**.
- **A `POST` body must be hashed by the browser**: with OAC, "your users must compute the SHA256
  of the body and include the payload hash value of the request body in the
  `x-amz-content-sha256` header"; Lambda doesn't support unsigned payloads. `apiFetch` would hash
  every body with `crypto.subtle`. **Spike 2** checks both ways.
- **Two permissions**, both for `cloudfront.amazonaws.com` with the distribution as `SourceArn`:
  `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` (with `InvokedViaFunctionUrl`).
  `lambda:AddPermission` has no condition key for the source, so the boundary denies it, and the
  permissions belong to a stack the user deploys.
- **Every request is its own environment**, so two readers of one section are always in two
  processes: joiners always go through storage, and the in-process runs map never helps.
- **Cost:** within the free tier (1M requests, 400,000 GB-seconds a month) at RTFM's scale; a
  15s section stream at 1 GB is 15 GB-seconds.

It meets the list, but with the most AWS-only code: an event adapter in place of the Node
adapter, browser-side body hashing, and every joiner through storage.

### C. API Gateway REST with response streaming

It exists: REST APIs stream a proxy integration's response when the integration's
`responseTransferMode` is `STREAM` (all endpoint types; not HTTP APIs). For Lambda it calls
`InvokeWithResponseStream`, and the function must write a JSON head, 8 null bytes, then the body.
Streams last up to 15 minutes, with an idle timeout of 5 minutes (Regional) or 30 seconds
(edge-optimized). No caching, compression or response mapping while streaming. When the
connection closes, "the Lambda function might continue to execute".

Against the list it is B with more in front: the same one-request-per-environment function, its
own response format, a second per-request charge, and an `execute-api` domain that still needs
CloudFront to share an origin with the app. API IDs are assigned by AWS, so the boundary could
scope them only by tag. Nothing on the list is better here than in A or B.

### D. One always-on Node instance

The server as it is, files and all, on one machine: EC2 (a `t4g.nano` is about $3/month, plus
$3.65/month for a public IPv4 address and about $0.64 for an 8 GB volume), Lightsail (about
$5/month with IPv4), or Fargate (about $9/month for 0.25 vCPU, before a load balancer).

- **It meets the list with the fewest code changes:** one process, so the runs map, the caps in
  memory, the data folder's lock and the `STOP` file all hold. It needs TLS (CloudFront in front,
  or a proxy on the machine), a public `Host` and `Origin` in the local-only checks, and backups
  of its disk.
- **But it never idles:** $5–9 a month before anyone reads anything, 25–45% of the $20 a month
  the gateway allows for models.
- **And it is a machine to run:** OS patches, Node updates, disk snapshots.
- **The boundary can't name it.** Instances, volumes, security groups and network interfaces get
  IDs from AWS, and running an instance touches the VPC; scoping by tag is possible but wide.

### Ruled out

- **API Gateway HTTP API:** it has no response streaming (the REST/HTTP comparison lists response
  streaming for REST APIs only), so neither stream works.
- **AppSync:** its streaming is GraphQL subscriptions or Event API channels over WebSockets. The
  reader's `EventSource` streams and the librarian's `POST` would be replaced by a different
  contract, and the server's routes by resolvers, so nothing of the local API would carry over.

## Storage: DynamoDB alone, or with S3 for bodies

**DynamoDB alone** fits:

- A body under 10 KB is far below the 400 KB item limit.
- `saveBody` is one `TransactWriteItems`: a `Put` of the section item with
  `attribute_not_exists(body)`, and a `ConditionCheck` that the manual item exists. Atomic, so a
  deleted manual never gains a section. It costs 2 write units per KB: about 20 for a 10 KB body,
  $0.0000125 at $0.625 per million.
- `createManual` is a `Put` with `attribute_not_exists`. Deleting a manual deletes its manual item
  first, then its sections, as `research/lambda-and-dynamodb.md` lays out.
- `writtenSectionIds` is a `Query` of the manual's partition. A query reads whole items, so a
  manual's bodies are read too: 3 read units per 10 KB section strongly consistent, about $0.00001
  for a 30-section manual. Pages over 1 MB need the query's paging.

**DynamoDB plus S3 for bodies** gains nothing at this size and loses atomicity: S3's conditional
`If-None-Match: *` makes the put once-only, but nothing makes it conditional on the manual item in
DynamoDB, so a delete can race a save and leave an orphan body. Deleting a manual also lists and
deletes objects. It would matter only for bodies near 400 KB.

So: DynamoDB alone, on-demand, `project=rtfm`-tagged, named `rtfm-*`.

## How much runs outside AWS

`ARCHITECTURE.md` › Everything runs on one machine asks that every AWS service sit behind an
interface with a local implementation, the local one the default, each pair under one shared test
suite. Option A keeps the AWS-only code to adapters; this is where it changes a shared interface:

| Interface | Local implementation | AWS implementation | Changes to shared code |
| --- | --- | --- | --- |
| `ManualStore` | files (as now) | DynamoDB table `rtfm-library` | none to the interface |
| `UsageLedger` | JSON lines (as now) | DynamoDB table `rtfm-usage`, key `month` + `reservedAt#callId` | none |
| Spending totals (new, out of `gateway.ts`) | in memory, replayed from the ledger, one process per data folder (as now) | counter items `day#…`, `month#…` in `rtfm-usage`: reserving updates both in one transaction, each on the condition `committed <= cap − worstCase` (DynamoDB conditions can't add) | the gateway reserves and settles through it |
| Kill switch (new, out of `gateway.ts`) | `.data/STOP` | an item in `rtfm-usage`, read before each call | the gateway asks it |
| Section leases (new, out of `runs.ts`) | in memory: the runs map | a lease on the section item, taken with a conditional update and renewed while the run lives | a reader on another environment waits for the lease to end, then gets the stored body as one `append` and `written`, or `failed` |
| Secrets and keys | `.env.local` | the execution role's credentials; the passcode from SSM `/rtfm/passcode` | `credentials.ts` gains the AWS source |
| Where the server listens, and whom it answers | `127.0.0.1`, local `Host` and `Origin` | `AWS_LAMBDA_HTTP_ENDPOINT`; the endpoint's `Host`; the app's public origin | the Node adapter's checks take allowed hosts and origins from config |
| Logs | standard output and the data folder | standard output (CloudWatch) | the entry chooses the sinks |
| The built app | Vite | the same server serves `dist/`, and CloudFront caches `/assets/*` | a static route in the server |

- Locally the same code runs: a run takes its lease from the in-memory implementation, which
  always grants it, and the joiner path through storage is exercised by the shared suite.
- The DynamoDB adapters' shared suites run against DynamoDB Local on loopback (Java is on this
  machine), so `npm test` still needs no network and no credentials.
- The Web Function's entry is the only file that knows it is in Lambda.

Option B would add an event adapter beside the Node adapter, body hashing in `apiFetch`, and
leases on every joined section. Option D changes almost nothing, at its idle cost.

## The leaning, before the spikes

Option A with DynamoDB alone: the server stays an HTTP server, streams and disconnects behave as
they do locally, it scales to zero, and its AWS-only code is its entry and the storage adapters.
Option B is the fallback if Web Functions fail a spike. The spikes run both behind one
distribution, so they compare directly.

## The spikes

### What the spike stacks hold

Two throwaway stacks, every resource named `rtfm-spike-*` or `/rtfm/spike/*`.

**`RtfmSpike`** (`infra/spike/spike-stack.ts`) deploys through the bootstrap, under the boundary,
and is in the CDK app only when asked for (`-c spike=true`):

- **`rtfm-spike-web`**, a Web Function: one revision (Node.js 24, `timeoutSeconds` 300), one
  `HomeRegion` endpoint `live` with `IamAuth` and `maxEnvironments` 2, its role
  `rtfm-spike-web-role` under the boundary, and its log groups `/rtfm/spike/web` and
  `/rtfm/spike/web.local` (1 day, deleted with the stack).
- **`rtfm-spike-function-url`**, a streaming function (Node.js 24, Arm64, 1,024 MB, 300s) behind a
  function URL with `AWS_IAM` and `RESPONSE_STREAM`; its role `rtfm-spike-function-url-role`;
  its log group `/rtfm/spike/function-url`.
- **`rtfm-spike-probe`**, an on-demand DynamoDB table with nothing in it, which each function
  reads once at start to time the SDK's first call (and to learn whether the runtime has it).

Nothing in it lets anything invoke either function: both answer only signed requests.

**`RtfmSpikeEdge`** (`infra/spike/edge-stack.ts`) is the user's, deployed from CloudShell with
`LegacyStackSynthesizer`, like `RtfmAccess`, after `RtfmSpike` and deleted before it. It takes the
two functions' names and domains as parameters (the names must match `rtfm-spike-*`), and holds:

- **one CloudFront distribution**, tagged `project=rtfm`: `/fn/*` goes to the function URL,
  everything else to the Web Function. Both origins have one connection attempt (CloudFront
  retries a `GET` that times out, which would start a second paid run), a 60s read timeout, no
  caching (`CachingDisabled`) and every viewer header but `Host` (`AllViewerExceptHostHeader`);
- **two origin access controls**, `rtfm-spike-web-function` (`always-amz-auth`, the only signing
  a Web Function accepts) and `rtfm-spike-function-url` (`always`);
- **the Web Function's resource policy** and **the function URL's two permissions**
  (`lambda:InvokeFunctionUrl`, and `lambda:InvokeFunction` with `InvokedViaFunctionUrl`), each for
  `cloudfront.amazonaws.com` with `aws:SourceArn` equal to that distribution.

These are the user's because the boundary can't keep them to RTFM: distributions and origin
access controls get IDs from AWS, tag conditions can't stop a role from tagging another project's
distribution `project=rtfm` by its ID or from fronting another project's origin, and a function
permission or resource policy can name any source or account.

**What runs in the functions** is RTFM's real server (`server/app.ts`), with the fake models
only: no Bedrock call is made, so the spikes cost only AWS request time. `infra/spike/build.ts`
bundles it, with the seed manuals, into each function's code; each environment seeds its own data
folder in `/tmp`. A thin wrapper in front of it (`infra/spike/real-server.ts`) rewrites the
`Host` and `Origin` to loopback, since the server's local-only checks would refuse CloudFront's,
and logs what each request carried instead. The spike's passcode is a fixed, non-secret value, so
the cookie path is exercised.

- The Web Function's entry (`web-entry.ts`) listens on `AWS_LAMBDA_HTTP_ENDPOINT`, sends `/api`
  to the server and serves the built app for everything else, and logs when a client leaves
  before its response ends and the environment's lifetime at `SIGTERM`.
- The function URL's entry (`function-url-entry.ts`) is a `streamifyResponse` handler that sends
  the request to the server and streams the answer back, and logs when, if ever, the runtime's
  stream says the client left.
- The auth-type probe (`auth-probe.ts`) runs once in each Web Function environment, as its role
  under the boundary (below).

Both entries were run on this machine (the Web Function's as a plain Node server, the function
URL's under a stub of the runtime): passcode, library, a section stream, a disconnect that aborts
the run, and a librarian reply all behaved.

### What each spike measures

1. **SSE through the front door.** Open an unwritten section's stream through the distribution
   on both origins, timing each event's arrival with a small script: events must arrive one by
   one (about 85 ms apart), not at the end. Then open the app at the distribution's address in a
   browser, enter the passcode, and read a section: `EventSource` with the cookie, end to end.
2. **A `POST` with a body.** The passcode and a librarian reply, on both origins: the Web
   Function with no hash header; the function URL without `x-amz-content-sha256` (expected
   `403`) and with it. In the browser, the librarian through the Web Function.
3. **Whether Lambda sees a client disconnect.** Cut a section stream after 2s on each origin,
   then read the logs: the Web Function should log `spike.client-left` and `section.aborted`;
   the function URL logs `spike.stream-closed` if the runtime says so, or else writes the whole
   section. Record how long after the cut each one learns of it.
4. **Cold start to open a section.** The time to the first byte of a section stream on a new
   environment, from the client, with the server's own `msSinceStart` (the Web Function) and
   `Init Duration` (the function URL). Repeat after the Web Function's environments have gone
   (its `SIGTERM` log gives how long an idle one lived, which sets its idle memory cost).
5. **What a missing auth type does.** The boundary refuses a Web Function or endpoint update that
   gives any auth type but `IamAuth`, but can't refuse one that gives none, which is what
   CloudFormation sends when it makes a Web Function (its endpoints are separate resources). The
   API's model says an endpoint's `authType` is required. The probe asks Lambda, as the spike's
   role, for a Web Function `rtfm-spike-auth-probe` with an endpoint and no auth type, then with
   `ApplicationManaged`, and logs each answer: expected a validation error for the first and
   `AccessDenied` for the second. Anything it makes, it deletes at once. If the first makes a
   public endpoint, the boundary needs to refuse `CreateWebFunction` with an endpoint some other
   way before any Web Function is adopted.

It also checks that each origin refuses a request that doesn't come through CloudFront (`403`
straight to the endpoint and the URL), and records the headers that arrive (`Origin`, `Host`,
`Sec-Fetch-Site`, `X-Forwarded-*`), which decide how the deployed server checks its own pages.

### What the spikes cost

All at list prices, with the fake models (no Bedrock):

| Item | Expected | At most |
| --- | --- | --- |
| CloudFront: a few hundred requests, a few MB | $0 (always-free tier: 10M requests, 1 TB) | $0.01 |
| Web Function: under 1,000 requests, seconds of CPU, memory while environments live (2 for up to 3 hours) | $0.02 | $0.25 (if billed at the full 2 GB) |
| Function URL: a few hundred invocations of up to 30s at 1 GB | $0 (free tier) | $0.10 |
| DynamoDB, CloudWatch Logs, S3 for the code | under $0.01 | $0.02 |
| **Total** | **about $0.03** | **under $0.40** |

## The boundary change

In `infra/boundary.ts`, `infra/rtfm.ts` and `infra/toolkit-stack.ts`, with tests; the user
deploys it by redeploying `RtfmToolkit`.

**Permanent, kept when the spike's part is withdrawn:**

- **`lambda:PutResourcePolicy` is denied on `*`.** It attaches a whole resource policy to a
  function or a Web Function, so it could grant CloudFront with no source condition, or another
  account anything the policy names, such as changing a Web Function endpoint to
  `ApplicationManaged` from outside the boundary. This closes a hole in the boundary as it is
  deployed: `lambda:*` on `function:rtfm-*` allows it there.
- **Web Function auth types:** creating an endpoint is denied unless its auth type is `IamAuth`;
  creating a Web Function or updating an endpoint is denied when it gives any auth type but
  `IamAuth` (a `Null` check that the key is there, and `StringNotEquals`). `IfExists` would also
  refuse a request with no auth type, which is how CloudFormation creates a Web Function, so it
  isn't used; spike 5 checks what Lambda does with a missing one.
- **`s3:GetObjectVersion` on the staging bucket's objects**, beside `s3:GetObject`: a Web Function
  revision is made from a version of its code's object.
- **The deploy role may only read every stack the user deploys** (`USER_STACKS`), and the boundary
  denies everything on them. During the spike that list includes `RtfmSpikeEdge`.
- `lambda:AddPermission` stays denied for everyone, as it is.

**For the spike, withdrawn after it:**

- `lambda:*` on Web Functions `rtfm-spike-*` and everything under them, less the denials above;
- in `RtfmToolkit`, a statement in the staging bucket's policy letting `lambda.amazonaws.com` read
  objects and their versions, only for a revision of a Web Function `rtfm-spike-*` in this account
  (`aws:SourceArn` and `aws:SourceAccount`): Lambda reads a revision's code as its own principal;
- `RtfmSpikeEdge` in `USER_STACKS`.

The boundary has no CloudFront permission at all.

**What it still can't stop:** `lambda:*` includes `lambda:PutFunctionConcurrency`, so a stack
could reserve most of the account's shared concurrency for a function `rtfm-*` and throttle other
projects' functions. It stays allowed (`infra/README.md` › What it allows that reaches beyond
RTFM): a reserved-concurrency cap may later be a cost guard.

## The user's steps, in order

Each step is the user's in CloudShell (us-west-2, signed in as an admin) unless it says the agent.

1. **On the laptop, write the templates**, with no credentials:

   ```sh
   npm run cdk -- synth --quiet
   ```

   Upload two of them from `infra/cdk.out/` to CloudShell (Actions › Upload file):
   `RtfmToolkit.template.json` and `RtfmSpikeEdge.template.json`.

2. **Redeploy `RtfmToolkit`.** First the change set, to see it:

   ```sh
   aws cloudformation deploy --region us-west-2 --stack-name RtfmToolkit --template-file RtfmToolkit.template.json --capabilities CAPABILITY_NAMED_IAM --parameter-overrides Qualifier=rtfm CloudFormationExecutionPolicies=arn:aws:iam::438180219169:policy/rtfm-cfn-execution InputPermissionsBoundary=rtfm-boundary --no-execute-changeset
   ```

   Run the `aws cloudformation describe-change-set …` command it prints. Expect exactly four
   changes, all `Modify`, none replaced: `BoundaryEA298153`, `ExecutionPolicy85A56BE8`,
   `StagingBucketPolicy83BEDEEE` and `DeploymentActionRole2F6156AE`. Then deploy it:

   ```sh
   aws cloudformation deploy --region us-west-2 --stack-name RtfmToolkit --template-file RtfmToolkit.template.json --capabilities CAPABILITY_NAMED_IAM --parameter-overrides Qualifier=rtfm CloudFormationExecutionPolicies=arn:aws:iam::438180219169:policy/rtfm-cfn-execution InputPermissionsBoundary=rtfm-boundary
   ```

3. **The agent deploys `RtfmSpike`:**

   ```sh
   node infra/spike/build.ts
   npm run cdk -- deploy RtfmSpike -c spike=true --require-approval never
   npm run aws -- cloudformation describe-stacks --stack-name RtfmSpike --query 'Stacks[0].Outputs' --output text
   ```

   and sends the user the two domains from those outputs, `WebFunctionDomainName` and
   `FunctionUrlDomainName`.

4. **Deploy `RtfmSpikeEdge`**, with the two domains the agent sent (the names are fixed). The
   distribution takes 5 to 15 minutes; the command waits:

   ```sh
   aws cloudformation deploy --region us-west-2 --stack-name RtfmSpikeEdge --template-file RtfmSpikeEdge.template.json --parameter-overrides WebFunctionName=rtfm-spike-web FunctionUrlName=rtfm-spike-function-url WebFunctionDomainName=<WebFunctionDomainName> FunctionUrlDomainName=<FunctionUrlDomainName>
   ```

   Tell the agent when it finishes. It reads the distribution's address itself
   (`npm run aws -- cloudformation describe-stacks --stack-name RtfmSpikeEdge`), runs the spikes,
   and tells the user when they are done.

5. **Delete `RtfmSpikeEdge`**, and wait for it (CloudFront disables, then deletes, the
   distribution; it can take 15 minutes or more):

   ```sh
   aws cloudformation delete-stack --region us-west-2 --stack-name RtfmSpikeEdge
   aws cloudformation wait stack-delete-complete --region us-west-2 --stack-name RtfmSpikeEdge
   ```

6. **The agent destroys `RtfmSpike`** and checks that it, its log groups and the probe's Web
   Function are gone:

   ```sh
   npm run cdk -- destroy RtfmSpike -c spike=true --force
   npm run aws -- cloudformation describe-stacks --stack-name RtfmSpike
   npm run aws -- logs describe-log-groups --log-group-name-prefix /rtfm/spike
   ```

   The first read must say the stack does not exist, and the second must list no log group.

7. **Withdraw the spike's part**, once the withdrawal change is committed (it removes the spike
   code, the Web Function allow, the staging bucket statement and `RtfmSpikeEdge` from the user's
   stacks, and keeps everything listed as permanent above). On the laptop, `npm run cdk -- synth
   --quiet`, upload `RtfmToolkit.template.json`, and repeat step 2's two commands. Expect the same
   four `Modify` changes; afterwards the boundary keeps the `PutResourcePolicy` deny, the Web
   Function denials and `s3:GetObjectVersion`.

## Cost of the leaning design

**At idle:** DynamoDB storage under 1 MB (inside the 25 GB free tier), log storage, the Web
Function at zero environments, CloudFront at no requests: **about $0 a month**.

**At the $20 cap** (the gateway's monthly cap, which bounds model spend): $20 of Haiku 4.5 is
about 2,000–2,800 sections at $0.007–0.010. Around it:

| Item | Estimate |
| --- | --- |
| Web Function requests (~6 per section) | $0.005 |
| Web Function CPU (~0.1 vCPU-second per section) | $0.007 |
| Web Function memory: environments alive ~100 hours a month at 0.3 GB (2 GB) | $0.40 ($2.64) |
| DynamoDB: ~35 write units and a few reads per section | $0.06 |
| CloudFront | $0 (free tier) |
| CloudWatch Logs | $0.05 |
| **Around $20 of models** | **about $0.50, at most about $3** |

Spike 4 replaces the memory line's guess with a measured environment lifetime.

## The boundary the leaning design would need

Given here for review; it is final once the spikes have run and the user has decided:

- Web Functions `rtfm-*` join `RTFM_RESOURCES`, under the permanent denials above.
- No CloudFront permission and no resource policy: the distribution, its origin access control
  and the Web Function's resource policy for it are in a stack the user deploys, as
  `RtfmSpikeEdge` is, with the Web Function's name and domain as parameters.
- The staging bucket statement for Web Function revisions `rtfm-*`.
- Tables `rtfm-*` are already allowed.

## Build tasks that would follow

Proposed for `WORKLIST.md` once the user decides; each keeps `npm test` offline:

1. **DynamoDB storage:** `ManualStore` and `UsageLedger` on DynamoDB, with their shared suites run
   against DynamoDB Local on loopback.
2. **Caps and kill switch across processes:** spending totals and the kill switch behind
   interfaces in the gateway, with in-memory and file implementations as now and DynamoDB ones.
3. **One writer across environments:** section leases behind an interface in `runs.ts`; a reader
   on another environment waits for the stored body.
4. **The Web Function entry:** listening on `AWS_LAMBDA_HTTP_ENDPOINT`, allowed hosts and origins
   from config, serving the built app, logs to standard output, credentials from the role and the
   passcode from SSM.
5. **`RtfmApp` and its edge:** the tables and the Web Function in `RtfmApp`; the distribution and
   what lets it invoke the Web Function in a stack the user deploys; and the boundary change
   above, which the user approves and deploys.
6. **Reading it from here:** `rtfm-read` gains the new log groups and read access to the tables,
   so `npm run usage` and `npm run logs` can read the deployed app (`RtfmAccess`, the user's
   redeploy).

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
- AWS What's New, "AWS Lambda announces Lambda Web Functions":
  https://aws.amazon.com/about-aws/whats-new/2026/10/aws-lambda-web-functions/
- Classmethod, "I tried Lambda Web Functions…" (SSE through an endpoint, deploy times):
  https://dev.classmethod.jp/en/articles/aws-lambda-web-functions-ga-express/
- AWS Lambda pricing (Web Functions, Event Functions, response streaming):
  https://aws.amazon.com/lambda/pricing/
- AWS, Response streaming for Lambda Event Functions:
  https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
- AWS, Select a method to invoke a Lambda Event Function over HTTP:
  https://docs.aws.amazon.com/lambda/latest/dg/furls-http-invoke-decision.html
- CloudFront, Restrict access to a Lambda function URL origin:
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
- CloudFront, Restrict access to a Lambda Web Function origin:
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda-web.html
- CloudFront, Origin settings (response timeout, connection attempts, response completion
  timeout): https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html
- CloudFront, CreateDistributionWithTags (needs `CreateDistribution` and `TagResource`):
  https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_CreateDistributionWithTags.html
- CloudFront pricing, flat-rate plans: https://aws.amazon.com/cloudfront/pricing/
- API Gateway, Stream the integration response:
  https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html, and
  Lambda proxy integration with response streaming:
  https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode-lambda.html
- API Gateway, Choose between REST APIs and HTTP APIs (response streaming: REST only):
  https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html
- DynamoDB on-demand pricing (write and read units, transactions, free storage):
  https://aws.amazon.com/dynamodb/pricing/on-demand/
- The Service Authorization Reference as JSON, for CloudFront's and Lambda's actions, resources
  and condition keys: https://servicereference.us-east-1.amazonaws.com/v1/cloudfront/cloudfront.json
  and https://servicereference.us-east-1.amazonaws.com/v1/lambda/lambda.json
- CloudFormation's resource schemas for us-west-2 (handler permissions of
  `AWS::CloudFront::Distribution`, `…::OriginAccessControl`, `AWS::Lambda::WebFunction*`,
  `…::ResourcePolicy`, `…::Permission`, `…::Url`):
  https://schema.cloudformation.us-west-2.amazonaws.com/CloudformationSchema.zip
- The CDK's own `FunctionUrlOrigin.withOriginAccessControl` (aws-cdk-lib 2.273.0, in
  `node_modules`), which adds both function URL permissions with the distribution's ARN
- EC2, Lightsail and Fargate prices are approximate list prices for us-west-2 from memory of
  their pricing pages, not re-read; they only set the order of magnitude for option D.
- RTFM: `ARCHITECTURE.md`, `server/api/README.md`, `server/writer/README.md`,
  `server/gateway/README.md`, `server/storage/README.md`, `infra/README.md`,
  `research/lambda-and-dynamodb.md`, `research/aws-hosting.md`
