import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { claudeStatements } from "./bedrock.ts";
import {
  ACCESS_STACK,
  BEDROCK_POLICY,
  BOOTSTRAP_VERSION_PARAMETER,
  BOUNDARY_POLICY,
  BUDGET,
  DEPLOY_ROLE,
  EXECUTION_POLICY,
  QUALIFIER,
  READ_ROLE,
  RTFM_RESOURCES,
  STAGING_BUCKET,
  TOOLKIT_STACK,
  bucketArns,
  budgetArn,
  logGroupArn,
  parameterArn,
  policyArn,
  roleArn,
  stackArn,
  userArn,
} from "./rtfm.ts";

const RTFM_SERVICES = ["logs:*", "lambda:*", "dynamodb:*", "s3:*", "ssm:*", "iam:*"];

/** `RtfmAccess`'s resources and the bootstrap's, which nothing a stack creates may touch. */
const PROTECTED = [
  ...[BOUNDARY_POLICY, EXECUTION_POLICY, BEDROCK_POLICY].map(policyArn),
  ...[READ_ROLE, DEPLOY_ROLE, `cdk-${QUALIFIER}-*`].map(roleArn),
  userArn("*"),
  stackArn(ACCESS_STACK),
  stackArn(TOOLKIT_STACK),
  budgetArn(BUDGET),
];
const BOOTSTRAP_READS = ["s3:GetObject", "ssm:GetParameter", "ssm:GetParameters"];

function allows(): PolicyStatement[] {
  return [
    new PolicyStatement({
      sid: "RtfmResources",
      actions: RTFM_SERVICES,
      resources: Object.values(RTFM_RESOURCES).flat(),
    }),
    ...claudeStatements(),
    new PolicyStatement({
      sid: "ReadBootstrap",
      actions: BOOTSTRAP_READS,
      resources: [`arn:aws:s3:::${STAGING_BUCKET}/*`, parameterArn(BOOTSTRAP_VERSION_PARAMETER)],
    }),
    new PolicyStatement({
      sid: "ListLogGroups",
      actions: ["logs:DescribeLogGroups"],
      resources: [logGroupArn("*")],
    }),
  ];
}

function denials(): PolicyStatement[] {
  return [
    new PolicyStatement({
      sid: "RequireBoundary",
      effect: Effect.DENY,
      actions: ["iam:CreateRole", "iam:PutRolePermissionsBoundary"],
      resources: ["*"],
      conditions: { StringNotEquals: { "iam:PermissionsBoundary": policyArn(BOUNDARY_POLICY) } },
    }),
    new PolicyStatement({
      sid: "KeepBoundary",
      effect: Effect.DENY,
      actions: ["iam:DeleteRolePermissionsBoundary", "iam:DeleteUserPermissionsBoundary"],
      resources: ["*"],
    }),
    new PolicyStatement({
      sid: "LeaveAccessAndBootstrapAlone",
      effect: Effect.DENY,
      actions: ["*"],
      resources: PROTECTED,
    }),
    new PolicyStatement({
      sid: "OnlyReadBootstrap",
      effect: Effect.DENY,
      notActions: BOOTSTRAP_READS,
      resources: [...bucketArns(STAGING_BUCKET), parameterArn(BOOTSTRAP_VERSION_PARAMETER)],
    }),
    // A bucket keeps S3's default Block Public Access, so a public bucket policy or ACL fails.
    // Removing a bucket's block (`DeletePublicAccessBlock`) also takes `s3:PutBucketPublicAccessBlock`.
    new PolicyStatement({
      sid: "KeepBlockPublicAccess",
      effect: Effect.DENY,
      actions: ["s3:PutBucketPublicAccessBlock", "s3:PutAccountPublicAccessBlock"],
      resources: ["*"],
    }),
    // A negated operator holds when the key is missing, so this also denies a request without it.
    new PolicyStatement({
      sid: "OnlySignedFunctionUrls",
      effect: Effect.DENY,
      actions: ["lambda:CreateFunctionUrlConfig", "lambda:UpdateFunctionUrlConfig"],
      resources: ["*"],
      conditions: { StringNotEquals: { "lambda:FunctionUrlAuthType": "AWS_IAM" } },
    }),
    // Even a service principal's permission lets another account's API Gateway or CloudFront
    // invoke the function, since Lambda has no condition key for the source.
    new PolicyStatement({
      sid: "NoFunctionPermissions",
      effect: Effect.DENY,
      actions: ["lambda:AddPermission"],
      resources: ["*"],
    }),
    // Names can't hold `/`, so `*/*` means a path, which `rtfm-*` would let in (`role/rtfm-x/any`).
    new PolicyStatement({
      sid: "NoIamPaths",
      effect: Effect.DENY,
      actions: ["iam:*"],
      resources: [roleArn("*/*"), policyArn("*/*")],
    }),
  ];
}

/**
 * The permissions boundary every role an RTFM stack creates must carry, and the execution
 * policy CloudFormation deploys with: RTFM's resources, and nothing else.
 */
export function boundaryStatements(): PolicyStatement[] {
  return [...allows(), ...denials()];
}
