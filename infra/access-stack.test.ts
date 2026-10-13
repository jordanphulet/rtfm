import type { Stack } from "aws-cdk-lib";
import type { CloudFormationStackArtifact } from "aws-cdk-lib/cx-api";
import { describe, expect, it } from "vitest";
import { MONTHLY_BUDGET_USD } from "./access-stack.ts";
import { createApp } from "./app.ts";
import { ACCESS_STACK, ACCOUNT, AGENT_USER, BOOTSTRAP_ROLES, DEPLOY_ROLE, LOCAL_USER, READ_ROLE, roleArn } from "./rtfm.ts";
import { INLINE_TEMPLATE_BUDGET, logicalIdNamed, reachOf, resourcesOf, trustOf, type Statement } from "./testing.ts";

const app = createApp();
const resources = resourcesOf(app.node.findChild(ACCESS_STACK) as Stack);

const HAIKU = "anthropic.claude-haiku-4-5-20251001-v1:0";
const bedrock = (resource: string) => `arn:aws:bedrock:${resource}`;
const logGroup = (name: string) => `arn:aws:logs:us-west-2:${ACCOUNT}:log-group:${name}:*`;
const stackNamed = (name: string, region = "us-west-2") =>
  `arn:aws:cloudformation:${region}:${ACCOUNT}:stack/${name}/0a1b2c`;
const webFunction = (path: string) => `arn:aws:lambda:us-west-2:${ACCOUNT}:web-function/${path}`;
const table = (path: string, region = "us-west-2", account = ACCOUNT) => `arn:aws:dynamodb:${region}:${account}:table/${path}`;
const resourceType = (name: string) => `arn:aws:cloudformation:us-west-2::type/resource/${name}`;

function readRoleStatements(): Statement[] {
  const role = resources[logicalIdNamed(resources, "AWS::IAM::Role", "RoleName", READ_ROLE)];
  const { Policies } = role.Properties as { Policies: { PolicyDocument: { Statement: Statement[] } }[] };
  return Policies.flatMap((policy) => policy.PolicyDocument.Statement);
}

const actionsOf = (statements: Statement[]) => statements.flatMap((statement) => [statement.Action ?? []].flat()).sort();

