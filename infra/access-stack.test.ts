import type { Stack } from "aws-cdk-lib";
import type { CloudFormationStackArtifact } from "aws-cdk-lib/cx-api";
import { describe, expect, it } from "vitest";
import { MONTHLY_BUDGET_USD } from "./access-stack.ts";
import { createApp } from "./app.ts";
import { ACCESS_STACK, ACCOUNT, AGENT_USER, BOOTSTRAP_ROLES, DEPLOY_ROLE, LOCAL_USER, READ_ROLE, roleArn } from "./rtfm.ts";
import { INLINE_TEMPLATE_BUDGET, logicalIdNamed, reachOf, resourcesOf, trustOf } from "./testing.ts";

const app = createApp();
const resources = resourcesOf(app.node.findChild(ACCESS_STACK) as Stack);

const HAIKU = "anthropic.claude-haiku-4-5-20251001-v1:0";
const bedrock = (resource: string) => `arn:aws:bedrock:${resource}`;
const logGroup = (name: string) => `arn:aws:logs:us-west-2:${ACCOUNT}:log-group:${name}:*`;
const stackNamed = (name: string) => `arn:aws:cloudformation:us-west-2:${ACCOUNT}:stack/${name}/0a1b2c`;

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
