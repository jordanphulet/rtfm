import { CfnParameter, LegacyStackSynthesizer, Stack } from "aws-cdk-lib";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import { ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, User } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { bedrockPolicyStatements } from "./bedrock.ts";
import {
  ACCESS_STACK,
  ACCOUNT,
  ACTIVITY_PARTITION,
  AGENT_USER,
  APP_TABLE_ARN,
  BEDROCK_POLICY,
  BOOTSTRAP_ROLES,
  BUDGET,
  DEPLOY_ROLE,
  EDGE_STACKS,
  KILL_SWITCH_PARTITION,
  LINK_PARTITION,
  LOCAL_USER,
  OPS_ROLE,
  PASSCODE_PARTITION,
  PROJECT_TAG,
  READ_ROLE,
  RECIPIENT_DEEPER_PARTITION_PATTERN,
  RECIPIENT_LIBRARY_PARTITION_PATTERN,
  REGION,
  RTFM_RESOURCES,
  RTFM_STACKS,
  STAGING_BUCKET,
  USAGE_TABLE_ACTIONS,
  USAGE_TABLE_ARN,
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
    const local = new User(this, "LocalUser", { userName: LOCAL_USER, managedPolicies: [bedrock] });
    new Policy(this, "LocalUsagePolicy", {
      policyName: "read-write-rtfm-usage",
      users: [local],
      statements: [new PolicyStatement({ actions: USAGE_TABLE_ACTIONS, resources: [USAGE_TABLE_ARN] })],
    });
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
    new Role(this, "OpsRole", {
      roleName: OPS_ROLE,
      assumedBy: agent,
      inlinePolicies: { ops: new PolicyDocument({ statements: opsStatements() }) },
    });
    new Policy(this, "AgentPolicy", {
      policyName: "assume-rtfm-roles",
      users: [agent],
      statements: [
        new PolicyStatement({
          actions: ["sts:AssumeRole"],
          resources: [READ_ROLE, DEPLOY_ROLE, OPS_ROLE].map(roleArn),
        }),
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
      sid: "DescribeRtfmTables",
      actions: ["dynamodb:DescribeTable", "dynamodb:DescribeContinuousBackups"],
      resources: RTFM_RESOURCES.tables,
    }),
    new PolicyStatement({
      sid: "ReadUsageTableItems",
      actions: ["dynamodb:GetItem", "dynamodb:Query"],
      resources: [USAGE_TABLE_ARN],
    }),
    onlyPartitions("ReadLinksAndActivity", APP_TABLE_ARN, [LINK_PARTITION, ACTIVITY_PARTITION], [
      "dynamodb:GetItem",
      "dynamodb:Query",
    ]),
    listRecipientsManuals(),
    new PolicyStatement({
      sid: "DescribeResourceTypes",
      actions: ["cloudformation:DescribeType"],
      resources: ["*"],
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

/**
 * The items of the `KILL_SWITCH` partition in `rtfm-usage`, and of the `PASSCODE` and `LINK`
 * partitions in `rtfm-app`, and no other item or table.
 */
function opsStatements(): PolicyStatement[] {
  return [
    onlyPartitions("KillSwitch", USAGE_TABLE_ARN, [KILL_SWITCH_PARTITION], [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]),
    onlyPartitions("Passcode", APP_TABLE_ARN, [PASSCODE_PARTITION], ["dynamodb:GetItem", "dynamodb:PutItem"]),
    onlyPartitions("Links", APP_TABLE_ARN, [LINK_PARTITION], [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]),
  ];
}

/**
 * Item actions on some partitions of a table. `ForAllValues` also holds for a request that names no
 * partition key, so `Null` requires one.
 */
function onlyPartitions(sid: string, tableArn: string, partitions: string[], actions: string[]): PolicyStatement {
  return new PolicyStatement({
    sid,
    actions,
    resources: [tableArn],
    conditions: {
      "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": partitions },
      Null: { "dynamodb:LeadingKeys": "false" },
    },
  });
}

/**
 * `Query` on the recipients' manual lists, `L#<libraryId>#LIBRARY`, and no other partition: the
 * `StringLike` pattern's `*` matches `#` too, so `StringNotLike` refuses a key with three or more.
 */
function listRecipientsManuals(): PolicyStatement {
  return new PolicyStatement({
    sid: "ListRecipientsManuals",
    actions: ["dynamodb:Query"],
    resources: [APP_TABLE_ARN],
    conditions: {
      "ForAllValues:StringLike": { "dynamodb:LeadingKeys": [RECIPIENT_LIBRARY_PARTITION_PATTERN] },
      "ForAllValues:StringNotLike": { "dynamodb:LeadingKeys": [RECIPIENT_DEEPER_PARTITION_PATTERN] },
      Null: { "dynamodb:LeadingKeys": "false" },
    },
  });
}

function assumeBootstrapRoles(): PolicyStatement {
  return new PolicyStatement({
    actions: ["sts:AssumeRole"],
    resources: [BOOTSTRAP_ROLES.deploy, BOOTSTRAP_ROLES.filePublishing, BOOTSTRAP_ROLES.lookup].map(roleArn),
  });
}
