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

Before any other command, it runs `aws sts get-caller-identity` and refuses unless the answer is
the chosen role, assumed in account `438180219169`. The tests cover the environment it builds and
the identity check without calling AWS.

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

- **`RtfmToolkit`** (`toolkit-stack.ts`) is RTFM's bootstrap, which `cdk bootstrap --template`
  deploys in place of the CLI's own. The CLI's template gives its deploy role CloudFormation on
  every stack in the account, so it could change or delete another project's stack through that
  stack's own role, and its lookup role read access to the whole account. This one has the
  names `DefaultStackSynthesizer` expects for the `rtfm` qualifier: the staging bucket
  `cdk-rtfm-assets-438180219169-us-west-2`, the four roles above, and the version parameter
  `/cdk-bootstrap/rtfm/version` (version 32, whose roles and outputs it provides). It also holds
  the boundary and the execution policy, which have to exist before the execution role does.
  - `cdk bootstrap` passes it parameters, so it declares them, and each accepts only this
    template's value: the qualifier `rtfm`, the execution policy `rtfm-cfn-execution` and the
    boundary `rtfm-boundary`. Its `BootstrapVariant` keeps the CLI's own template from replacing
    it.
  - Only `rtfm-deploy` may assume its deploy and file publishing roles, and `rtfm-read` and
    `rtfm-deploy` its lookup role, never with an external ID.
- **`RtfmAccess`** (`access-stack.ts`): the users, the two roles, `rtfm-bedrock`, and the budget
  alarm. It has termination protection.

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

Steps 1 and 2 sign in as you, an admin, shown as `--profile <admin>`. They run the pinned CDK CLI
from `infra/` (`npx cdk`), not `npm run cdk`, which signs in only as RTFM's roles.

1. **Bootstrap**, with the qualifier, the boundary and the execution policy. `npm run cdk -- synth`
   writes the template, from the repo's root and with no credentials:

   ```sh
   npm run cdk -- synth --quiet
   cd infra
   npx cdk bootstrap aws://438180219169/us-west-2 --profile <admin> \
     --template cdk.out/RtfmToolkit.template.json --toolkit-stack-name RtfmToolkit \
     --qualifier rtfm \
     --cloudformation-execution-policies arn:aws:iam::438180219169:policy/rtfm-cfn-execution \
     --custom-permissions-boundary rtfm-boundary --termination-protection
   ```

2. **Deploy `RtfmAccess`** from `infra/`, with the address for the budget alarm:

   ```sh
   npx cdk deploy RtfmAccess --profile <admin> --parameters BudgetEmail=<your address>
   ```

   Then, in the Billing console's cost allocation tags, activate `project`. It shows there once
   a resource carries it.

3. **Make `rtfm-local`'s key.** In the IAM console, under the user `rtfm-local`, create an access
   key for code running outside AWS. Replace `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in
   `.env.local` at the main checkout's root with it, and check that a section still writes with
   `RTFM_MODELS=bedrock npm run dev`. Then delete the user you made by hand, with its keys and
   its policy.

4. **Make `rtfm-agent`'s key** the same way, for the CLI, and create RTFM's own files, leaving
   `~/.aws/config` and `~/.aws/credentials` alone. `~/.aws/rtfm/credentials`:

   ```ini
   [rtfm-agent]
   aws_access_key_id = <the key's ID>
   aws_secret_access_key = <the key's secret>
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

   Give neither file a `[default]` profile: with none, `cdk synth` finds no credentials and
   reaches nothing. `chmod 600` both. `npm run aws -- sts get-caller-identity` then answers with
   `assumed-role/rtfm-read/…`.

## Files

- `app.ts`: `createApp`, both stacks and the default synthesizer; `cdk.json` runs it.
- `rtfm.ts`: the account, region and qualifier, and every RTFM name and ARN.
- `toolkit-stack.ts`, `access-stack.ts`: the two stacks.
- `boundary.ts`: the boundary's statements. `bedrock.ts`: Claude's.
- `run-aws.ts`: `npm run aws` and `npm run cdk`.
- `testing.ts`: the tests' policy evaluator: whether a role's or user's policies, and its
  boundary, allow an action on a resource. It reads `Allow`, `Deny`, `NotAction` and the
  condition operators the stacks use.
- `cdk-imports.test.ts`: only `infra/` imports the CDK packages, so they never reach the browser
  bundle or the server.

The tests synthesize in process with `aws-cdk-lib/assertions`, never through the CLI, so they run
offline. `npm run cdk -- synth` writes both templates, `RtfmToolkit.template.json` and
`RtfmAccess.template.json`, to `infra/cdk.out/` (gitignored).
