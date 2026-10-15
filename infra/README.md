# infra

RTFM's AWS setup, as a CDK app in TypeScript: account `438180219169`, region `us-west-2`. The
account also holds things that aren't RTFM's, so every identity here reaches only RTFM's stacks
(`Rtfm*`) and resources named for RTFM (`rtfm-*`), wherever the service allows it, and RTFM's
bootstrap has its own qualifier, `rtfm`, and its own stack, `RtfmToolkit`.

## Reaching AWS: `npm run aws` and `npm run cdk`

These are the only way this repo reaches AWS. `npm run aws -- <args>` runs the AWS CLI (v2, on
the `PATH`), and `npm run cdk -- <args>` runs the pinned CDK CLI in `infra/`. `run-aws.ts` runs
each with:

- **none of the caller's AWS settings:** every `AWS_*` variable is removed, among them
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE` and
  `AWS_DEFAULT_PROFILE`;
- **RTFM's own files:** `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` point at
  `~/.aws/rtfm/config` and `~/.aws/rtfm/credentials`, so nothing in `~/.aws/config` is reachable;
- **the profile it chooses:** `rtfm-deploy` for `cdk deploy` and `cdk destroy`, `rtfm-read` for
  everything else, and none for `cdk synth` and `cdk ls`, which need no credentials;
- **an empty `HOME`**, a new temporary folder deleted once the command ends. The AWS CLI keeps
  its aliases and its cache of assumed-role credentials in `~/.aws/cli/`, whatever its config
  files are, and the CDK CLI reads settings from `~/.cdk.json`, so the user's own aliases and
  settings never apply, and RTFM's credentials are never cached beside the user's;
- **no instance metadata, CDK version check or CDK telemetry**, and `cdk.json` turns off the CDK
  CLI's notices, so `npm run cdk -- synth` makes no network request.

It refuses a command that doesn't come first (`npm run aws -- --output json s3 ls`), so an
option's value is never taken for the command; `--profile` and any prefix of it from `--p` on
(`--pro=x` too), since the AWS CLI takes an option's unambiguous prefix; `configure` anywhere in
an `aws` command, which reads and writes RTFM's files; and an `infra/cdk.json` that names a
`profile`, which would beat the wrapper's.

It passes `SIGINT`, `SIGTERM` and `SIGHUP` on to the command, and removes the temporary `HOME`
however it ends.

Every argument after `--` reaches the command as given, so a `--query` such as
`'Stacks[0].{Status:StackStatus,Protected:EnableTerminationProtection}'` needs only your own
shell's quoting. npm runs a script through `sh` and leaves some arguments unquoted, such as
braces and brackets, so the `aws` and `cdk` scripts first turn off brace expansion and globbing
(`set +o braceexpand`, `set -f`), then `exec` the wrapper, which runs the command without a shell.

Agents diff a stack with `npm run cdk -- diff <stack> --method=template`, which compares the
synthesized template with the deployed one and does nothing else. Without it, `cdk diff` first
tries to publish the template to the staging bucket as the file publishing role, then to make a
read-only change set, and falls back to the same comparison when `rtfm-read` can do neither.

The CDK's own CloudFormation schemas can lag behind AWS's, so agents check what CloudFormation
accepts against the live schema of a resource type, with
`npm run aws -- cloudformation describe-type --type RESOURCE --type-name <type> --query Schema --output text`.

Before any other command, it runs `aws sts get-caller-identity` and refuses unless the answer is
the chosen role, assumed in account `438180219169`. The tests cover the environment it builds,
the identity check and the arguments passed through `npm run aws`, without calling AWS.

`npm run ops` (`README.md` › The ops tools) reaches AWS through the same environment and identity
check, as `rtfm-ops` or `rtfm-read`, with `openAwsSession` in `run-aws.ts`. A session runs the
AWS CLI with no shell, its arguments chosen by the tool, never passed on from the caller; it gives
an AWS SDK client the role's temporary keys from `aws configure export-credentials`, so the SDK
never reads `~/.aws` itself; and it removes its `HOME` when it closes. On `SIGINT`, `SIGTERM` or
`SIGHUP` it passes the signal on to its running commands and exits with code 1 at once, without
waiting for them, and exiting removes its `HOME`. The ops tools' tests cover it, with a stand-in
for the AWS CLI.

## The identities

| Identity | What it is for | What it reaches |
| --- | --- | --- |
| `rtfm-local` (user) | The key in the server's `.env.local` | Claude on Bedrock, through the policy `rtfm-bedrock`, and the items of the table `rtfm-usage`, Bedrock's spending ledger |
| `rtfm-agent` (user) | The key in `~/.aws/rtfm/credentials` | Assuming `rtfm-read`, `rtfm-deploy` and `rtfm-ops`, nothing else |
| `rtfm-read` (role) | `npm run aws`, `npm run cdk` but deploys, and `npm run ops`' reads | Reading RTFM's logs, stacks, buckets, Web Functions and tables' settings, the items of `rtfm-usage`, the libraries' links and activity and the recipients' manual lists in `rtfm-app`, CloudFormation's resource types, assuming the lookup role (`cdk diff`), and Cost Explorer |
| `rtfm-deploy` (role) | `npm run cdk -- deploy` | Assuming the `rtfm` bootstrap's deploy, file publishing and lookup roles, nothing else |
| `rtfm-ops` (role) | `npm run ops -- kill-switch`, `passcode`, and `library create` and `revoke` | Reading and writing the items of three partitions: `KILL_SWITCH` in `rtfm-usage`, and `PASSCODE` and `LINK` in `rtfm-app`, nothing else |
| `cdk-rtfm-deploy-role-…` | The CDK CLI's deploys | CloudFormation on `Rtfm*` stacks, but only reading `RtfmAccess` and `RtfmToolkit`; passing the execution role |
| `cdk-rtfm-file-publishing-role-…` | Uploading assets | The staging bucket |
| `cdk-rtfm-lookup-role-…` | `cdk diff`'s reads | Reading `Rtfm*` stacks and the bootstrap's version |
| `cdk-rtfm-cfn-exec-role-…` | CloudFormation deploys as it | The execution policy, under the boundary |

`rtfm-bedrock` is the Bedrock policy (`bedrock.ts`): `bedrock:InvokeModel` and
`InvokeModelWithResponseStream` on Claude's inference profiles and foundation models in any
region (a `global.` profile's foundation-model ARN has no region),
`bedrock-mantle:CreateInference` and `ListModels` on the account's `project/default`, and
`aws-marketplace:ViewSubscriptions` and `Subscribe`, which a model's first call needs, but not
`aws-marketplace:Unsubscribe`.

`rtfm-local`'s inline policy `read-write-rtfm-usage` gives it exactly what the server's Bedrock
spending ledger does to the table `rtfm-usage` (`server/gateway/README.md` › The table
`rtfm-usage`): `dynamodb:GetItem`, `Query`, `PutItem`, `UpdateItem` and `ConditionCheckItem`, on
`table/rtfm-usage` alone (`USAGE_TABLE_ACTIONS` in `rtfm.ts`). It can't delete an item, so it can
turn the kill switch on but never off, and it reaches no other table, index or table setting.

`rtfm-read` reads, and changes nothing of:

- the log groups `rtfm-*`, `/rtfm/*` and `/aws/lambda/rtfm-*`;
- the stacks `Rtfm*` in `us-west-2`, and `RtfmEdge*` in `us-east-1` too, where the certificate's
  stack is;
- the buckets `rtfm-*` and the staging bucket;
- the Web Functions `rtfm-*`, with their revisions, endpoints and resource policy
  (`lambda:GetWebFunction`, `GetWebFunctionRevision`, `GetWebFunctionEndpoint`,
  `ListWebFunctionRevisions`, `ListWebFunctionEndpoints` and `GetResourcePolicy`). It can't list
  the account's Web Functions (`ListWebFunctions` takes only `*`), and can't invoke an endpoint;
- the tables `rtfm-*`, their settings and their point-in-time recovery
  (`dynamodb:DescribeTable` and `DescribeContinuousBackups`), and can't list the account's
  tables;
- the items of the table `rtfm-usage`, Bedrock's spending ledger (`dynamodb:GetItem` and
  `Query`), for `npm run ops -- usage`, `status`, and `library list` and `show`;
- in `rtfm-app`, the items of two partitions, `LINK` and `ACTIVITY` (`LINK_PARTITION` and
  `ACTIVITY_PARTITION` in `rtfm.ts`), the libraries' links and their activity
  (`dynamodb:GetItem` and `Query`), and the recipients' manual lists, the partitions
  `L#<libraryId>#LIBRARY` (`dynamodb:Query` alone), for `npm run ops -- library list` and `show`.
  A link's item holds its secret's digest, which opens nothing. A `Query` of a manual list
  returns each of the library's manuals as its table of contents (title, subtitle, voice, and its
  chapters' and sections' titles and summaries, which come from what the recipient asked for) and
  which of its sections are written, but no section's body or lease, and no conversation, which is
  kept nowhere. It reads no other item of `rtfm-app`: not the passcode's, the admin's library, a
  section or a seeding record. It reads no index.

The items of `rtfm-app` it reads are limited as `rtfm-ops`'s are (below), with
`dynamodb:LeadingKeys`: `ForAllValues:StringEquals` with `LINK` and `ACTIVITY`; and
`ForAllValues:StringLike` with `L#*#LIBRARY` (`RECIPIENT_LIBRARY_PARTITION_PATTERN`) beside
`ForAllValues:StringNotLike` with `L#*#*#*` (`RECIPIENT_DEEPER_PARTITION_PATTERN`); each with
`Null` and `false`. `StringLike` matches case-sensitively, and its `*` matches any characters, `#`
included: IAM's string operators match without a format, unlike the ARN operators, which check
each part of an ARN apart (IAM User Guide, "IAM JSON policy elements: Condition operators", read
2026-10-13). So `L#*#LIBRARY` alone would also match `L#acme#MANUAL#x#LIBRARY`; the
`StringNotLike` refuses any key with three or more `#`, which leaves exactly
`L#<libraryId>#LIBRARY` with an id that holds no `#`. No such deeper key exists anyway: a library
id and a manual id are slugs (`ID_PATTERN` in `server/storage/manual.ts`), with no `#` and no
capital, so a recipient's other partitions, `L#<libraryId>#SEEDED` and
`L#<libraryId>#MANUAL#<manualId>`, never end in `#LIBRARY`, and the admin's `LIBRARY` doesn't
start with `L#`. The policy doesn't depend on that.

It also has actions on `*` that take no narrower resource: listing log groups, reading the results
of a Logs Insights query by the ID its own `StartQuery` returned, Cost Explorer, which covers the
whole account, and reading a CloudFormation resource type's live schema, such as
`AWS::Lambda::ResourcePolicy`'s (`cloudformation:DescribeType`). It can't list other queries
(`DescribeQueries`) or stop them. The Service Authorization Reference (read 2026-10-13) gives
`DescribeType` no resource type and no condition key, so it reads any type in any region, another
project's private extensions among them; CloudFormation's `type` resource
(`…:type/resource/<type>`) applies only to stack set actions. It can't register, deregister,
activate or configure a type.

`rtfm-ops` may touch the items of three partitions, and nothing else: no item of another
partition, and no other table, service or role, so it can't reach beyond what the boundary allows.

- **`KILL_SWITCH`** in `rtfm-usage` (`KILL_SWITCH_PARTITION` in `rtfm.ts`), which holds the kill
  switch's item: `dynamodb:GetItem`, `PutItem` and `DeleteItem`, so it turns the kill switch on and
  off, and reads it.
- **`PASSCODE`** in `rtfm-app` (`PASSCODE_PARTITION`; `server/storage/README.md` › The table
  `rtfm-app`), which holds the passcode's item, its digest: `dynamodb:GetItem` and `PutItem`, so
  `npm run ops -- passcode set` stores a new digest and `passcode cookie` reads it. The digest
  opens the app (`README.md` › A passcode).
- **`LINK`** in `rtfm-app` (`LINK_PARTITION`), which holds the libraries' links, one item each,
  keyed by its secret's digest: `dynamodb:GetItem`, `Query`, `PutItem` and `UpdateItem`, to make a
  link, list them, read one and revoke one. It has no `DeleteItem`: a revoked link's item stays.

Each statement names its table's ARN and holds two conditions on `dynamodb:LeadingKeys`, the
partition keys a request names: `ForAllValues:StringEquals` with the one partition, and `Null`
with `false`. DynamoDB requires `ForAllValues` with this key, and IAM's `ForAllValues` also holds
when a request names no partition key at all, as a `Scan` does, so `Null` requires one (Amazon
DynamoDB Developer Guide, "Using IAM policy conditions for fine-grained access control"; IAM User
Guide, "Single-valued vs. multivalued context keys", both read 2026-10-13). DynamoDB has no
condition key for the sort key, so the policy can't name the one item each partition holds:
`rtfm-ops` can put, read or delete an item with any sort key in `KILL_SWITCH`, put or read one
with any sort key in `PASSCODE`, and put, read or update one with any sort key in `LINK`. The
server checks the kill switch by its whole key (`KILL_SWITCH`, `KILL_SWITCH`), so another item in
that partition doesn't turn it on. The boundary denies
anything on `rtfm-ops`, as on `rtfm-read` and `rtfm-deploy`, so no app stack can widen it.

You deploy `RtfmToolkit`, `RtfmAccess` and the edge stacks, `RtfmEdgeCertificate` and
`RtfmEdge`, yourself, with your own admin sign-in. Every stack named `RtfmEdge*` is yours, and
RTFM's roles may only read them. All four use `LegacyStackSynthesizer`: no bootstrap role, so
`rtfm-deploy` can change none of them, and no template asset, so the CLI sends the template
inline (each is well under its 50 KiB limit, which the tests check) rather than through the
staging bucket, which `rtfm-deploy` can write. Every other stack is named `Rtfm*` and deploys
through the bootstrap: the app's default synthesizer is `DefaultStackSynthesizer` with the
qualifier `rtfm`. No such stack may be named `RtfmEdge…`, which the tests check.

## The stacks

- **`RtfmToolkit`** (`toolkit-stack.ts`) is RTFM's bootstrap, in place of the CDK CLI's own
  template. The CLI's template gives its deploy role CloudFormation on every stack in the
  account, so it could change or delete another project's stack through that stack's own role,
  and its lookup role read access to the whole account. This one has the names
  `DefaultStackSynthesizer` expects for the `rtfm` qualifier: the staging bucket
  `cdk-rtfm-assets-438180219169-us-west-2`, the four roles above, and the version parameter
  `/cdk-bootstrap/rtfm/version` (version 32, whose roles and outputs it provides). It also holds
  the boundary and the execution policy, which have to exist before the execution role does.
  - `cdk bootstrap` passes it parameters, as Your steps › 2 does, so it declares them, and each
    accepts only this template's value: the qualifier `rtfm`, the execution policy
    `rtfm-cfn-execution` and the boundary `rtfm-boundary`. Its `BootstrapVariant` keeps the
    CLI's own template from replacing it.
  - Only `rtfm-deploy` may assume its deploy and file publishing roles, and `rtfm-read` and
    `rtfm-deploy` its lookup role, never with an external ID.
  - The deploy role may only read the stacks you deploy: `RtfmAccess`, `RtfmToolkit` and
    `RtfmEdge*`.
  - The staging bucket's policy lets `lambda.amazonaws.com` read objects and their versions for a
    revision of a Web Function `rtfm-*` in this account: Lambda reads a revision's code as its
    own service principal.
- **`RtfmAccess`** (`access-stack.ts`): the users, the three roles, `rtfm-bedrock`, `rtfm-local`'s
  policy on `rtfm-usage`, and the budget alarm. It has termination protection.
- **`RtfmApp`** (`app-stack.ts`): the app, deployed through the bootstrap with
  `npm run cdk -- deploy RtfmApp` (Deploying the app stack, below). Every role in it carries the
  boundary (`PermissionsBoundary.of` the stack). It holds:
  - **the Web Function `rtfm-app`**, running the server (`server/README.md` › The Web Function).
    Its name never changes, since the edge's resource policy names it. One revision, made from
    the package below on `nodejs24.x`, with `timeoutSeconds` 300 (a request, a whole stream
    included, may run 5 minutes) and its logs in `/rtfm/app`. Its environment holds only
    `AWS_LAMBDA_NODEJS_ENTRYPOINT`, `RTFM_MODELS=bedrock`, so it runs Claude Haiku 4.5, and
    `RTFM_APP_TABLE` and `RTFM_USAGE_TABLE`, the tables' names: `rtfm-read` can read a revision
    (`GetWebFunctionRevision`), so nothing secret goes there. The server reads the passcode's
    digest from the table (`README.md` › A passcode).
  - **its endpoint `main`**: `HomeRegion`, `IamAuth`, at most 2 environments (`maxEnvironments`)
    and 100 requests a second (`rateLimit`). No role of RTFM's may invoke it; only the edge's
    distribution may, through the resource policy in `RtfmEdge`. The stack's output
    `EndpointDomain` is its domain, which stays as long as the endpoint does.
  - **its role `rtfm-app-web-function`**, which Lambda assumes. It may only write log streams in
    `/rtfm/app` and `/rtfm/app.local`, read and write items in the tables `rtfm-app` and
    `rtfm-usage`, and call Claude. In `rtfm-app` it has `GetItem`, `Query`, `PutItem`, `UpdateItem`
    and `DeleteItem`, which also cover the store's transactions and reading the passcode's digest
    and the libraries' links. It writes no item of the passcode's partition, `PASSCODE`, or the
    links', `LINK`, which only `rtfm-ops` writes (The Web Function's role, the passcode and the
    links, below). In `rtfm-usage` it may do what `rtfm-local` may:
    `GetItem`, `Query`, `PutItem`, `UpdateItem` and `ConditionCheckItem`, so it reserves every
    Bedrock call against the shared caps and kill switch. It calls Claude as `rtfm-bedrock` does,
    less the Marketplace subscription (`claudeStatements()` in `bedrock.ts`, which the boundary
    already allows): `bedrock:InvokeModel` and `InvokeModelWithResponseStream` on Claude's
    inference profiles and foundation models, and `bedrock-mantle:CreateInference` and
    `ListModels` on `project/default`. It can't subscribe the account to a model through AWS
    Marketplace, which the boundary doesn't allow, so it calls only models the account is
    subscribed to: Haiku 4.5's subscription comes from `rtfm-local`'s first call (Your steps › 6).
  - **the table `rtfm-app`**, the library: the manuals and their sections
    (`server/storage/README.md` › The table `rtfm-app`).
  - **the table `rtfm-usage`**, Bedrock's spending ledger: every Bedrock call, from a laptop or
    deployed, the day's and the month's committed spend, and the kill switch
    (`server/gateway/README.md` › The table `rtfm-usage`).
  - Both tables are on demand, with point-in-time recovery and deletion protection on, and kept
    when they leave the stack (`RemovalPolicy.RETAIN`), since they hold the library and the record
    of what was spent: deleting one is a step you take yourself, after turning deletion protection
    off. The boundary allows `dynamodb:*` on `table/rtfm-*`, which covers every action
    CloudFormation's handler takes on them, so the deploy needs no change to the bootstrap.
  - **the log groups `/rtfm/app` and `/rtfm/app.local`**, kept 30 days and deleted with the stack.
    Lambda writes a Web Function's logs to the `.local` group first, then copies them to the
    other.
  - **the bucket `rtfm-app-438180219169-us-west-2`**, with S3's default Block Public Access. The
    bucket is kept when it leaves the stack (`RemovalPolicy.RETAIN`), since it may hold data:
    deleting it is a step you take yourself.
- **`RtfmEdgeCertificate`** (`edge-certificate-stack.ts`), in `us-east-1`, the only region
  CloudFront takes certificates from: the ACM certificate for `rtfm.moonfetus.com`, validated by
  DNS. Given the zone `moonfetus.com`'s ID (`HostedZoneId`), CloudFormation writes the validation
  record into the zone itself, and the stack completes only once ACM has issued the certificate:
  ACM says up to 30 minutes, and gives up after 72 hours. Its output `CertificateArn` is
  `RtfmEdge`'s parameter.
- **`RtfmEdge`** (`edge-stack.ts`), in `us-west-2` beside the Web Function, whose resource policy
  it holds (CloudFront and Route 53 are global). Its parameters are `CertificateArn`,
  `HostedZoneId` and `EndpointDomain`, `RtfmApp`'s output. It holds:
  - **the distribution**, at `rtfm.moonfetus.com` with the certificate, over HTTP/2 and IPv6, in
    price class 100 (North America and Europe), redirecting HTTP to HTTPS. Its one origin is the
    Web Function's endpoint over HTTPS, which the origin access control `rtfm-app` signs (origin
    type `lambda`, `always-amz-auth` and `sigv4`, the only signing a Web Function origin takes).
    It makes one connection attempt: for a custom origin that is also how many times CloudFront
    asks for a response, and it would ask again for a `GET` whose response times out, paying for
    a second run of a section. Its read timeout is 60s, between packets as well as before the
    first, well above the 15s between the heartbeats of the server's event streams.
  - **its three behaviors**: `/api/*` is never cached (`CachingDisabled`) and passes every method
    and every viewer header but `Host`, with cookies and query strings
    (`AllViewerExceptHostHeader`: the endpoint answers `404` to any `Host` but its own);
    `/assets/*`, named by content, is cached as the server says (`CachingOptimized`); every other
    path, `index.html` and the page routes, is never cached, so a deploy shows at once. All three
    add AWS's managed `SecurityHeadersPolicy` to every response: `Strict-Transport-Security`
    (a year), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
    `Referrer-Policy: strict-origin-when-cross-origin` and `X-XSS-Protection`, each unless the
    server sends its own, but `nosniff` always.
  - **the CloudFront Function `rtfm-app-host-check`**, inline in the template, on every
    behavior's viewer requests: `403` for any `Host` but `rtfm.moonfetus.com`, so the
    distribution's own `*.cloudfront.net` domain is refused. The server can't refuse it, since
    CloudFront sends it the endpoint's domain as the `Host`.
  - **the alias records** `A` and `AAAA` for `rtfm.moonfetus.com`, in the zone.
  - **the Web Function's resource policy**: `cloudfront.amazonaws.com` may
    `lambda:InvokeWebFunctionEndpoint` on `rtfm-app`'s endpoints, only with `aws:SourceArn` this
    distribution.

  Its output `DistributionDomain` is the distribution's own domain.

  RTFM's roles can still delete the Web Function or its resource policy: the boundary leaves
  `lambda:DeleteResourcePolicy` on `rtfm-*`. Either cuts CloudFront off without a word, so the
  Web Function's name never changes, and the smoke check goes through the domain.

  The resource policy isn't the only way in. With `IamAuth`, the endpoint also takes a request
  signed by any principal in this account whose own policies allow
  `lambda:InvokeWebFunctionEndpoint` on it: an admin, the bootstrap's execution role (which only
  CloudFormation assumes), or a role an app stack makes with that permission, since the boundary
  allows `lambda:*` on `rtfm-*`. Such a request skips CloudFront and the host check, and meets
  only the server's own checks: the `Host` (the endpoint's, so it passes), the `Origin` and the
  passcode. `rtfm-read`, `rtfm-deploy` and the bootstrap's other roles can't invoke it.

Both edge stacks carry no asset at all: no CDK custom resource, no `crossRegionReferences`, no
`DnsValidatedCertificate`, no `BucketDeployment`. An asset would go through the staging bucket,
which `rtfm-deploy` can write, so it could change what you deploy. The tests fail an edge stack
with an asset or a custom resource, or a template over the inline limit.

### The Web Function's role, the passcode and the links

Two partitions of `rtfm-app` decide who opens the app: `PASSCODE`, whose digest opens it
(`README.md` › A passcode), and `LINK`, whose items say which library each link opens and whether
it is revoked. Only `rtfm-ops` writes them, so the Web Function can never make, change or reopen a
link, or change the passcode. The Web Function's role reads both with `GetItem`, and its policy on
`rtfm-app` allows every item, so a statement beside it, `LeaveAccessToOps`, denies `PutItem`,
`UpdateItem`, `DeleteItem` and `BatchWriteItem` on the table when `dynamodb:LeadingKeys` includes
`PASSCODE` or `LINK` (`ForAnyValue:StringEquals`). An explicit deny wins over the allow. It still
writes every other partition: a library's (`LIBRARY`, `SEEDED`, `MANUAL#…`, and each recipient's
`L#<libraryId>#…`) and the libraries' activity, `ACTIVITY`.

- **Every write names its partition.** The Service Authorization Reference gives
  `dynamodb:LeadingKeys` (`ArrayOfString`) to `PutItem`, `UpdateItem`, `DeleteItem` and
  `BatchWriteItem`. `ForAnyValue` holds when any of the request's partition keys is `PASSCODE` or
  `LINK`. The role isn't granted `BatchWriteItem`; the deny names it as well.
- **Transactions are covered.** DynamoDB authorizes each part of a `TransactWriteItems` as its
  item action, `PutItem`, `UpdateItem`, `DeleteItem` or `ConditionCheckItem`, with that item's
  partition key, so a transaction that writes the passcode's item or a link's is refused too. A
  `ConditionCheckItem` only reads, and the role isn't granted it on `rtfm-app`.
- **PartiQL isn't granted.** PartiQL needs its own actions (`dynamodb:PartiQLInsert`,
  `PartiQLUpdate`, `PartiQLDelete`, `PartiQLSelect`), which the role doesn't have, so the deny
  leaves them out.
- **Reads are untouched.** The deny names no read action, so `GetItem` and `Query` reach the
  passcode's item, the links and every other as before. A request that names no partition key,
  such as a `Scan`, never matches `ForAnyValue`; it isn't a write, and the role isn't granted it.

DynamoDB's guide says to use `ForAllValues` with `dynamodb:LeadingKeys`, which suits an allow
limited to some partitions, as `rtfm-ops`'s is. A deny of some partitions needs `ForAnyValue`, the
IAM set operator that holds when at least one value matches. Sources, all read 2026-10-13: the
Service Authorization Reference, "Actions, resources, and condition keys for Amazon DynamoDB";
the Amazon DynamoDB Developer Guide, "Using IAM with DynamoDB transactions", "IAM security
policies with PartiQL for DynamoDB" and "Using IAM policy conditions for fine-grained access
control"; the IAM User Guide, "Single-valued vs. multivalued context keys".

### The Web Function's package

A revision's code is a zip in the staging bucket, which Lambda reads as its own service principal.
`app-stack.ts` makes it a CDK asset that `scripts/build-web-function.ts` builds on this machine
when the app synthesizes (`cdk synth`, `diff` and `deploy`), in about a second, with no Docker:

- `dist/`: the built app (`vite build`), with its `THIRD-PARTY-NOTICES.txt`;
- `web-function.mjs`, in the package's `server/` folder: `server/web-function.ts` and all it
  imports, `node_modules` included, bundled into one file by Rolldown, so the package needs no
  `node_modules` and no TypeScript at run time. Its path is `AWS_LAMBDA_NODEJS_ENTRYPOINT`.
  Beside it, `THIRD-PARTY-NOTICES.txt` holds the notices of the packages it bundles (`README.md` ›
  License);
- `seed/`: the seed manuals. Every module in the bundle resolves a path against the bundle's own
  URL, so the storage's `../seed/` is this folder, and the config's `../dist` the built app.

It comes to about 6.4 MB, 2.8 MB zipped. The asset is named by a hash of the package, so a deploy
makes a new revision only when the package changes. The tests synthesize without building it:
`vite.config.ts` gives them the CDK context `aws:cdk:bundling-stacks: []`.
`scripts/build-web-function.test.ts` builds it and runs it on loopback.

## Deploying the app stack

`npm run cdk -- deploy RtfmApp` builds the Web Function's package, then deploys as `rtfm-deploy`,
through the bootstrap's roles: the file publishing role uploads the template and the package,
zipped, to the staging bucket, the deploy role makes and runs the change set, and CloudFormation
acts as the execution role, under the boundary. A deploy that the boundary refuses fails on the
refused resource and rolls back, leaving the stack as it was.

Without a terminal, `cdk deploy` stops at a change that widens access, such as a new role or
policy statement: it prints the IAM changes and exits ("terminal (TTY) is not attached") before
anything reaches CloudFormation. The orchestrator deploys with `--require-approval never`
(`PROCESS.md` › Review loop › Approved, step 5): the boundary limits what such a change can
reach, and the review reads its IAM changes in the diff.

The smoke check after a deploy reads what was deployed, one command each. The `lambda-web`
commands need AWS CLI 2.37.8 or later (Your steps):

```sh
npm run aws -- cloudformation describe-stacks --stack-name RtfmApp \
  --query 'Stacks[0].StackStatus' --output text
npm run aws -- s3api get-public-access-block --bucket rtfm-app-438180219169-us-west-2 \
  --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
  --output text
npm run aws -- logs describe-log-groups --log-group-name-prefix /rtfm/app \
  --query 'logGroups[].[logGroupName,retentionInDays]' --output text
npm run aws -- lambda-web get-web-function --function-name rtfm-app \
  --query state --output text
npm run aws -- lambda-web get-web-function-endpoint --function-name rtfm-app --endpoint-name main \
  --query '[authType,state]' --output text
npm run aws -- dynamodb describe-table --table-name rtfm-app \
  --query 'Table.DeletionProtectionEnabled' --output text
npm run aws -- dynamodb describe-continuous-backups --table-name rtfm-app \
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
  --output text
npm run aws -- dynamodb describe-table --table-name rtfm-usage \
  --query 'Table.DeletionProtectionEnabled' --output text
npm run aws -- dynamodb describe-continuous-backups --table-name rtfm-usage \
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
  --output text
```

It passes when they print, in order:

- `CREATE_COMPLETE` or `UPDATE_COMPLETE`. A deploy with no changes ("(no changes)") leaves the
  status as it was.
- `True` four times: the bucket's Block Public Access is all on.
- `/rtfm/app` and `30`, then `/rtfm/app.local` and `30`: the Web Function's two log groups, kept
  30 days.
- `Active`: the Web Function.
- `IamAuth` and `Active`: its endpoint takes only signed requests.
- `True`: the table `rtfm-app` has deletion protection on, so nothing can delete the library.
- `ENABLED`: the table's point-in-time recovery is on, so the library can be restored to any
  second of the last 35 days.
- `True`, then `ENABLED`: the same for the table `rtfm-usage`, so nothing can delete the record of
  Bedrock's spending, and it can be restored.

These read the deployed resources' settings and send no request to the server, so they don't
show that it starts: Lambda doesn't check that a revision's server listens.

With the edge stacks deployed (Your steps › The edge stacks), these requests go through the domain
and the whole path to the server: CloudFront, the host check, the origin access control, the Web
Function's resource policy and the server itself. The cookie is the passcode's digest, which
`npm run ops -- passcode cookie` reads as `rtfm-ops` (`README.md` › The ops tools), kept in a shell
variable and never printed; nothing here sees the passcode itself:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://rtfm.moonfetus.com/
curl -sS -o /dev/null -w '%{http_code}\n' https://rtfm.moonfetus.com/api/manuals
cookie=$(npm run -s ops -- passcode cookie)
curl -sS -o /dev/null -w '%{http_code}\n' -b "$cookie" https://rtfm.moonfetus.com/api/manuals
distribution=$(npm run -s aws -- cloudformation describe-stacks --stack-name RtfmEdge \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" --output text)
curl -sS -o /dev/null -w '%{http_code}\n' "https://$distribution/"
```

They pass when they print, in order:

- `200`: the app's page, from the server through CloudFront.
- `401`: the API refuses a request without the passcode's cookie.
- `200`: the library, with the cookie.
- `403`: the distribution's own `*.cloudfront.net` domain, refused by the host check.

**Before the user has set a passcode**, the app refuses every API request. `passcode cookie` then
writes `No passcode is set, …` to standard error and leaves the cookie empty, and the library's
line prints `401` in place of `200`. That is the app failing closed, as it should, and the check
still passes if everything else prints as above; tell the user to run
`npm run ops -- passcode set` in a terminal outside the Claude app (Your steps › 7). Once they
have, the Web Function reads the new digest within a minute.

**One real section**, written by Claude through the domain, then found in `rtfm-usage`: the first
unwritten section of the first manual that has one, streamed to its end, then the spend. A section
is the `write-section` job, Haiku 4.5's cheapest whole piece of work, and costs $0.007–0.010
(`server/README.md` › Configuration); its reservation holds about $0.025 against the caps until it
settles. The section stays written, so the next check writes the next one.

```sh
app=https://rtfm.moonfetus.com
cookie=$(npm run -s ops -- passcode cookie)
manual=$(curl -sS -b "$cookie" "$app/api/manuals" | node -e '
  const answer = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const manual = Array.isArray(answer) && answer.find((m) => m.writtenCount < m.sectionCount);
  if (!manual) { console.error("No manual to write in:", JSON.stringify(answer)); process.exit(1); }
  console.log(manual.id);') &&
section=$(curl -sS -b "$cookie" "$app/api/manuals/$manual" | node -e '
  const manual = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const sections = [...manual.chapters, ...manual.appendices].flatMap((c) => c.sections);
  console.log(sections.find((s) => s.status === "unwritten").id);') &&
curl -sS -N -b "$cookie" "$app/api/manuals/$manual/sections/$section/stream" \
  | grep -A1 -E '^event: (written|failed)'
npm run ops -- usage
```

It passes when the stream ends with `event: written` and `data: {}`, after 12–15 seconds of
`append` events, and the usage report shows today one more `write-section` call on
`global.anthropic.claude-haiku-4-5-20251001-v1:0`, settled at $0.007–0.010, with no unsettled
reservation and the kill switch off. `npm run ops -- logs -e section` shows its `section.started`
and `section.finished`.

- **`event: failed`** with `{"reason":"budget"}`: the kill switch is on or a cap is reached; the
  usage report says which. With `{"reason":"error"}`, `npm run ops -- logs --level warn` shows why,
  such as Bedrock refusing the role (`AccessDeniedException`) or `server.keys-refused`.
- **No passcode set yet:** every request with the empty cookie answers `401`, so the first `node`
  prints `No manual to write in: {"error":"Passcode required"}` and the chain stops there: no
  section is streamed, and the usage report shows no new call, so nothing reached Bedrock and
  nothing was spent. The check waits for the passcode, as above.

## The boundary

`rtfm-boundary` (`boundary.ts`) is the permissions boundary the execution role carries, and
every role a stack creates must carry it too. The execution policy, `rtfm-cfn-execution`, is the
same document, so CloudFormation can do exactly what the boundary allows.

It allows every action of Logs, Lambda, DynamoDB, S3, SSM and IAM on resources named for RTFM:
log groups `rtfm-*`, `/rtfm/*` and `/aws/lambda/rtfm-*`; functions, Web Functions (with their
revisions and endpoints), tables, buckets, roles and policies `rtfm-*`; and parameters
`/rtfm/*`. **Every resource an app stack creates must be named explicitly with the `rtfm-`
prefix.** A name CloudFormation makes up begins with the stack's name
(`RtfmApp-ApiServiceRole1A2B`, or `rtfmapp-sitebucket1a2b` for a bucket) or with `CFN-` (a
parameter), and the boundary refuses it.

It also lets Claude be called as `rtfm-bedrock` does, less the Marketplace subscription, and
reads the staging bucket's objects (and their versions, which a Web Function revision is made
from) and the bootstrap's version.

It denies, whatever any other policy allows:

- creating a role, or setting a role's boundary, with any boundary but `rtfm-boundary`, and
  removing a boundary;
- anything on the boundary, the execution policy, `rtfm-bedrock`, `rtfm-read`, `rtfm-deploy`,
  `rtfm-ops`, the bootstrap's roles, the stacks you deploy (`RtfmAccess`, `RtfmToolkit`,
  `RtfmEdge*`), and the budget;
- anything on an IAM user: no stack creates one, or a key;
- anything but reading on the staging bucket and the version parameter;
- a public endpoint: a Lambda Function URL whose auth type isn't `AWS_IAM` (a request without
  the auth type is denied too, so changing a URL's settings must restate `AWS_IAM`); a Web
  Function endpoint created with any auth type but `IamAuth`, and a Web Function made, or an
  endpoint changed, with any auth type given but `IamAuth` (one made without an endpoint, as
  CloudFormation makes it, or an endpoint update that leaves the auth type alone, gives none);
  any function permission (`lambda:AddPermission`), even for an AWS service; and any resource
  policy (`lambda:PutResourcePolicy`), on a function or a Web Function. Lambda has no condition
  key for a permission's source, so a permission for API Gateway or CloudFront would let another
  account's API or distribution expose the function to anyone, and a whole resource policy could
  grant anyone anything, such as changing a Web Function endpoint's auth type from another
  account;
- a role or policy with a path (`role/rtfm-x/any-name`), which `rtfm-*` would otherwise match;
- changing Block Public Access, on a bucket (`s3:PutBucketPublicAccessBlock`, which removing a
  bucket's block also takes) or on the account. Every bucket keeps S3's default, which blocks
  public access, so a bucket policy or ACL that would make a bucket public fails, whatever
  principal it names.

A CDK `Bucket` must leave `blockPublicAccess` unset. Unset, the bucket's template has no
`PublicAccessBlockConfiguration` and CloudFormation leaves S3's default alone. Set, even to
`BlockPublicAccess.BLOCK_ALL`, it makes CloudFormation call `PutBucketPublicAccessBlock`, which
the boundary refuses. `publicReadAccess` needs it set, so it can't be used either.

So no app stack can make the app public, to anyone without AWS credentials, or let a service
invoke a function: that would need a change to the boundary, which only the user approves
(`PROCESS.md` › Authority). `RtfmEdge`, which you deploy, puts the app on the web instead.

### What it allows beyond RTFM's names

- `bedrock:InvokeModel` and `InvokeModelWithResponseStream` on Claude's inference profiles and
  foundation models: models belong to AWS, not to RTFM, so they can only be narrowed to Claude's.
- `bedrock-mantle:CreateInference` and `ListModels` on `project/default`: the account's one
  Mantle project.
- `logs:DescribeLogGroups` on every log group in `us-west-2`: IAM checks a listing against the
  account's log groups as a whole, and CloudFormation's log group handler lists them. It shows
  names, nothing in them.

It allows no action on `*` itself.

### What it can't name, and so leaves out

- CloudFront distributions and origin access controls, API Gateway APIs, Lambda event source
  mappings and KMS keys get an ID from AWS when they are made, so a policy can't name them in
  advance. Tag conditions don't close the gap for distributions: a role allowed to tag one could
  tag another project's `project=rtfm` by its ID and then change it, and creating one could front
  another project's origin. So a distribution is yours to deploy, in an `RtfmEdge*` stack. The
  staging bucket uses S3's own encryption, so it needs no key.
- CloudWatch metrics and X-Ray traces: their actions take only `*`.
- Buckets: an S3 bucket ARN (`arn:aws:s3:::rtfm-*`) carries no account, so a role under the
  boundary could write RTFM's data to another account's bucket named `rtfm-…`. Only RTFM's own
  data is at stake.

### What it can't condition

IAM has no condition key for the principals inside these policies, so the boundary can't stop an
RTFM stack from naming an outsider in them, on RTFM's own resources:

- a role's trust policy (`iam:CreateRole`, `iam:UpdateAssumeRolePolicy`): a role `rtfm-*` could
  trust another account, which would then act within the boundary;
- a bucket policy (`s3:PutBucketPolicy`) on a bucket `rtfm-*` may name another account, though
  Block Public Access (above) refuses one that names everyone;
- a DynamoDB resource policy (`dynamodb:PutResourcePolicy`) on a table `rtfm-*`.

Lambda's resource policies and function permissions would be on this list, so the boundary
denies them outright (above).

### What it allows that reaches beyond RTFM

`lambda:*` on RTFM's functions includes `lambda:PutFunctionConcurrency`. Reserved concurrency
comes out of the account's shared pool, so a stack could reserve most of it for a function
`rtfm-*` and leave other projects' functions throttled. It stays allowed, so reserved concurrency
can serve as a cost cap.

The bootstrap has no container image repository, so stacks can't use Docker image assets.

## The budget

`rtfm-monthly` is a monthly AWS Budgets cost budget of $20, the gateway's monthly cap
(`server/config.ts`). It emails the address given as `BudgetEmail` at deploy when the month's
actual spend passes 80% and when its forecast passes 100%, so no address is committed. It counts
the cost carrying the tag `project=rtfm`, which the app puts on every resource it makes, the IAM
users and roles included. AWS counts a tag only once it is activated as a cost allocation tag.

## Your steps

These set RTFM up in an account that holds none of it, up to the app answering at
`https://rtfm.moonfetus.com`. The whole order:

- **What you need before you start** (below).
- **The bootstrap, the access stack, the keys and RTFM's AWS files**: steps 1–5 below.
- **`RtfmApp`**, which the orchestrator deploys from the main checkout once `RtfmToolkit` and
  `RtfmAccess` exist, then checks with the smoke check (`PROCESS.md` › Rules › Only the
  orchestrator deploys; Deploying the app stack, above).
- **Checking `rtfm-local`'s key**: step 6 below, which needs `RtfmApp`'s table `rtfm-usage`.
- **The passcode**: step 7 below, which needs `RtfmApp`'s table `rtfm-app`.
- **The edge stacks** (below), which read `RtfmApp`'s output.
- **The smoke check through the domain**: the requests in Deploying the app stack, above, to
  `rtfm.moonfetus.com`, and one to the distribution's own `*.cloudfront.net` domain, which must
  be refused.
- **The cost allocation tag**, about a day later (below).

**What you need before you start:**

- **An admin sign-in** to the account, `438180219169` (`rtfm.ts`), for the AWS console and
  CloudShell.
- **The repo, installed** as `README.md` › Running it says: `npm run cdk` runs the CDK CLI from
  `node_modules`.
- **The AWS CLI on the laptop**, 2.37.8 or later (`aws --version`), the first with `lambda-web`,
  which the smoke check uses (Deploying the app stack, above); `npm run aws` runs the CLI on the
  `PATH`. The smoke check's `lambda-web` commands were checked with
  `npm run aws -- lambda-web <command> help` on 2.38.0.
- **A Route 53 public hosted zone for `moonfetus.com`** in the account. The app's domain,
  `rtfm.moonfetus.com` (`edge-certificate-stack.ts`), is in it, and the edge stacks write the
  certificate's validation record and the app's alias records into it.
- **Amazon Bedrock access to Claude Haiku 4.5**, which step 6 calls (`README.md` › The models,
  step 1).

You deploy `RtfmToolkit` and `RtfmAccess` with plain CloudFormation, from AWS CloudShell: the
templates `cdk synth` writes are ordinary CloudFormation, both stacks deploy with your own
sign-in rather than RTFM's roles, and CloudShell needs neither the CDK CLI nor an admin profile on
the laptop.

1. **Write the templates.** On the laptop, with no credentials:

   ```sh
   npm run cdk -- synth --quiet
   ```

   This writes the templates to `infra/cdk.out/`. Sign in to the AWS console as an admin, open
   CloudShell in `us-west-2`, and upload two of them, `RtfmToolkit.template.json` and
   `RtfmAccess.template.json` (Actions › Upload file).

2. **Deploy `RtfmToolkit`**, the bootstrap, in CloudShell, and protect it from deletion:

   ```sh
   aws cloudformation deploy --region us-west-2 --stack-name RtfmToolkit \
     --template-file RtfmToolkit.template.json --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides Qualifier=rtfm \
       CloudFormationExecutionPolicies=arn:aws:iam::438180219169:policy/rtfm-cfn-execution \
       InputPermissionsBoundary=rtfm-boundary
   aws cloudformation update-termination-protection --region us-west-2 \
     --stack-name RtfmToolkit --enable-termination-protection
   ```

3. **Deploy `RtfmAccess`** the same way, with a real address for the budget alarm, which AWS
   Budgets emails. `aws cloudformation deploy` doesn't read the CDK's termination protection, so
   turn it on here too:

   ```sh
   aws cloudformation deploy --region us-west-2 --stack-name RtfmAccess \
     --template-file RtfmAccess.template.json --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides BudgetEmail=<your address>
   aws cloudformation update-termination-protection --region us-west-2 \
     --stack-name RtfmAccess --enable-termination-protection
   ```

4. **Make the two keys**, in CloudShell. Each prints a key ID and its secret:

   ```sh
   aws iam create-access-key --user-name rtfm-local
   aws iam create-access-key --user-name rtfm-agent
   ```

5. **Put them on the laptop**, writing each in an editor, so its secret stays out of the shell's
   history. `rtfm-local`'s goes in `.env.local` at the main checkout's root, as
   `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, with `AWS_REGION=us-west-2` (`README.md` ›
   The models, step 2). `rtfm-agent`'s goes in RTFM's own files, leaving `~/.aws/config` and
   `~/.aws/credentials` alone. These make RTFM's two AWS files and open them:

   ```sh
   mkdir -p ~/.aws/rtfm
   touch ~/.aws/rtfm/config ~/.aws/rtfm/credentials
   chmod 600 ~/.aws/rtfm/config ~/.aws/rtfm/credentials
   open -e ~/.aws/rtfm/config ~/.aws/rtfm/credentials
   ```

   `~/.aws/rtfm/config`:

   ```ini
   [profile rtfm-read]
   role_arn = arn:aws:iam::438180219169:role/rtfm-read
   source_profile = rtfm-agent
   region = us-west-2

   [profile rtfm-deploy]
   role_arn = arn:aws:iam::438180219169:role/rtfm-deploy
   source_profile = rtfm-agent
   region = us-west-2

   [profile rtfm-ops]
   role_arn = arn:aws:iam::438180219169:role/rtfm-ops
   source_profile = rtfm-agent
   region = us-west-2
   ```

   `~/.aws/rtfm/credentials`:

   ```ini
   [rtfm-agent]
   aws_access_key_id = <the key's ID>
   aws_secret_access_key = <the key's secret>
   ```

   Give neither file a `[default]` profile: with none, `cdk synth` finds no credentials and
   reaches nothing. `npm run aws -- sts get-caller-identity` then answers with
   `assumed-role/rtfm-read/…`.

6. **Check `rtfm-local`'s key works**, once `RtfmApp` is deployed: every Bedrock call is first
   reserved in its table `rtfm-usage`, so without it the call fails before reaching Bedrock.
   Start the app with `RTFM_MODELS=bedrock npm run dev` and open an unwritten section, which
   Claude then writes. In the IAM console, under the user `rtfm-local`, its key's "Last used"
   should then show Bedrock: the server called Bedrock with this key. If you set up Bedrock access
   by hand before, delete that user, with its keys, and its policy once `rtfm-local`'s key works.

7. **Set the deployed app's passcode**, once `RtfmApp` is deployed, in a terminal on the laptop
   outside the Claude app, never in its Terminal panel, whose screen a session can read:
   `npm run ops -- passcode set` (`README.md` › A passcode). It shows four words once and waits
   for Enter, then clears the screen and its scrollback; keep the words. Until then the app
   refuses every API request.

### The edge stacks

These put the app at `https://rtfm.moonfetus.com`, from CloudShell as above, once `RtfmApp` is
deployed: step 4 below reads its output. Neither needs an IAM capability: they make no role or policy.
CloudShell keeps the variables below for its session; in a new session, run the commands that set
them again.

1. **Write the templates.** In the main checkout on the laptop, with no credentials:

   ```sh
   npm run cdk -- synth --quiet
   ```

   Upload `infra/cdk.out/RtfmEdgeCertificate.template.json` and
   `infra/cdk.out/RtfmEdge.template.json` to CloudShell (Actions › Upload file).

2. **Find the zone's ID.** CloudFormation takes it without the `/hostedzone/` that Route 53
   prints, and this prints it without:

   ```sh
   ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name moonfetus.com \
     --query "HostedZones[?Name=='moonfetus.com.'].Id" --output text | cut -d/ -f3)
   echo "$ZONE_ID"
   ```

3. **Deploy `RtfmEdgeCertificate`**, in `us-east-1`, and protect it from deletion. The deploy
   returns once ACM has issued the certificate, which takes up to 30 minutes:

   ```sh
   aws cloudformation deploy --region us-east-1 --stack-name RtfmEdgeCertificate \
     --template-file RtfmEdgeCertificate.template.json --parameter-overrides HostedZoneId=$ZONE_ID
   aws cloudformation update-termination-protection --region us-east-1 \
     --stack-name RtfmEdgeCertificate --enable-termination-protection
   ```

   If CloudShell's session ends first, the deploy goes on without it. In a new session, set
   `ZONE_ID` again (step 2), wait for the stack, then turn on its termination protection with the
   second command above:

   ```sh
   aws cloudformation wait stack-create-complete --region us-east-1 --stack-name RtfmEdgeCertificate
   ```

4. **Read the certificate's ARN and the Web Function's domain**, the outputs of
   `RtfmEdgeCertificate` and `RtfmApp`:

   ```sh
   CERTIFICATE_ARN=$(aws cloudformation describe-stacks --region us-east-1 \
     --stack-name RtfmEdgeCertificate \
     --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue" --output text)
   ENDPOINT_DOMAIN=$(aws cloudformation describe-stacks --region us-west-2 --stack-name RtfmApp \
     --query "Stacks[0].Outputs[?OutputKey=='EndpointDomain'].OutputValue" --output text)
   echo "$CERTIFICATE_ARN $ENDPOINT_DOMAIN"
   ```

5. **Deploy `RtfmEdge`**, in `us-west-2`, and protect it from deletion. The deploy returns once
   CloudFront has deployed the distribution, which takes several minutes:

   ```sh
   aws cloudformation deploy --region us-west-2 --stack-name RtfmEdge \
     --template-file RtfmEdge.template.json --parameter-overrides \
       CertificateArn=$CERTIFICATE_ARN HostedZoneId=$ZONE_ID EndpointDomain=$ENDPOINT_DOMAIN
   aws cloudformation update-termination-protection --region us-west-2 \
     --stack-name RtfmEdge --enable-termination-protection
   ```

   Its resource policy names the Web Function by its ARN (`ResourceArn`), which the live schema
   of `AWS::Lambda::ResourcePolicy` in `us-west-2` accepts as a `WebFunctionResourceArn`,
   `…:web-function/<name>` (read on 2026-10-13).

   If CloudShell's session ends first, wait for the stack as in step 3, with
   `--region us-west-2 --stack-name RtfmEdge`, then turn on its termination protection with the
   second command above.

Then the smoke check's requests (Deploying the app stack, above) check the whole path to the
server through `rtfm.moonfetus.com`, and that the distribution's own `*.cloudfront.net` domain is
refused.

### The cost allocation tag

**Activate the `project` cost allocation tag** about a day after the stacks exist, in Billing ›
Cost allocation tags. It is listed twice: as a user-defined tag, from the tagged resources, and as
an IAM principal tag, once `rtfm-local` has called Bedrock (Your steps › 6). Activate both. Until
then the budget counts nothing.

### Updating a stack you deploy

When `access-stack.ts`, `toolkit-stack.ts` or an `edge-*.ts` changes, you update its stack from
CloudShell, as your own admin sign-in. These steps update `RtfmAccess`; for another stack, change
the stack name and the template, and for `RtfmEdgeCertificate` the region too (`us-east-1`). The
edge stacks need no `--capabilities`.

When a change adds a role to `RtfmAccess` that the boundary protects (`PROTECTED` in
`boundary.ts`), update `RtfmToolkit`, which holds the boundary, first, then `RtfmAccess`, so the
role never exists unprotected. Each new profile goes in `~/.aws/rtfm/config`, as in Your steps › 5.

1. **Write the template** with `npm run cdk -- synth --quiet`, and upload
   `infra/cdk.out/RtfmAccess.template.json` to CloudShell in `us-west-2`, as in Your steps › 1.
   `npm run cdk -- diff RtfmAccess --method=template` shows the change on the laptop beforehand.
2. **Make a change set without running it.** A parameter left out, here `BudgetEmail`, keeps the
   stack's current value, so the budget alarm's address needn't be typed again:

   ```sh
   aws cloudformation deploy --region us-west-2 --stack-name RtfmAccess \
     --template-file RtfmAccess.template.json --capabilities CAPABILITY_NAMED_IAM \
     --no-execute-changeset
   ```

   It prints the change set's ARN.
3. **Read the change set:**

   ```sh
   aws cloudformation describe-change-set --region us-west-2 --change-set-name <its ARN> \
     --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' \
     --output table
   ```

4. **Run it, and wait for the update:**

   ```sh
   aws cloudformation execute-change-set --region us-west-2 --change-set-name <its ARN>
   aws cloudformation wait stack-update-complete --region us-west-2 --stack-name RtfmAccess
   ```

An update leaves termination protection on.

## What the deploy path was checked against

These checks ran on 2026-10-13, through `npm run aws` and `npm run cdk`, against the stacks as
deployed by Your steps.

**The stacks the user deploys.** `cloudformation describe-stacks` as `rtfm-read` reads both:
`CREATE_COMPLETE`, `RtfmToolkit` with its parameters (`Qualifier=rtfm`, the execution policy,
`InputPermissionsBoundary=rtfm-boundary`) and its outputs (`BucketName`, `BucketDomainName`,
`BootstrapVersion` 32), and `RtfmAccess`, which has no outputs, with its `BudgetEmail` parameter.
`cloudformation get-template` matches `npm run cdk -- synth` for both.

**The user's own AWS setup is out of reach.** What a command run by the wrapper sees, printed by
a stand-in `--app` for `cdk synth` and `cdk diff`, with `AWS_PROFILE=work`,
`AWS_DEFAULT_PROFILE=work` and a dummy `AWS_ACCESS_KEY_ID` in the caller's environment:
`AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` are the files under `~/.aws/rtfm/`,
`AWS_PROFILE` is unset (`synth`) or `rtfm-read` (`diff`), no other `AWS_*` variable is passed
on, and `HOME` is a new temporary folder holding nothing but the CLI's cache of the `rtfm-read`
session. `npm run aws -- sts get-caller-identity` with `AWS_PROFILE=work` still answers
`assumed-role/rtfm-read/…`. The wrapper refuses `--profile work`, `--pro=work`, `--p work`, a
leading `--profile`, `cdk diff --profile work` and `configure list-profiles`. `npm run aws --
whoami`, which only an alias could answer, fails with the CLI's own "Invalid choice". This shows
that the AWS CLI is never pointed at `~/.aws/config` or `~/.aws/cli/alias`; it doesn't show what
those files hold, which nothing here reads.

**`RtfmApp` deploys**, as `rtfm-deploy` through the bootstrap's roles, with the execution role as
the stack's role. Its bucket's Block Public Access is S3's default, all four settings on, and the
bucket and log group carry `project=rtfm`.

**What a deploy can't do.** Each probe below was refused, and nothing it named was left behind.
The probe stacks (`RtfmProbe…`) rolled back and were destroyed.

| Probe | Refused with |
| --- | --- |
| `npm run cdk -- deploy RtfmAccess --no-execute` | `rtfm-deploy` is not authorized to perform `cloudformation:DescribeStacks` on `RtfmAccess`: no identity-based policy allows it |
| A stack named `RtfmAccess` with `RtfmAccess`'s own resources, through the deploy role, `--no-execute` | the deploy role is not authorized to perform `cloudformation:DeleteChangeSet` on `RtfmAccess`, with an explicit deny |
| `RtfmProbeAccess`: an inline policy (a harmless `Deny`) on the role `rtfm-read` | the execution role is not authorized to perform `iam:GetRolePolicy` on `rtfm-read`, with an explicit deny in `rtfm-cfn-execution` |
| `RtfmProbeUnbounded`: the role `rtfm-probe-unbounded` with no boundary | `iam:CreateRole` on it, with an explicit deny in `rtfm-cfn-execution` (CloudFormation reports it as a tagging error) |
| `RtfmProbeNotRtfm`: the bucket `not-rtfm-probe-q7x3k9` | `s3:CreateBucket` on it: no identity-based policy allows it |
| `ProbeNotRtfmStack`, a stack not named for RTFM, `--no-execute` | the deploy role is not authorized to perform `cloudformation:DescribeStacks` on it |
| `RtfmProbeFunctionUrl`: the role and function `rtfm-probe-fn`, with the boundary, then a Function URL with `AuthType` `NONE` | the role and function were created; `lambda:CreateFunctionUrlConfig` was refused with an explicit deny in `rtfm-cfn-execution` |
| `RtfmApp` with its bucket's Block Public Access turned off | `s3:PutBucketPublicAccessBlock` on `rtfm-app-438180219169-us-west-2`, with an explicit deny in `rtfm-cfn-execution`; the stack rolled back, the bucket's four settings still on |
| `RtfmProbeApproval`: a role with the boundary, deployed with no terminal | the CDK CLI stopped before CloudFormation: "Stack includes security-sensitive updates, but terminal (TTY) is not attached" |

**Bedrock through `rtfm-local`'s key.** `RTFM_MODELS=bedrock npm run server` ran on the main
checkout's `.data`, the user's real data, so that the ledger records the spend. Opening one
unwritten section, 1.1 of *Blippi at the Rave*, wrote it into that data: 4,447 characters, 422
`append` events, then `written`, for $0.0090, which `npm run usage` counted. The server reads its
key from `.env.local`, which nothing here reads, so that the key was `rtfm-local`'s rests on Your
steps › 5; its "Last used" in the IAM console confirms it (Your steps › 6).

**What the budget sees of Bedrock.** Cost Explorer shows Claude's charges as the service
"Claude Haiku 4.5 (Amazon Bedrock Edition)", billed by AWS Marketplace, with usage types such as
`USW2-MP:USW2_InputTokenCount_Global-Units`, apart from "Amazon Bedrock" (AWS). Grouped by the tag
`project`, all of it is untagged (`project$`). A model call has no resource of RTFM's to carry
the tag: Bedrock attributes on-demand cost to the IAM user or role that called, whose tags reach
Cost Explorer as IAM principal tags once activated (Amazon Bedrock User Guide, "IAM principal
attribution"), a different kind from the user-defined tag `user:project` the budget filters on.

## Files

- `app.ts`: `createApp`, the five stacks and the default synthesizer; `cdk.json` runs it.
- `rtfm.ts`: the account, region and qualifier, the names and ARNs of the bootstrap's and
  `RtfmAccess`'s resources, the table `rtfm-usage`'s name, ARN and actions, which `RtfmAccess`
  and `RtfmApp` both grant, the table `rtfm-app`'s name and ARN, and the partitions the roles'
  policies name.
- `toolkit-stack.ts`, `access-stack.ts`, `edge-certificate-stack.ts` and `edge-stack.ts`: the
  stacks you deploy. `edge-certificate-stack.ts` also holds the app's domain, and `edge-stack.ts`
  the host check's code and the Web Function's name, which a test keeps the same as
  `app-stack.ts`'s: an edge stack imports nothing from `app-stack.ts`, which would make every
  change to the app stack yours to approve (`PROCESS.md` › Authority). `app-stack.ts`:
  `RtfmApp`, with its resources' names and the asset that builds the Web Function's package
  (`scripts/build-web-function.ts`).
- `boundary.ts`: the boundary's statements. `bedrock.ts`: Claude's.
- `run-aws.ts`: `npm run aws` and `npm run cdk`, and `openAwsSession`, the ops tools' way to AWS.
- `testing.ts`: the tests' policy evaluator: whether a role's or user's policies, and its
  boundary, allow an action on a resource. It reads `Allow`, `Deny`, `NotAction` and the
  condition operators the stacks use, `ForAllValues` and `ForAnyValue` on a multivalued key such
  as `dynamodb:LeadingKeys` among them.
- `cdk-imports.test.ts`: only `infra/` imports the CDK packages, so they never reach the browser
  bundle or the server.

The tests synthesize in process with `aws-cdk-lib/assertions`, never through the CLI, so they run
offline, and without building the Web Function's package (The Web Function's package, above).
`npm run cdk -- synth` builds it and writes the templates, `RtfmToolkit.template.json`,
`RtfmAccess.template.json`, `RtfmApp.template.json`, `RtfmEdgeCertificate.template.json` and
`RtfmEdge.template.json`, and the package's folder, `asset.<hash>/`, to `infra/cdk.out/`
(gitignored).
