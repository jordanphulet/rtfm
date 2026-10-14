import type { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { WEB_FUNCTION_ENTRYPOINT as BUILT_ENTRYPOINT } from "../scripts/build-web-function.ts";
import {
  APP_BUCKET,
  APP_LOCAL_LOG_GROUP,
  APP_LOG_GROUP,
  APP_STACK,
  WEB_FUNCTION,
  WEB_FUNCTION_ENDPOINT,
  WEB_FUNCTION_ENTRYPOINT,
  WEB_FUNCTION_ROLE,
} from "./app-stack.ts";
import { createApp } from "./app.ts";
import {
  APP_TABLE,
  APP_TABLE_ARN,
  BOOTSTRAP_ROLES,
  BOUNDARY_POLICY,
  PASSCODE_PARTITION,
  PROJECT_TAG,
  STAGING_BUCKET,
  TOOLKIT_STACK,
  USAGE_TABLE,
  USAGE_TABLE_ARN,
  logGroupArn,
  policyArn,
  roleArn,
  webFunctionArn,
} from "./rtfm.ts";
import { decide, managedPolicyStatements, reachOf, resourcesOf, type RequestContext, type Statement } from "./testing.ts";

const app = createApp();
const appStack = app.node.findChild(APP_STACK) as Stack;
const template = Template.fromStack(appStack);
const resources = resourcesOf(appStack);
const toolkitResources = resourcesOf(app.node.findChild(TOOLKIT_STACK) as Stack);
const canExecute = reachOf(toolkitResources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
const boundary = managedPolicyStatements(toolkitResources, BOUNDARY_POLICY);

const ofType = (type: string) => Object.values(resources).filter((resource) => resource.Type === type);
const [revision] = ofType("AWS::Lambda::WebFunctionRevision").map(({ Properties }) => Properties);
const [endpoint] = ofType("AWS::Lambda::WebFunctionEndpoint").map(({ Properties }) => Properties);
const [role] = ofType("AWS::IAM::Role").map(({ Properties }) => Properties);
/** The table's actions CloudFormation's handlers use for a table like this one (no stream, no customer managed key). */
const TABLE_HANDLER_ACTIONS = [
  "dynamodb:CreateTable",
  "dynamodb:DescribeTable",
  "dynamodb:UpdateTable",
  "dynamodb:DeleteTable",
  "dynamodb:UpdateContinuousBackups",
  "dynamodb:DescribeContinuousBackups",
  "dynamodb:DescribeTimeToLive",
  "dynamodb:DescribeContributorInsights",
  "dynamodb:DescribeKinesisStreamingDestination",
  "dynamodb:GetResourcePolicy",
  "dynamodb:TagResource",
  "dynamodb:UntagResource",
  "dynamodb:ListTagsOfResource",
];
/** CloudFormation can't tag a Web Function's revisions or endpoints. */
const UNTAGGABLE = ["AWS::Lambda::WebFunctionRevision", "AWS::Lambda::WebFunctionEndpoint"];

/** Whether the Web Function's role may make a request: its own policy and the boundary both allow it. */
function webFunctionCan(action: string, resource: string, context: RequestContext = {}): boolean {
  const statements = (role!.Policies as { PolicyDocument: { Statement: Statement[] } }[]).flatMap(
    ({ PolicyDocument }) => PolicyDocument.Statement,
  );
  return decide(statements, action, resource, context) === "allow" && decide(boundary, action, resource, context) === "allow";
}

describe("the RtfmApp stack", () => {
  it("names every resource for RTFM, so the execution role may create it", () => {
    const named = Object.values(resources).map(
      ({ Properties }) =>
        Properties.LogGroupName ?? Properties.BucketName ?? Properties.TableName ?? Properties.RoleName ?? Properties.FunctionName,
    );
    expect(named).toEqual([
      APP_BUCKET,
      APP_TABLE,
      APP_LOG_GROUP,
      APP_LOCAL_LOG_GROUP,
      WEB_FUNCTION_ROLE,
      WEB_FUNCTION,
      WEB_FUNCTION,
      WEB_FUNCTION,
      USAGE_TABLE,
    ]);
    expect(canExecute("logs:CreateLogGroup", logGroupArn(APP_LOG_GROUP))).toBe(true);
    expect(canExecute("logs:CreateLogGroup", logGroupArn(APP_LOCAL_LOG_GROUP))).toBe(true);
    expect(canExecute("s3:CreateBucket", `arn:aws:s3:::${APP_BUCKET}`)).toBe(true);
    expect(canExecute("lambda:CreateWebFunction", webFunctionArn(WEB_FUNCTION))).toBe(true);
    expect(canExecute("lambda:CreateWebFunctionRevision", webFunctionArn(WEB_FUNCTION))).toBe(true);
  });

  it("leaves the bucket's Block Public Access to S3's default, which the boundary keeps", () => {
    template.hasResourceProperties("AWS::S3::Bucket", { PublicAccessBlockConfiguration: Match.absent() });
    expect(canExecute("s3:PutBucketPublicAccessBlock", `arn:aws:s3:::${APP_BUCKET}`)).toBe(false);
  });

  it("keeps the bucket when it leaves the stack, since it may hold data", () => {
    template.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" });
  });

  it.each([
    ["the library in rtfm-app", APP_TABLE],
    ["the spending ledger in rtfm-usage", USAGE_TABLE],
  ])("keeps %s: on demand, recoverable, protected from deletion and kept when it leaves the stack", (_, TableName) => {
    template.hasResource("AWS::DynamoDB::Table", {
      Properties: {
        TableName,
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        DeletionProtectionEnabled: true,
        GlobalSecondaryIndexes: Match.absent(),
      },
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
  });

  it("lets CloudFormation create, change and delete the tables under the boundary", () => {
    for (const table of [APP_TABLE_ARN, USAGE_TABLE_ARN]) {
      for (const action of TABLE_HANDLER_ACTIONS) expect(canExecute(action, table), action).toBe(true);
    }
  });

  it("tags every resource CloudFormation can tag, for the budget", () => {
    const taggable = Object.values(resources).filter(({ Type }) => !UNTAGGABLE.includes(Type));
    for (const { Properties } of taggable) {
      expect(Properties.Tags).toEqual([{ Key: PROJECT_TAG.key, Value: PROJECT_TAG.value }]);
    }
  });

  it("keeps the app's two log groups 30 days", () => {
    for (const LogGroupName of [APP_LOG_GROUP, APP_LOCAL_LOG_GROUP]) {
      template.hasResource("AWS::Logs::LogGroup", {
        Properties: { LogGroupName, RetentionInDays: 30 },
        DeletionPolicy: "Delete",
      });
    }
  });
});

describe("the Web Function", () => {
  it("is behind one signed endpoint, in this region, at most 2 environments and 100 requests a second", () => {
    expect(endpoint).toEqual({
      FunctionName: WEB_FUNCTION,
      EndpointName: WEB_FUNCTION_ENDPOINT,
      EndpointType: "HomeRegion",
      AuthType: "IamAuth",
      RevisionWeights: [{ RevisionId: { "Fn::GetAtt": [expect.any(String), "RevisionId"] }, Weight: 100 }],
      ScalingConfig: { MaxEnvironments: 2 },
      ThrottleConfig: { RateLimit: 100 },
    });
    const endpointArn = `${webFunctionArn(WEB_FUNCTION)}/endpoint/${WEB_FUNCTION_ENDPOINT}`;
    const iamAuth = { "lambda:Request/WebFunctionAuthType": "IamAuth" };
    expect(canExecute("lambda:CreateWebFunctionEndpoint", webFunctionArn(WEB_FUNCTION), iamAuth)).toBe(true);
    expect(canExecute("lambda:UpdateWebFunctionEndpoint", endpointArn, iamAuth)).toBe(true);
  });

  it("runs the built package on Node 24, for up to 300s a request, logging to /rtfm/app", () => {
    expect(revision!.BuildConfig).toEqual({
      CodeConfig: { S3Object: { Bucket: STAGING_BUCKET, Key: expect.stringMatching(/^[0-9a-f]{64}\.zip$/) } },
      RuntimeConfig: { Runtime: "nodejs24.x" },
    });
    expect(revision!.ServiceConfig).toMatchObject({
      TimeoutSeconds: 300,
      TelemetryConfig: { LoggingConfig: { LogGroup: APP_LOG_GROUP } },
    });
    const stagedCode = `arn:aws:s3:::${STAGING_BUCKET}/${(revision!.BuildConfig as { CodeConfig: { S3Object: { Key: string } } }).CodeConfig.S3Object.Key}`;
    expect(canExecute("s3:GetObject", stagedCode)).toBe(true);
    expect(canExecute("s3:GetObjectVersion", stagedCode)).toBe(true);
  });

  it("puts nothing secret in its environment, which rtfm-read can read: the entry and the table, and no passcode", () => {
    expect((revision!.ServiceConfig as { EnvironmentVariables: object }).EnvironmentVariables).toEqual({
      AWS_LAMBDA_NODEJS_ENTRYPOINT: BUILT_ENTRYPOINT,
      RTFM_APP_TABLE: APP_TABLE,
    });
    expect(WEB_FUNCTION_ENTRYPOINT).toBe(BUILT_ENTRYPOINT);
  });

  it("names its domain as the stack's output", () => {
    template.hasOutput("EndpointDomain", { Value: { "Fn::GetAtt": [Match.anyValue(), "DomainName"] } });
  });
});

describe("the Web Function's role", () => {
  it("carries the boundary, as every role an RTFM stack creates must", () => {
    expect(role!.PermissionsBoundary).toBe(policyArn(BOUNDARY_POLICY));
    expect(
      canExecute("iam:CreateRole", roleArn(WEB_FUNCTION_ROLE), { "iam:PermissionsBoundary": policyArn(BOUNDARY_POLICY) }),
    ).toBe(true);
    expect(canExecute("iam:PassRole", roleArn(WEB_FUNCTION_ROLE))).toBe(true);
  });

  it("is Lambda's to assume", () => {
    expect((role!.AssumeRolePolicyDocument as { Statement: Statement[] }).Statement).toEqual([
      { Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" } },
    ]);
  });

  it("writes to the app's two log groups and nowhere else", () => {
    for (const name of [APP_LOG_GROUP, APP_LOCAL_LOG_GROUP]) {
      expect(webFunctionCan("logs:PutLogEvents", `${logGroupArn(name)}:log-stream:x`), name).toBe(true);
      expect(webFunctionCan("logs:CreateLogStream", `${logGroupArn(name)}:log-stream:x`), name).toBe(true);
    }
    expect(webFunctionCan("logs:PutLogEvents", `${logGroupArn("/rtfm/other")}:log-stream:x`)).toBe(false);
    expect(webFunctionCan("logs:DeleteLogGroup", logGroupArn(APP_LOG_GROUP))).toBe(false);
  });

  it("reads and writes the library's items in rtfm-app, and the spending ledger's in rtfm-usage, and nothing else in DynamoDB", () => {
    for (const action of ["GetItem", "Query", "PutItem", "UpdateItem", "DeleteItem"]) {
      expect(webFunctionCan(`dynamodb:${action}`, APP_TABLE_ARN), action).toBe(true);
    }
    for (const action of ["Scan", "BatchWriteItem", "DeleteTable", "UpdateTable", "ConditionCheckItem"]) {
      expect(webFunctionCan(`dynamodb:${action}`, APP_TABLE_ARN), action).toBe(false);
    }
    for (const action of ["GetItem", "Query", "PutItem", "UpdateItem", "ConditionCheckItem"]) {
      expect(webFunctionCan(`dynamodb:${action}`, USAGE_TABLE_ARN), action).toBe(true);
    }
    for (const action of ["DeleteItem", "Scan", "BatchWriteItem", "DeleteTable", "UpdateTable"]) {
      expect(webFunctionCan(`dynamodb:${action}`, USAGE_TABLE_ARN), action).toBe(false);
    }
    expect(webFunctionCan("dynamodb:GetItem", APP_TABLE_ARN.replace(APP_TABLE, "rtfm-other"))).toBe(false);
    expect(webFunctionCan("dynamodb:Query", `${APP_TABLE_ARN}/index/any`)).toBe(false);
    expect(webFunctionCan("dynamodb:Query", `${USAGE_TABLE_ARN}/index/any`)).toBe(false);
  });

  it("reads the passcode's digest, in its partition of rtfm-app", () => {
    expect(webFunctionCan("dynamodb:GetItem", APP_TABLE_ARN, { "dynamodb:LeadingKeys": [PASSCODE_PARTITION] })).toBe(true);
  });

  it("can't call Bedrock: the Web Function runs only the fake models", () => {
    const haiku = "arn:aws:bedrock:us-west-2:438180219169:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0";
    expect(webFunctionCan("bedrock:InvokeModel", haiku)).toBe(false);
    expect(webFunctionCan("bedrock:InvokeModelWithResponseStream", haiku)).toBe(false);
  });
});
