import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { claudeStatements } from "./bedrock.ts";
import {
  BEDROCK_POLICY,
  BOOTSTRAP_VERSION_PARAMETER,
  BOUNDARY_POLICY,
  BUDGET,
  DEPLOY_ROLE,
  EXECUTION_POLICY,
  OPS_ROLE,
  QUALIFIER,
  READ_ROLE,
  RTFM_RESOURCES,
  STAGING_BUCKET,
  USER_STACKS,
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
const WEB_FUNCTION_AUTH_TYPE = "lambda:Request/WebFunctionAuthType";

/**
 * The stacks the user deploys, and `RtfmAccess`'s resources and the bootstrap's, which nothing a
 * stack creates may touch.
 */
const PROTECTED = [
  ...[BOUNDARY_POLICY, EXECUTION_POLICY, BEDROCK_POLICY].map(policyArn),
  ...[READ_ROLE, DEPLOY_ROLE, OPS_ROLE, `cdk-${QUALIFIER}-*`].map(roleArn),
  userArn("*"),
  ...USER_STACKS.map(stackArn),
  budgetArn(BUDGET),
];
/** A Web Function revision is created from a version of its code's object, so it reads the version too. */
const BOOTSTRAP_READS = ["s3:GetObject", "s3:GetObjectVersion", "ssm:GetParameter", "ssm:GetParameters"];

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
    // A whole resource policy, on a function or a Web Function, could grant anyone anything the
    // policy names, such as changing an endpoint's auth type from another account.
    new PolicyStatement({
      sid: "NoResourcePolicies",
      effect: Effect.DENY,
      actions: ["lambda:PutResourcePolicy"],
      resources: ["*"],
    }),
    // An endpoint's auth type is required when it is created.
    new PolicyStatement({
      sid: "OnlySignedWebFunctionEndpoints",
      effect: Effect.DENY,
      actions: ["lambda:CreateWebFunctionEndpoint"],
      resources: ["*"],
      conditions: { StringNotEquals: { [WEB_FUNCTION_AUTH_TYPE]: "IamAuth" } },
    }),
    // A Web Function made without an endpoint, as CloudFormation makes one, or an endpoint update
    // that leaves the auth type as it is, has none to check; any one given must be `IamAuth`.
    new PolicyStatement({
      sid: "OnlySignedWebFunctionAuthTypes",
      effect: Effect.DENY,
      actions: ["lambda:CreateWebFunction", "lambda:UpdateWebFunctionEndpoint"],
      resources: ["*"],
      conditions: {
        Null: { [WEB_FUNCTION_AUTH_TYPE]: "false" },
        StringNotEquals: { [WEB_FUNCTION_AUTH_TYPE]: "IamAuth" },
      },
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
