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

Before any other command, it runs `aws sts get-caller-identity` and refuses unless the answer is
the chosen role, assumed in account `438180219169`. The tests cover the environment it builds,
the identity check and the arguments passed through `npm run aws`, without calling AWS.

## The identities

| Identity | What it is for | What it reaches |
| --- | --- | --- |
| `rtfm-local` (user) | The key in the server's `.env.local` | Claude on Bedrock, through the policy `rtfm-bedrock` |
| `rtfm-agent` (user) | The key in `~/.aws/rtfm/credentials` | Assuming `rtfm-read` and `rtfm-deploy`, nothing else |
| `rtfm-read` (role) | `npm run aws`, and `npm run cdk` but deploys | Reading RTFM's logs, stacks and buckets, assuming the lookup role (`cdk diff`), and Cost Explorer |
| `rtfm-deploy` (role) | `npm run cdk -- deploy` | Assuming the `rtfm` bootstrap's deploy, file publishing and lookup roles, nothing else |
| `cdk-rtfm-deploy-role-…` | The CDK CLI's deploys | CloudFormation on `Rtfm*` stacks, but only reading `RtfmAccess` and `RtfmToolkit`; passing the execution role |
| `cdk-rtfm-file-publishing-role-…` | Uploading assets | The staging bucket |
| `cdk-rtfm-lookup-role-…` | `cdk diff`'s reads | Reading `Rtfm*` stacks and the bootstrap's version |
| `cdk-rtfm-cfn-exec-role-…` | CloudFormation deploys as it | The execution policy, under the boundary |

