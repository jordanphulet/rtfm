import {
  CfnOutput,
  CfnParameter,
  Duration,
  LegacyStackSynthesizer,
  RemovalPolicy,
  Stack,
  Validations,
} from "aws-cdk-lib";
import {
  ArnPrincipal,
  Effect,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { boundaryStatements } from "./boundary.ts";
import {
  ACCOUNT,
  BOOTSTRAP_ROLES,
  BOOTSTRAP_VERSION_PARAMETER,
  BOUNDARY_POLICY,
  DEPLOY_ROLE,
  EXECUTION_POLICY,
  QUALIFIER,
  READ_ROLE,
  REGION,
  RTFM_STACKS,
  STAGING_BUCKET,
  TOOLKIT_STACK,
  USER_STACKS,
  bucketArns,
  parameterArn,
  policyArn,
  roleArn,
  stackArn,
  webFunctionArn,
} from "./rtfm.ts";

/** The bootstrap version whose roles, bucket and outputs this template provides. */
export const BOOTSTRAP_VERSION = "32";

const STACK_READS = [
  "cloudformation:DescribeStacks",
  "cloudformation:DescribeStackEvents",
  "cloudformation:DescribeStackResources",
  "cloudformation:ListStackResources",
  "cloudformation:GetTemplate",
  "cloudformation:GetTemplateSummary",
];
const STACK_CHANGES = [
  "cloudformation:CreateChangeSet",
  "cloudformation:DescribeChangeSet",
  "cloudformation:ListChangeSets",
  "cloudformation:DeleteChangeSet",
  "cloudformation:ExecuteChangeSet",
  "cloudformation:CreateStack",
  "cloudformation:UpdateStack",
  "cloudformation:DeleteStack",
  "cloudformation:RollbackStack",
  "cloudformation:ContinueUpdateRollback",
  "cloudformation:UpdateTerminationProtection",
];

const readVersion = () =>
  new PolicyStatement({
    sid: "ReadVersion",
    actions: ["ssm:GetParameter", "ssm:GetParameters"],
    resources: [parameterArn(BOOTSTRAP_VERSION_PARAMETER)],
  });

/**
 * RTFM's CDK bootstrap, which `cdk bootstrap --template` deploys in place of the CLI's own. Its
 * roles have the names `DefaultStackSynthesizer` expects for the `rtfm` qualifier, but reach only
 * RTFM's stacks, and CloudFormation deploys under the boundary.
 */
export class RtfmToolkitStack extends Stack {
  constructor(scope: Construct) {
    super(scope, TOOLKIT_STACK, {
      env: { account: ACCOUNT, region: REGION },
      synthesizer: new LegacyStackSynthesizer(),
      description: "RTFM's CDK bootstrap (qualifier rtfm): deployed with cdk bootstrap --template",
    });
    this.acceptCliParameters();
    const bucket = this.stagingBucket();
    new StringParameter(this, "CdkBootstrapVersion", {
      parameterName: BOOTSTRAP_VERSION_PARAMETER,
      stringValue: BOOTSTRAP_VERSION,
    });
    this.executionRole();
    const { deploy, filePublishing, lookup } = BOOTSTRAP_ROLES;
    this.bootstrapRole("DeploymentActionRole", deploy, [DEPLOY_ROLE], deployStatements());
    this.bootstrapRole("FilePublishingRole", filePublishing, [DEPLOY_ROLE], filePublishingStatements());
    this.bootstrapRole("LookupRole", lookup, [READ_ROLE, DEPLOY_ROLE], lookupStatements());

    this.letLambdaReadWebFunctionCode(bucket);

    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "BucketDomainName", { value: bucket.bucketRegionalDomainName });
    new CfnOutput(this, "BootstrapVersion", { value: BOOTSTRAP_VERSION });
  }

  /** Lambda reads a Web Function revision's code from the staging bucket as its own service principal. */
  private letLambdaReadWebFunctionCode(bucket: Bucket): void {
    bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: "LambdaReadsWebFunctionCode",
        principals: [new ServicePrincipal("lambda.amazonaws.com")],
        actions: ["s3:GetObject", "s3:GetObjectVersion"],
        resources: [bucket.arnForObjects("*")],
        conditions: {
          ArnLike: { "aws:SourceArn": `${webFunctionArn("rtfm-*")}/revision/*` },
          StringEquals: { "aws:SourceAccount": ACCOUNT },
        },
      }),
    );
  }

  /**
   * `cdk bootstrap` passes these, so the template declares them; each accepts only what this
   * template builds. `BootstrapVariant` keeps the CLI's own template from replacing this one.
   */
  private acceptCliParameters(): void {
    const onlyAccepts = (id: string, value: string, isDefault = false) =>
      new CfnParameter(this, id, {
        type: "String",
        allowedValues: [value],
        default: isDefault ? value : undefined,
        description: `Only ${value}`,
      });
    onlyAccepts("Qualifier", QUALIFIER);
    onlyAccepts("CloudFormationExecutionPolicies", policyArn(EXECUTION_POLICY));
    onlyAccepts("InputPermissionsBoundary", BOUNDARY_POLICY);
    onlyAccepts("FileAssetsBucketKmsKeyId", "AWS_MANAGED_KEY", true);
    onlyAccepts("PublicAccessBlockConfiguration", "true", true);
    new CfnParameter(this, "BootstrapVariant", { type: "String", default: "RTFM: scoped to RTFM's resources" });
    Validations.of(this).acknowledge({
      id: "CloudFormation-Validate::W2001",
      reason: "cdk bootstrap passes these parameters, which this template never reads",
    });
  }

  private stagingBucket(): Bucket {
    return new Bucket(this, "StagingBucket", {
      bucketName: STAGING_BUCKET,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        { noncurrentVersionExpiration: Duration.days(30) },
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }

  private executionRole(): void {
    const boundary = new ManagedPolicy(this, "Boundary", {
      managedPolicyName: BOUNDARY_POLICY,
      statements: boundaryStatements(),
    });
    const execution = new ManagedPolicy(this, "ExecutionPolicy", {
      managedPolicyName: EXECUTION_POLICY,
      statements: boundaryStatements(),
    });
    new Role(this, "CloudFormationExecutionRole", {
      roleName: BOOTSTRAP_ROLES.execution,
      assumedBy: new ServicePrincipal("cloudformation.amazonaws.com"),
      managedPolicies: [execution],
      permissionsBoundary: boundary,
    });
  }

  /** A role only RTFM's own roles may assume, and never on another's behalf (no external ID). */
  private bootstrapRole(id: string, roleName: string, assumers: string[], statements: PolicyStatement[]): void {
    new Role(this, id, {
      roleName,
      assumedBy: new ArnPrincipal(`arn:aws:iam::${ACCOUNT}:root`).withConditions({
        ArnEquals: { "aws:PrincipalArn": assumers.map(roleArn) },
        Null: { "sts:ExternalId": "true" },
      }),
      inlinePolicies: { [id]: new PolicyDocument({ statements }) },
    });
  }
}

function deployStatements(): PolicyStatement[] {
  return [
    new PolicyStatement({
      sid: "DeployRtfmStacks",
      actions: [...STACK_READS, ...STACK_CHANGES],
      resources: [RTFM_STACKS],
    }),
    new PolicyStatement({
      sid: "OnlyReadUserStacks",
      effect: Effect.DENY,
      notActions: ["cloudformation:Describe*", "cloudformation:Get*", "cloudformation:List*"],
      resources: USER_STACKS.map(stackArn),
    }),
    new PolicyStatement({
      sid: "PassExecutionRole",
      actions: ["iam:PassRole"],
      resources: [roleArn(BOOTSTRAP_ROLES.execution)],
    }),
    new PolicyStatement({
      sid: "ReadStagingBucket",
      actions: ["s3:GetObject*", "s3:GetBucket*", "s3:List*"],
      resources: bucketArns(STAGING_BUCKET),
    }),
    readVersion(),
  ];
}

function filePublishingStatements(): PolicyStatement[] {
  return [
    new PolicyStatement({
      sid: "PublishToStagingBucket",
      actions: [
        "s3:GetObject*",
        "s3:GetBucket*",
        "s3:GetEncryptionConfiguration",
        "s3:List*",
        "s3:DeleteObject*",
        "s3:PutObject*",
        "s3:Abort*",
      ],
      resources: bucketArns(STAGING_BUCKET),
    }),
  ];
}

function lookupStatements(): PolicyStatement[] {
  return [
    new PolicyStatement({ sid: "ReadRtfmStacks", actions: STACK_READS, resources: [RTFM_STACKS] }),
    readVersion(),
  ];
}