describe("the RtfmAccess stack", () => {
  it("is deployed with the user's own sign-in and an inline template, never through the bootstrap", () => {
    const artifact = app.synth().getStackByName(ACCESS_STACK) as CloudFormationStackArtifact;
    expect(artifact.assumeRoleArn).toBeUndefined();
    expect(artifact.cloudFormationExecutionRoleArn).toBeUndefined();
    expect(artifact.stackTemplateAssetObjectUrl).toBeUndefined();
    expect(JSON.stringify(artifact.template, null, 1).length).toBeLessThan(INLINE_TEMPLATE_BUDGET);
    expect(artifact.terminationProtection).toBe(true);
  });

  it("lets rtfm-local call Claude on Bedrock, and nothing else", () => {
    const can = reachOf(resources, "AWS::IAM::User", LOCAL_USER);
    expect(can("bedrock:InvokeModel", bedrock(`us-west-2:${ACCOUNT}:inference-profile/global.${HAIKU}`))).toBe(true);
    expect(can("bedrock:InvokeModelWithResponseStream", bedrock(`::foundation-model/${HAIKU}`))).toBe(true);
    expect(can("bedrock:InvokeModel", bedrock(`us-east-1::foundation-model/${HAIKU}`))).toBe(true);
    expect(can("bedrock-mantle:CreateInference", `arn:aws:bedrock-mantle:us-west-2:${ACCOUNT}:project/default`)).toBe(true);
    expect(can("aws-marketplace:Subscribe", "*")).toBe(true);

    expect(can("bedrock:InvokeModel", bedrock(`us-west-2:${ACCOUNT}:inference-profile/us.meta.llama4-maverick-17b-v1:0`))).toBe(false);
    expect(can("bedrock:InvokeModel", bedrock("us-west-2::foundation-model/amazon.nova-pro-v1:0"))).toBe(false);
    expect(can("bedrock-mantle:CreateInference", `arn:aws:bedrock-mantle:us-west-2:${ACCOUNT}:project/work`)).toBe(false);
    expect(can("aws-marketplace:Unsubscribe", "*")).toBe(false);
    expect(can("s3:GetObject", "arn:aws:s3:::rtfm-site/index.html")).toBe(false);
  });

  it("lets rtfm-agent only assume rtfm-read and rtfm-deploy", () => {
    const can = reachOf(resources, "AWS::IAM::User", AGENT_USER);
    expect(can("sts:AssumeRole", roleArn(READ_ROLE))).toBe(true);
    expect(can("sts:AssumeRole", roleArn(DEPLOY_ROLE))).toBe(true);
    expect(can("sts:AssumeRole", roleArn(BOOTSTRAP_ROLES.deploy))).toBe(false);
    expect(can("sts:AssumeRole", roleArn("work-admin"))).toBe(false);
    expect(can("bedrock:InvokeModel", bedrock(`::foundation-model/${HAIKU}`))).toBe(false);
  });

  it("lets only rtfm-agent assume rtfm-read and rtfm-deploy", () => {
    const agent = { "Fn::GetAtt": [logicalIdNamed(resources, "AWS::IAM::User", "UserName", AGENT_USER), "Arn"] };
    for (const role of [READ_ROLE, DEPLOY_ROLE]) {
      expect(trustOf(resources, role)).toEqual([
        { Action: "sts:AssumeRole", Effect: "Allow", Principal: { AWS: agent } },
      ]);
    }
  });

  it("lets rtfm-read read RTFM's logs, stacks, buckets and costs, and change nothing", () => {
    const can = reachOf(resources, "AWS::IAM::Role", READ_ROLE);
    expect(can("logs:FilterLogEvents", logGroup("/aws/lambda/rtfm-api"))).toBe(true);
    expect(can("logs:StartQuery", logGroup("rtfm-server"))).toBe(true);
    expect(can("logs:GetQueryResults", "*")).toBe(true);
    expect(can("cloudformation:DescribeStacks", stackNamed(ACCESS_STACK))).toBe(true);
    expect(can("cloudformation:GetTemplate", stackNamed("RtfmApp"))).toBe(true);
    expect(can("s3:GetObject", "arn:aws:s3:::rtfm-site/index.html")).toBe(true);
    expect(can("sts:AssumeRole", roleArn(BOOTSTRAP_ROLES.lookup))).toBe(true);
    expect(can("ce:GetCostAndUsage", "*")).toBe(true);

    expect(can("logs:FilterLogEvents", logGroup("/aws/lambda/work-billing"))).toBe(false);
    expect(can("logs:DescribeQueries", "*")).toBe(false);
    expect(can("logs:StopQuery", "*")).toBe(false);
    expect(can("cloudformation:DescribeStacks", stackNamed("WorkStack"))).toBe(false);
    expect(can("cloudformation:GetTemplate", stackNamed("CDKToolkit"))).toBe(false);
    expect(can("s3:GetObject", "arn:aws:s3:::work-reports/q3.csv")).toBe(false);
    expect(can("logs:PutLogEvents", logGroup("rtfm-server"))).toBe(false);
    expect(can("cloudformation:UpdateStack", stackNamed("RtfmApp"))).toBe(false);
    expect(can("s3:PutObject", "arn:aws:s3:::rtfm-site/index.html")).toBe(false);
    expect(can("sts:AssumeRole", roleArn(BOOTSTRAP_ROLES.deploy))).toBe(false);
  });

  it("lets rtfm-read read RTFM's Web Functions, their revisions, endpoints and resource policy", () => {
    const can = reachOf(resources, "AWS::IAM::Role", READ_ROLE);
    expect(can("lambda:GetWebFunction", webFunction("rtfm-app"))).toBe(true);
    expect(can("lambda:ListWebFunctionRevisions", webFunction("rtfm-app"))).toBe(true);
    expect(can("lambda:ListWebFunctionEndpoints", webFunction("rtfm-app"))).toBe(true);
    expect(can("lambda:GetWebFunctionRevision", webFunction("rtfm-app/revision/3"))).toBe(true);
    expect(can("lambda:GetWebFunctionEndpoint", webFunction("rtfm-app/endpoint/web"))).toBe(true);
    expect(can("lambda:GetResourcePolicy", webFunction("rtfm-app"))).toBe(true);

    expect(can("lambda:GetWebFunction", webFunction("work-api"))).toBe(false);
    expect(can("lambda:GetWebFunctionEndpoint", webFunction("work-api/endpoint/web"))).toBe(false);
    expect(can("lambda:GetResourcePolicy", webFunction("work-api"))).toBe(false);
    expect(can("lambda:ListWebFunctions", "*")).toBe(false);
  });

  it("lets rtfm-read change no Web Function, endpoint, revision or resource policy", () => {
    const can = reachOf(resources, "AWS::IAM::Role", READ_ROLE);
    const writes: [string, string][] = [
      ["lambda:CreateWebFunction", webFunction("rtfm-app")],
      ["lambda:DeleteWebFunction", webFunction("rtfm-app")],
      ["lambda:CreateWebFunctionRevision", webFunction("rtfm-app")],
      ["lambda:DeleteWebFunctionRevision", webFunction("rtfm-app/revision/3")],
      ["lambda:CreateWebFunctionEndpoint", webFunction("rtfm-app")],
      ["lambda:UpdateWebFunctionEndpoint", webFunction("rtfm-app/endpoint/web")],
      ["lambda:DeleteWebFunctionEndpoint", webFunction("rtfm-app/endpoint/web")],
      ["lambda:InvokeWebFunctionEndpoint", webFunction("rtfm-app/endpoint/web")],
      ["lambda:PutResourcePolicy", webFunction("rtfm-app")],
      ["lambda:DeleteResourcePolicy", webFunction("rtfm-app")],
    ];
    for (const [action, resource] of writes) expect(can(action, resource), action).toBe(false);
  });

  it("lets rtfm-read describe RTFM's tables and their point-in-time recovery, and no other table", () => {
    const can = reachOf(resources, "AWS::IAM::Role", READ_ROLE);
    expect(can("dynamodb:DescribeTable", table("rtfm-app"))).toBe(true);
    expect(can("dynamodb:DescribeContinuousBackups", table("rtfm-app"))).toBe(true);
    expect(can("dynamodb:DescribeTable", table("rtfm-usage"))).toBe(true);

    expect(can("dynamodb:DescribeTable", table("work-orders"))).toBe(false);
    expect(can("dynamodb:DescribeContinuousBackups", table("work-orders"))).toBe(false);
    expect(can("dynamodb:DescribeTable", table("rtfm-app", "us-east-1"))).toBe(false);
    expect(can("dynamodb:DescribeTable", table("rtfm-app", "us-west-2", "111122223333"))).toBe(false);
    expect(can("dynamodb:ListTables", "*")).toBe(false);
    expect(actionsOf(readRoleStatements()).filter((action) => action.startsWith("dynamodb:"))).toEqual([
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:DescribeTable",
    ]);
  });

  it("lets rtfm-read change no table or its backups, and read none of its items", () => {
    const can = reachOf(resources, "AWS::IAM::Role", READ_ROLE);
    const denied: [string, string][] = [
      ["dynamodb:UpdateTable", table("rtfm-app")],
      ["dynamodb:UpdateContinuousBackups", table("rtfm-app")],
      ["dynamodb:DeleteTable", table("rtfm-app")],
      ["dynamodb:CreateBackup", table("rtfm-app")],
      ["dynamodb:DeleteBackup", table("rtfm-app/backup/01700000000000-a1b2c3d4")],
      ["dynamodb:RestoreTableToPointInTime", table("rtfm-app")],
      ["dynamodb:UpdateTimeToLive", table("rtfm-app")],
      ["dynamodb:PutResourcePolicy", table("rtfm-app")],
      ["dynamodb:PutItem", table("rtfm-app")],
      ["dynamodb:DeleteItem", table("rtfm-app")],
      ["dynamodb:GetItem", table("rtfm-app")],
      ["dynamodb:Query", table("rtfm-app")],
      ["dynamodb:Scan", table("rtfm-app")],
    ];
    for (const [action, resource] of denied) expect(can(action, resource), action).toBe(false);
  });

  it("lets rtfm-read describe a resource type's schema, and register, deregister or activate none", () => {
    const can = reachOf(resources, "AWS::IAM::Role", READ_ROLE);
    expect(can("cloudformation:DescribeType", "*")).toBe(true);

    const writes = [
      "RegisterType",
      "DeregisterType",
      "ActivateType",
      "DeactivateType",
      "SetTypeDefaultVersion",
      "SetTypeConfiguration",
      "PublishType",
      "TestType",
    ];
    for (const action of writes) {
      expect(can(`cloudformation:${action}`, "*"), action).toBe(false);
      expect(can(`cloudformation:${action}`, resourceType("AWS-Lambda-ResourcePolicy")), action).toBe(false);
    }
  });

  it("gives rtfm-read on every resource only reads that take no narrower one", () => {
    expect(actionsOf(readRoleStatements().filter((statement) => statement.Resource === "*"))).toEqual([
      "ce:Describe*",
      "ce:Get*",
      "ce:List*",
      "cloudformation:DescribeType",
      "logs:DescribeLogGroups",
      "logs:GetQueryResults",
    ]);
  });

  it("lets rtfm-read describe the edge stacks in us-east-1, and change none of them", () => {
    const can = reachOf(resources, "AWS::IAM::Role", READ_ROLE);
    const certificate = stackNamed("RtfmEdgeCertificate", "us-east-1");
    expect(can("cloudformation:DescribeStacks", certificate)).toBe(true);
    expect(can("cloudformation:DescribeStackEvents", certificate)).toBe(true);
    expect(can("cloudformation:GetTemplate", certificate)).toBe(true);

    expect(can("cloudformation:DescribeStacks", stackNamed("RtfmApp", "us-east-1"))).toBe(false);
    expect(can("cloudformation:DescribeStacks", stackNamed("WorkEdge", "us-east-1"))).toBe(false);
    expect(can("cloudformation:DescribeStacks", stackNamed("RtfmEdgeCertificate", "eu-west-1"))).toBe(false);
    for (const action of ["UpdateStack", "DeleteStack", "CreateChangeSet", "ExecuteChangeSet", "DeleteChangeSet"]) {
      expect(can(`cloudformation:${action}`, certificate), action).toBe(false);
    }
  });

  it("lets rtfm-deploy assume the rtfm bootstrap roles, and nothing else", () => {
    const can = reachOf(resources, "AWS::IAM::Role", DEPLOY_ROLE);
    expect(can("sts:AssumeRole", roleArn(BOOTSTRAP_ROLES.deploy))).toBe(true);
    expect(can("sts:AssumeRole", roleArn(BOOTSTRAP_ROLES.filePublishing))).toBe(true);
    expect(can("sts:AssumeRole", roleArn(BOOTSTRAP_ROLES.lookup))).toBe(true);

    expect(can("sts:AssumeRole", roleArn(BOOTSTRAP_ROLES.execution))).toBe(false);
    expect(can("sts:AssumeRole", roleArn(`cdk-hnb659fds-deploy-role-${ACCOUNT}-us-west-2`))).toBe(false);
    expect(can("cloudformation:UpdateStack", stackNamed("RtfmApp"))).toBe(false);
    expect(can("iam:PassRole", roleArn(BOOTSTRAP_ROLES.execution))).toBe(false);
  });

  it("tags its users and roles project=rtfm, which the budget counts", () => {
    const principals = Object.values(resources).filter((resource) => /^AWS::IAM::(User|Role)$/.test(resource.Type));
    expect(principals).toHaveLength(4);
    for (const { Properties } of principals) expect(Properties.Tags).toContainEqual({ Key: "project", Value: "rtfm" });
  });

  it("emails a monthly budget alarm to the address given at deploy", () => {
    const budget = Object.values(resources).find((resource) => resource.Type === "AWS::Budgets::Budget");
    const { Budget, NotificationsWithSubscribers } = budget!.Properties as {
      Budget: Record<string, unknown>;
      NotificationsWithSubscribers: { Subscribers: unknown[] }[];
    };
    expect(Budget).toMatchObject({ TimeUnit: "MONTHLY", BudgetLimit: { Amount: MONTHLY_BUDGET_USD, Unit: "USD" } });
    for (const { Subscribers } of NotificationsWithSubscribers) {
      expect(Subscribers).toEqual([{ SubscriptionType: "EMAIL", Address: { Ref: "BudgetEmail" } }]);
    }
  });
});