`rtfm-bedrock` is the hand-made Bedrock policy, without `aws-marketplace:Unsubscribe` and with
its inference profiles narrowed to Claude's: `bedrock:InvokeModel` and
`InvokeModelWithResponseStream` on Claude's inference profiles and foundation models in any
region (a `global.` profile's foundation-model ARN has no region),
`bedrock-mantle:CreateInference` and `ListModels` on the account's `project/default`, and
`aws-marketplace:ViewSubscriptions` and `Subscribe`, which a model's first call needs.

`rtfm-read` also has actions on `*` that take no narrower resource: listing log groups, reading
the results of a Logs Insights query by the ID its own `StartQuery` returned, and Cost Explorer,
which covers the whole account. It can't list other queries (`DescribeQueries`) or stop them.

You deploy `RtfmToolkit` and `RtfmAccess` yourself, with your own admin sign-in. Both use
`LegacyStackSynthesizer`: no bootstrap role, so `rtfm-deploy` can change neither, and no template
asset, so the CLI sends the template inline (both are well under its 50 KiB limit, which the
tests check) rather than through the staging bucket, which `rtfm-deploy` can write. Every other
stack is named `Rtfm*` and deploys through the bootstrap: the app's default synthesizer is
`DefaultStackSynthesizer` with the qualifier `rtfm`.

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
- **`RtfmAccess`** (`access-stack.ts`): the users, the two roles, `rtfm-bedrock`, and the budget
  alarm. It has termination protection.
- **`RtfmApp`** (`app-stack.ts`): the app, deployed through the bootstrap with
  `npm run cdk -- deploy RtfmApp` (Deploying the app stack, below). It holds the log group
  `/rtfm/app`, kept 30 days and deleted with the stack, and the bucket
  `rtfm-app-438180219169-us-west-2`, with S3's default Block Public Access. The bucket is kept
  when it leaves the stack (`RemovalPolicy.RETAIN`), since it may hold data: deleting it is a
  step you take yourself.

## Deploying the app stack

`npm run cdk -- deploy RtfmApp` deploys as `rtfm-deploy`, through the bootstrap's roles: the file
publishing role uploads the template to the staging bucket, the deploy role makes and runs the
change set, and CloudFormation acts as the execution role, under the boundary. A deploy that the
boundary refuses fails on the refused resource and rolls back, leaving the stack as it was.

Without a terminal, `cdk deploy` stops at a change that widens access, such as a new role or
policy statement: it prints the IAM changes and exits ("terminal (TTY) is not attached") before
anything reaches CloudFormation. The orchestrator deploys with `--require-approval never`
(`PROCESS.md` › Review loop): the boundary limits what such a change can reach, and the review
reads its IAM changes in the diff.

The smoke check after a deploy reads what was deployed, one command each:

```sh
npm run aws -- cloudformation describe-stacks --stack-name RtfmApp \
  --query 'Stacks[0].StackStatus' --output text
npm run aws -- s3api get-public-access-block --bucket rtfm-app-438180219169-us-west-2 \
  --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' \
  --output text
npm run aws -- logs describe-log-groups --log-group-name-prefix /rtfm/app \
  --query 'logGroups[].[logGroupName,retentionInDays]' --output text
```

It passes when they print, in order:

- `CREATE_COMPLETE` or `UPDATE_COMPLETE`. A deploy with no changes ("(no changes)") leaves the
  status as it was, so after one `UPDATE_ROLLBACK_COMPLETE` passes too: the last update failed
  and the stack is back as it was deployed before it. The Block Public Access probe (below) left
  `RtfmApp` in that state.
- `True` four times: the bucket's Block Public Access is all on.
- `/rtfm/app` and `30`: the log group, kept 30 days.

## The boundary

`rtfm-boundary` (`boundary.ts`) is the permissions boundary the execution role carries, and
every role a stack creates must carry it too. The execution policy, `rtfm-cfn-execution`, is the
same document, so CloudFormation can do exactly what the boundary allows.

It allows every action of Logs, Lambda, DynamoDB, S3, SSM and IAM on resources named for RTFM:
log groups `rtfm-*`, `/rtfm/*` and `/aws/lambda/rtfm-*`; functions, tables, buckets, roles and
policies `rtfm-*`; and parameters `/rtfm/*`. **Every resource an app stack creates must be named
explicitly with the `rtfm-` prefix.** A name CloudFormation makes up begins with the stack's name
(`RtfmApp-ApiServiceRole1A2B`, or `rtfmapp-sitebucket1a2b` for a bucket) or with `CFN-` (a
parameter), and the boundary refuses it.

It also lets Claude be called as `rtfm-bedrock` does, less the Marketplace subscription, and
reads the staging bucket's objects and the bootstrap's version.

It denies, whatever any other policy allows:

- creating a role, or setting a role's boundary, with any boundary but `rtfm-boundary`, and
  removing a boundary;
- anything on the boundary, the execution policy, `rtfm-bedrock`, `rtfm-read`, `rtfm-deploy`, the
  bootstrap's roles, the stacks `RtfmAccess` and `RtfmToolkit`, and the budget;
- anything on an IAM user: no stack creates one, or a key;
- anything but reading on the staging bucket and the version parameter;
- a public endpoint: a Lambda Function URL whose auth type isn't `AWS_IAM` (a request without
  the auth type is denied too, so changing a URL's settings must restate `AWS_IAM`), and any
  function permission (`lambda:AddPermission`), even for an AWS service. Lambda has no condition
  key for a permission's source, so a permission for API Gateway or CloudFront would let another
  account's API or distribution expose the function to anyone;
- a role or policy with a path (`role/rtfm-x/any-name`), which `rtfm-*` would otherwise match;
- changing Block Public Access, on a bucket (`s3:PutBucketPublicAccessBlock`, which removing a
  bucket's block also takes) or on the account. Every bucket keeps S3's default, which blocks
  public access, so a bucket policy or ACL that would make a bucket public fails, whatever
  principal it names.

A CDK `Bucket` must leave `blockPublicAccess` unset. Unset, the bucket's template has no
`PublicAccessBlockConfiguration` and CloudFormation leaves S3's default alone. Set, even to
`BlockPublicAccess.BLOCK_ALL`, it makes CloudFormation call `PutBucketPublicAccessBlock`, which
the boundary refuses. `publicReadAccess` needs it set, so it can't be used either.

Making the app public, to anyone without AWS credentials, or letting a service invoke a function,
needs a change to the boundary, which only the user approves (`PROCESS.md` › Authority).

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

- CloudFront distributions, API Gateway APIs, Lambda event source mappings and KMS keys get an ID
  from AWS when they are made, so a policy can't name them in advance. Tag conditions
  (`aws:RequestTag` and `aws:ResourceTag` on `project`) could scope them instead. The staging
  bucket uses S3's own encryption, so it needs no key.
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

The bootstrap has no container image repository, so stacks can't use Docker image assets.

## The budget

`rtfm-monthly` is a monthly AWS Budgets cost budget of $20, the gateway's monthly cap
(`server/config.ts`). It emails the address given as `BudgetEmail` at deploy when the month's
actual spend passes 80% and when its forecast passes 100%, so no address is committed. It counts
the cost carrying the tag `project=rtfm`, which the app puts on every resource it makes, the IAM
users and roles included. AWS counts a tag only once it is activated as a cost allocation tag.

## Your steps

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

5. **Put them on the laptop.** `rtfm-local`'s goes in `.env.local` at the main checkout's root,
   as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, keeping `AWS_REGION`. `rtfm-agent`'s goes
   in RTFM's own files, leaving `~/.aws/config` and `~/.aws/credentials` alone. Open both in an
   editor, so the secret stays out of the shell's history:

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

6. **Check `rtfm-local`'s key, then delete the user you made by hand.** Write one section with
   `RTFM_MODELS=bedrock npm run dev`. In the IAM console, under the user `rtfm-local`, its key's
   "Last used" should then show Bedrock; that is what shows the server used the new key and not
   the old one. Then delete the hand-made user, with its keys and its policy.

7. **Activate the `project` cost allocation tag**, about a day after the stacks exist (Billing ›
   Cost allocation tags). It is listed twice: as a user-defined tag, from the tagged resources,
   and as an IAM principal tag, once `rtfm-local` has called Bedrock. Activate both. Until then the
   budget counts nothing.

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

- `app.ts`: `createApp`, the three stacks and the default synthesizer; `cdk.json` runs it.
- `rtfm.ts`: the account, region and qualifier, and the names and ARNs of the bootstrap's and
  `RtfmAccess`'s resources.
- `toolkit-stack.ts`, `access-stack.ts`: the two stacks you deploy. `app-stack.ts`: `RtfmApp`,
  with its resources' names.
- `boundary.ts`: the boundary's statements. `bedrock.ts`: Claude's.
- `run-aws.ts`: `npm run aws` and `npm run cdk`.
- `testing.ts`: the tests' policy evaluator: whether a role's or user's policies, and its
  boundary, allow an action on a resource. It reads `Allow`, `Deny`, `NotAction` and the
  condition operators the stacks use.
- `cdk-imports.test.ts`: only `infra/` imports the CDK packages, so they never reach the browser
  bundle or the server.

The tests synthesize in process with `aws-cdk-lib/assertions`, never through the CLI, so they run
offline. `npm run cdk -- synth` writes the templates, `RtfmToolkit.template.json`,
`RtfmAccess.template.json` and `RtfmApp.template.json`, to `infra/cdk.out/` (gitignored).
