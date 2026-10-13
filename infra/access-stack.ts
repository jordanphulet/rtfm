import { CfnParameter, LegacyStackSynthesizer, Stack } from "aws-cdk-lib";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import { ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, User } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { bedrockPolicyStatements } from "./bedrock.ts";
import {
  ACCESS_STACK,
  ACCOUNT,
  AGENT_USER,
  BEDROCK_POLICY,
  BOOTSTRAP_ROLES,
  BUDGET,
  DEPLOY_ROLE,
  EDGE_STACKS,
  LOCAL_USER,
  PROJECT_TAG,
  READ_ROLE,
  REGION,
  RTFM_RESOURCES,
  RTFM_STACKS,
  STAGING_BUCKET,
  bucketArns,
  roleArn,
} from "./rtfm.ts";

/** The gateway's monthly cap (`server/config.ts`). */
export const MONTHLY_BUDGET_USD = 20;

/** The certificate's stack is in us-east-1, where CloudFront takes its certificates from. */
const EDGE_STACKS_IN_US_EAST_1 = `arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/${EDGE_STACKS}*/*`;

/**
 * Who may do what to RTFM in AWS. The user deploys it with their own sign-in: it uses no
 * bootstrap role, so `rtfm-deploy` can't change it.
 */
export class RtfmAccessStack extends Stack {
  constructor(scope: Construct) {
    super(scope, ACCESS_STACK, {
      env: { account: ACCOUNT, region: REGION },
      synthesizer: new LegacyStackSynthesizer(),
      terminationProtection: true,
      description: "RTFM's IAM users and roles, and its budget alarm: deployed by the user",
    });
    const bedrock = new ManagedPolicy(this, "BedrockPolicy", {
      managedPolicyName: BEDROCK_POLICY,
      statements: bedrockPolicyStatements(),
    });
    new User(this, "LocalUser", { userName: LOCAL_USER, managedPolicies: [bedrock] });
    const agent = new User(this, "AgentUser", { userName: AGENT_USER });
    new Role(this, "ReadRole", {
      roleName: READ_ROLE,
      assumedBy: agent,
      inlinePolicies: { read: new PolicyDocument({ statements: readStatements() }) },
    });
    new Role(this, "DeployRole", {
      roleName: DEPLOY_ROLE,
      assumedBy: agent,
      inlinePolicies: { deploy: new PolicyDocument({ statements: [assumeBootstrapRoles()] }) },
    });
    new Policy(this, "AgentPolicy", {
      policyName: "assume-rtfm-roles",
      users: [agent],
      statements: [
        new PolicyStatement({ actions: ["sts:AssumeRole"], resources: [READ_ROLE, DEPLOY_ROLE].map(roleArn) }),
      ],
    });
    this.monthlyBudget();
  }

  private monthlyBudget(): void {
    const email = new CfnParameter(this, "BudgetEmail", {
      type: "String",
      allowedPattern: "[^@\\s]+@[^@\\s]+",
      description: "Where the budget alarm is emailed",
    });
    const alarm = (notificationType: string, threshold: number) => ({
      notification: { notificationType, comparisonOperator: "GREATER_THAN", threshold, thresholdType: "PERCENTAGE" },
      subscribers: [{ subscriptionType: "EMAIL", address: email.valueAsString }],
    });
    new CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: BUDGET,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: MONTHLY_BUDGET_USD, unit: "USD" },
        costFilters: { TagKeyValue: [`user:${PROJECT_TAG.key}$${PROJECT_TAG.value}`] },
      },
      notificationsWithSubscribers: [alarm("ACTUAL", 80), alarm("FORECASTED", 100)],
    });
  }
}

function readStatements(): PolicyStatement[] {
  return [
    new PolicyStatement({
      sid: "ReadRtfmLogs",
      actions: [
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:FilterLogEvents",
        "logs:StartLiveTail",
        "logs:StartQuery",
        "logs:GetLogGroupFields",
      ],
      resources: RTFM_RESOURCES.logGroups,
    }),
    new PolicyStatement({
      sid: "ListLogGroupsAndReadOwnQueries",
      actions: ["logs:DescribeLogGroups", "logs:GetQueryResults"],
      resources: ["*"],
    }),
    new PolicyStatement({
      sid: "ReadRtfmStacks",
      actions: [
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStackResources",
        "cloudformation:ListStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:GetTemplateSummary",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ListChangeSets",
      ],
      resources: [RTFM_STACKS, EDGE_STACKS_IN_US_EAST_1],
    }),
    new PolicyStatement({
      sid: "ReadRtfmWebFunctions",
      actions: [
        "lambda:GetWebFunction",
        "lambda:GetWebFunctionRevision",
        "lambda:GetWebFunctionEndpoint",
        "lambda:ListWebFunctionEndpoints",
        "lambda:ListWebFunctionRevisions",
        "lambda:GetResourcePolicy",
      ],
      resources: RTFM_RESOURCES.webFunctions,
    }),
    new PolicyStatement({
      sid: "ReadRtfmBuckets",
      actions: ["s3:Get*", "s3:List*"],
      resources: [...RTFM_RESOURCES.buckets, ...bucketArns(STAGING_BUCKET)],
    }),
    new PolicyStatement({
      sid: "LookUpForDiff",
      actions: ["sts:AssumeRole"],
      resources: [roleArn(BOOTSTRAP_ROLES.lookup)],
    }),
    new PolicyStatement({
      sid: "ReadCosts",
      actions: ["ce:Get*", "ce:Describe*", "ce:List*"],
      resources: ["*"],
    }),
  ];
}

function assumeBootstrapRoles(): PolicyStatement {
  return new PolicyStatement({
    actions: ["sts:AssumeRole"],
    resources: [BOOTSTRAP_ROLES.deploy, BOOTSTRAP_ROLES.filePublishing, BOOTSTRAP_ROLES.lookup].map(roleArn),
  });
}
