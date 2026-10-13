import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import type { CloudFormationStackArtifact } from "aws-cdk-lib/cx-api";
import { describe, expect, it } from "vitest";
import { APP_STACK } from "./app-stack.ts";
import { createApp } from "./app.ts";
import { CLAUDE_MODELS, MANTLE_PROJECT } from "./bedrock.ts";
import {
  ACCESS_STACK,
  ACCOUNT,
  BOOTSTRAP_ROLES,
  BOOTSTRAP_VERSION_PARAMETER,
  BOUNDARY_POLICY,
  BUDGET,
  DEPLOY_ROLE,
  EXECUTION_POLICY,
  READ_ROLE,
  REGION,
  EDGE_STACKS,
  STAGING_BUCKET,
  TOOLKIT_STACK,
  USER_STACKS,
  budgetArn,
  logGroupArn,
  parameterArn,
  policyArn,
  roleArn,
  userArn,
  webFunctionArn,
} from "./rtfm.ts";
import { BOOTSTRAP_VERSION } from "./toolkit-stack.ts";
import {
  INLINE_TEMPLATE_BUDGET,
  decide,
  managedPolicyStatements,
  reachOf,
  resourcesOf,
  trustOf,
} from "./testing.ts";

const app = createApp();
const toolkit = app.node.findChild(TOOLKIT_STACK) as Stack;
const appStack = app.node.findChild(APP_STACK) as Stack;
const assembly = app.synth();
const template = Template.fromStack(toolkit).toJSON();
const resources = resourcesOf(toolkit);

const BOUNDARY_ARN = policyArn(BOUNDARY_POLICY);
const stackNamed = (name: string) => `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/${name}/0a1b2c`;
const lambda = (name: string) => `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${name}`;
const stagingObject = `arn:aws:s3:::${STAGING_BUCKET}/assets/handler.zip`;

describe("the RtfmToolkit stack, RTFM's bootstrap", () => {
  it("has the roles an app stack's DefaultStackSynthesizer deploys with", () => {
    const artifact = assembly.getStackByName(appStack.stackName) as CloudFormationStackArtifact;
    const names = [artifact.assumeRoleArn, artifact.cloudFormationExecutionRoleArn, artifact.lookupRole?.arn];
    expect(names.map((arn) => arn?.replace("${AWS::Partition}", "aws"))).toEqual(
      [BOOTSTRAP_ROLES.deploy, BOOTSTRAP_ROLES.execution, BOOTSTRAP_ROLES.lookup].map(roleArn),
    );
    expect(artifact.stackTemplateAssetObjectUrl).toContain(`s3://${STAGING_BUCKET}/`);
    expect(artifact.bootstrapStackVersionSsmParameter).toBe(BOOTSTRAP_VERSION_PARAMETER);
    expect(Number(BOOTSTRAP_VERSION)).toBeGreaterThanOrEqual(artifact.requiresBootstrapStackVersion!);
  });

  it("is deployed by cdk bootstrap with the user's own sign-in and an inline template", () => {
    const artifact = assembly.getStackByName(TOOLKIT_STACK) as CloudFormationStackArtifact;
    expect(artifact.assumeRoleArn).toBeUndefined();
    expect(artifact.cloudFormationExecutionRoleArn).toBeUndefined();
    expect(artifact.stackTemplateAssetObjectUrl).toBeUndefined();
    expect(JSON.stringify(artifact.template, null, 1).length).toBeLessThan(INLINE_TEMPLATE_BUDGET);
  });

  it("accepts only RTFM's qualifier, execution policy and boundary from cdk bootstrap", () => {
    expect(template.Parameters).toMatchObject({
      Qualifier: { AllowedValues: ["rtfm"] },
      CloudFormationExecutionPolicies: { AllowedValues: [policyArn(EXECUTION_POLICY)] },
      InputPermissionsBoundary: { AllowedValues: [BOUNDARY_POLICY] },
      BootstrapVariant: { Default: expect.not.stringContaining("AWS CDK: Default Resources") },
    });
    expect(template.Parameters.Qualifier.Default).toBeUndefined();
  });

  it("gives the CLI the outputs and version parameter it reads", () => {
    expect(Object.keys(template.Outputs)).toEqual(["BucketName", "BucketDomainName", "BootstrapVersion"]);
    expect(template.Outputs.BootstrapVersion.Value).toBe(BOOTSTRAP_VERSION);
    Template.fromStack(toolkit).hasResourceProperties("AWS::SSM::Parameter", {
      Name: BOOTSTRAP_VERSION_PARAMETER,
      Value: BOOTSTRAP_VERSION,
    });
    Template.fromStack(toolkit).hasResourceProperties("AWS::S3::Bucket", { BucketName: STAGING_BUCKET });
  });

  it("lets Lambda read an RTFM Web Function's code from the staging bucket, and nothing else", () => {
    const policies = Template.fromStack(toolkit).findResources("AWS::S3::BucketPolicy");
    const statements = Object.values(policies).flatMap((policy) => policy.Properties.PolicyDocument.Statement);
    const forLambda = statements.filter((statement) => statement.Principal?.Service === "lambda.amazonaws.com");
    expect(forLambda).toEqual([
      expect.objectContaining({
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:GetObjectVersion"],
        Condition: {
          ArnLike: { "aws:SourceArn": `${webFunctionArn("rtfm-*")}/revision/*` },
          StringEquals: { "aws:SourceAccount": ACCOUNT },
        },
      }),
    ]);
  });

  it("lets only RTFM's own roles assume the bootstrap roles, and none on another's behalf", () => {
    const assumers = (roleName: string) => trustOf(resources, roleName)[0].Condition;
    expect(assumers(BOOTSTRAP_ROLES.deploy)).toEqual({
      ArnEquals: { "aws:PrincipalArn": [roleArn(DEPLOY_ROLE)] },
      Null: { "sts:ExternalId": "true" },
    });
    expect(assumers(BOOTSTRAP_ROLES.filePublishing)).toMatchObject({
      ArnEquals: { "aws:PrincipalArn": [roleArn(DEPLOY_ROLE)] },
    });
    expect(assumers(BOOTSTRAP_ROLES.lookup)).toMatchObject({
      ArnEquals: { "aws:PrincipalArn": [roleArn(READ_ROLE), roleArn(DEPLOY_ROLE)] },
    });
    expect(trustOf(resources, BOOTSTRAP_ROLES.execution)).toEqual([
      { Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "cloudformation.amazonaws.com" } },
    ]);
  });

  it("lets the deploy role deploy RTFM's stacks only, through the execution role", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.deploy);
    expect(can("cloudformation:CreateChangeSet", stackNamed("RtfmApp"))).toBe(true);
    expect(can("cloudformation:DeleteStack", stackNamed("RtfmApp"))).toBe(true);
    expect(can("cloudformation:DescribeStacks", stackNamed(TOOLKIT_STACK))).toBe(true);
    expect(can("iam:PassRole", roleArn(BOOTSTRAP_ROLES.execution))).toBe(true);
    expect(can("s3:GetObject", stagingObject)).toBe(true);

    for (const stack of [ACCESS_STACK, TOOLKIT_STACK, `${EDGE_STACKS}Certificate`, `${EDGE_STACKS}Distribution`]) {
      expect(can("cloudformation:CreateChangeSet", stackNamed(stack)), stack).toBe(false);
      expect(can("cloudformation:DeleteStack", stackNamed(stack)), stack).toBe(false);
      expect(can("cloudformation:DescribeStacks", stackNamed(stack)), stack).toBe(true);
    }
    expect(USER_STACKS).toEqual([ACCESS_STACK, TOOLKIT_STACK, `${EDGE_STACKS}*`]);
    for (const stack of ["CDKToolkit", "WorkStack"]) {
      expect(can("cloudformation:UpdateStack", stackNamed(stack))).toBe(false);
      expect(can("cloudformation:DeleteStack", stackNamed(stack))).toBe(false);
      expect(can("cloudformation:DescribeStacks", stackNamed(stack))).toBe(false);
    }
    expect(can("iam:PassRole", roleArn(`cdk-hnb659fds-cfn-exec-role-${ACCOUNT}-${REGION}`))).toBe(false);
    expect(can("s3:PutObject", stagingObject)).toBe(false);
  });

  it("names no stack the deploy role deploys like one the user deploys", () => {
    const deployed = assembly.stacks.filter((stack) => stack.assumeRoleArn !== undefined).map((stack) => stack.stackName);
    expect(deployed).toEqual([APP_STACK]);
    for (const name of deployed) expect(name.startsWith(EDGE_STACKS), name).toBe(false);
  });

  it("lets the file publishing role write to the staging bucket only", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.filePublishing);
    expect(can("s3:PutObject", stagingObject)).toBe(true);
    expect(can("s3:PutObject", "arn:aws:s3:::rtfm-site/index.html")).toBe(false);
    expect(can("s3:PutObject", `arn:aws:s3:::cdk-hnb659fds-assets-${ACCOUNT}-${REGION}/x.zip`)).toBe(false);
  });

  it("lets the lookup role read RTFM's stacks only", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.lookup);
    expect(can("cloudformation:GetTemplate", stackNamed("RtfmApp"))).toBe(true);
    expect(can("ssm:GetParameter", parameterArn(BOOTSTRAP_VERSION_PARAMETER))).toBe(true);
    expect(can("cloudformation:GetTemplate", stackNamed("WorkStack"))).toBe(false);
    expect(can("cloudformation:UpdateStack", stackNamed("RtfmApp"))).toBe(false);
    expect(can("s3:GetObject", "arn:aws:s3:::work-reports/q3.csv")).toBe(false);
  });
});

describe("the execution role, under the boundary", () => {
  const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
  const withBoundary = { "iam:PermissionsBoundary": BOUNDARY_ARN };

  it("carries the boundary and the execution policy", () => {
    Template.fromStack(toolkit).hasResourceProperties("AWS::IAM::Role", {
      RoleName: BOOTSTRAP_ROLES.execution,
      PermissionsBoundary: { Ref: Match.stringLikeRegexp("^Boundary") },
      ManagedPolicyArns: [{ Ref: Match.stringLikeRegexp("^ExecutionPolicy") }],
    });
  });

  it("creates RTFM's resources", () => {
    expect(can("lambda:CreateFunction", lambda("rtfm-api"))).toBe(true);
    expect(can("dynamodb:CreateTable", `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/rtfm-manuals`)).toBe(true);
    expect(can("s3:CreateBucket", "arn:aws:s3:::rtfm-site")).toBe(true);
    expect(can("logs:CreateLogGroup", logGroupArn("/aws/lambda/rtfm-api"))).toBe(true);
    expect(can("ssm:PutParameter", parameterArn("/rtfm/stop"))).toBe(true);
    expect(can("iam:CreateRole", roleArn("rtfm-api"), withBoundary)).toBe(true);
    expect(can("iam:PassRole", roleArn("rtfm-api"))).toBe(true);
    expect(can("s3:GetObject", stagingObject)).toBe(true);
    expect(can("s3:GetObjectVersion", stagingObject)).toBe(true);
  });

  it("refuses the names CloudFormation makes up for an RtfmApp stack's resources", () => {
    expect(can("lambda:CreateFunction", lambda("RtfmApp-Api1A2B"))).toBe(false);
    expect(can("iam:CreateRole", roleArn("RtfmApp-ApiServiceRole1A2B"), withBoundary)).toBe(false);
    expect(can("s3:CreateBucket", "arn:aws:s3:::rtfmapp-sitebucket1a2b-3c4d")).toBe(false);
    expect(can("ssm:PutParameter", parameterArn("/CFN-StopParameter-1A2B"))).toBe(false);
    expect(can("logs:CreateLogGroup", logGroupArn("RtfmApp-Logs1A2B"))).toBe(false);
  });

  it("touches nothing that isn't named for RTFM", () => {
    expect(can("lambda:CreateFunction", lambda("work-billing"))).toBe(false);
    expect(can("s3:DeleteBucket", "arn:aws:s3:::work-reports")).toBe(false);
    expect(can("logs:DeleteLogGroup", logGroupArn("/aws/lambda/work-billing"))).toBe(false);
    expect(can("ssm:GetParameter", parameterArn("/work/database-password"))).toBe(false);
    expect(can("iam:CreateRole", roleArn("work-admin"), withBoundary)).toBe(false);
    expect(can("iam:AttachRolePolicy", roleArn("work-admin"))).toBe(false);
    expect(can("sts:AssumeRole", roleArn("work-admin"))).toBe(false);
    expect(can("ec2:RunInstances", "*")).toBe(false);
  });
});

describe("the boundary", () => {
  const boundary = managedPolicyStatements(resources, BOUNDARY_POLICY);
  const denies = (action: string, resource: string, context = {}) => decide(boundary, action, resource, context);

  it("is the execution policy too", () => {
    expect(managedPolicyStatements(resources, EXECUTION_POLICY)).toEqual(boundary);
  });

  it("fits in a managed policy, which IAM limits to 6,144 characters without whitespace", () => {
    expect(JSON.stringify({ Version: "2012-10-17", Statement: boundary }).length).toBeLessThan(6144);
  });

  it("denies a role created or changed without it", () => {
    const role = roleArn("rtfm-api");
    expect(denies("iam:CreateRole", role)).toBe("deny");
    expect(denies("iam:CreateRole", role, { "iam:PermissionsBoundary": policyArn("rtfm-other") })).toBe("deny");
    expect(denies("iam:PutRolePermissionsBoundary", role, { "iam:PermissionsBoundary": policyArn("rtfm-other") })).toBe(
      "deny",
    );
    expect(denies("iam:DeleteRolePermissionsBoundary", role)).toBe("deny");
    expect(denies("iam:CreateRole", role, { "iam:PermissionsBoundary": BOUNDARY_ARN })).toBe("allow");
  });

  it("denies changing itself, the execution policy, or RtfmAccess's resources", () => {
    for (const policy of [BOUNDARY_POLICY, EXECUTION_POLICY, "rtfm-bedrock"]) {
      expect(denies("iam:CreatePolicyVersion", policyArn(policy))).toBe("deny");
      expect(denies("iam:DeletePolicy", policyArn(policy))).toBe("deny");
    }
    for (const role of [READ_ROLE, DEPLOY_ROLE]) {
      expect(denies("iam:UpdateAssumeRolePolicy", roleArn(role))).toBe("deny");
      expect(denies("iam:PassRole", roleArn(role))).toBe("deny");
    }
    for (const stack of [ACCESS_STACK, TOOLKIT_STACK, `${EDGE_STACKS}Distribution`]) {
      expect(denies("cloudformation:UpdateStack", stackNamed(stack)), stack).toBe("deny");
    }
    expect(denies("budgets:ModifyBudget", budgetArn(BUDGET))).toBe("deny");
  });

  it("denies changing every user, role, managed policy and budget RtfmAccess and the bootstrap make", () => {
    const access = resourcesOf(app.node.findChild(ACCESS_STACK) as Stack);
    type Properties = Record<string, unknown>;
    const namesOf = (type: string, nameOf: (properties: Properties) => unknown) =>
      [access, resources].flatMap((stackResources) =>
        Object.values(stackResources)
          .filter((resource) => resource.Type === type)
          .map((resource) => nameOf(resource.Properties) as string),
      );
    const kinds = [
      { type: "AWS::IAM::User", nameOf: (p: Properties) => p.UserName, arn: userArn, action: "iam:CreateAccessKey" },
      { type: "AWS::IAM::Role", nameOf: (p: Properties) => p.RoleName, arn: roleArn, action: "iam:PutRolePolicy" },
      {
        type: "AWS::IAM::ManagedPolicy",
        nameOf: (p: Properties) => p.ManagedPolicyName,
        arn: policyArn,
        action: "iam:CreatePolicyVersion",
      },
      {
        type: "AWS::Budgets::Budget",
        nameOf: (p: Properties) => (p.Budget as Properties).BudgetName,
        arn: budgetArn,
        action: "budgets:ModifyBudget",
      },
    ];
    for (const { type, nameOf, arn, action } of kinds) {
      const names = namesOf(type, nameOf);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(denies(action, arn(name)), `${action} on ${name}`).toBe("deny");
    }
  });

  it("denies a public Function URL", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
    const api = lambda("rtfm-api");
    const urlAuth = (type: string) => ({ "lambda:FunctionUrlAuthType": type });
    for (const action of ["lambda:CreateFunctionUrlConfig", "lambda:UpdateFunctionUrlConfig"]) {
      expect(can(action, api, urlAuth("NONE"))).toBe(false);
      expect(denies(action, api, urlAuth("NONE"))).toBe("deny");
      expect(denies(action, api)).toBe("deny");
      expect(can(action, api, urlAuth("AWS_IAM"))).toBe(true);
    }
  });

  it("denies any permission for another to invoke a function, and any resource policy", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
    const api = lambda("rtfm-api");
    const principals = [
      "*",
      "111122223333",
      "arn:aws:iam::111122223333:root",
      "cloudfront.amazonaws.com",
      "apigateway.amazonaws.com",
      "s3.amazonaws.com",
    ];
    for (const target of [api, lambda("rtfm-web")]) {
      for (const principal of principals) {
        const context = { "lambda:Principal": principal };
        expect(can("lambda:AddPermission", target, context), principal).toBe(false);
        expect(denies("lambda:AddPermission", target, context), principal).toBe("deny");
      }
    }
    for (const target of [api, webFunctionArn("rtfm-app")]) {
      expect(can("lambda:PutResourcePolicy", target), target).toBe(false);
      expect(denies("lambda:PutResourcePolicy", target), target).toBe("deny");
    }
  });

  it("lets a stack make RTFM's Web Functions, with signed endpoints only, and no others", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
    const web = webFunctionArn("rtfm-app");
    const endpoint = `${web}/endpoint/live`;
    const auth = (type: string) => ({ "lambda:Request/WebFunctionAuthType": type });
    expect(can("lambda:CreateWebFunction", web)).toBe(true);
    expect(can("lambda:CreateWebFunction", web, auth("IamAuth"))).toBe(true);
    expect(can("lambda:CreateWebFunctionRevision", web)).toBe(true);
    expect(can("lambda:CreateWebFunctionEndpoint", web, auth("IamAuth"))).toBe(true);
    expect(can("lambda:UpdateWebFunctionEndpoint", endpoint)).toBe(true);
    expect(can("lambda:UpdateWebFunctionEndpoint", endpoint, auth("IamAuth"))).toBe(true);
    expect(can("lambda:DeleteWebFunctionEndpoint", endpoint)).toBe(true);

    for (const type of ["ApplicationManaged", "AnyFutureAuthType"]) {
      expect(denies("lambda:CreateWebFunctionEndpoint", web, auth(type)), type).toBe("deny");
      expect(denies("lambda:CreateWebFunction", web, auth(type)), type).toBe("deny");
      expect(denies("lambda:UpdateWebFunctionEndpoint", endpoint, auth(type)), type).toBe("deny");
    }
    expect(denies("lambda:CreateWebFunctionEndpoint", web)).toBe("deny");

    expect(can("lambda:CreateWebFunction", webFunctionArn("RtfmApp-Web1A2B"))).toBe(false);
    expect(can("lambda:CreateWebFunction", webFunctionArn("work-site"))).toBe(false);
    expect(can("lambda:DeleteWebFunction", webFunctionArn("work-site"))).toBe(false);
  });

  it("allows nothing in CloudFront", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
    const tagged = { "aws:RequestTag/project": "rtfm", "aws:ResourceTag/project": "rtfm" };
    expect(can("cloudfront:CreateDistribution", "*", tagged)).toBe(false);
    expect(can("cloudfront:UpdateDistribution", `arn:aws:cloudfront::${ACCOUNT}:distribution/E1`, tagged)).toBe(false);
    expect(can("cloudfront:CreateOriginAccessControl", "*")).toBe(false);
  });

  it("denies roles and policies with a path, which the rtfm- prefix would otherwise let in", () => {
    const can = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
    const withBoundary = { "iam:PermissionsBoundary": BOUNDARY_ARN };
    expect(can("iam:CreateRole", roleArn("rtfm-x/work-admin"), withBoundary)).toBe(false);
    expect(denies("iam:PutRolePolicy", roleArn("rtfm-x/work-admin"))).toBe("deny");
    expect(denies("iam:CreatePolicyVersion", policyArn("rtfm-x/work-policy"))).toBe("deny");
    expect(can("iam:CreateRole", roleArn("rtfm-api"), withBoundary)).toBe(true);
  });

  it("denies changing Block Public Access, on a bucket or the account", () => {
    const bucket = "arn:aws:s3:::rtfm-site";
    const canExecute = reachOf(resources, "AWS::IAM::Role", BOOTSTRAP_ROLES.execution);
    expect(denies("s3:PutBucketPublicAccessBlock", bucket)).toBe("deny");
    expect(canExecute("s3:PutBucketPublicAccessBlock", bucket)).toBe(false);
    expect(denies("s3:PutAccountPublicAccessBlock", "*")).toBe("deny");
    expect(canExecute("s3:PutBucketPolicy", bucket)).toBe(true);
  });

  it("lets a Bucket with default props deploy, since only blockPublicAccess sets Block Public Access", () => {
    const stack = new Stack(new App(), "RtfmApp");
    new Bucket(stack, "Default", { bucketName: "rtfm-default" });
    new Bucket(stack, "BlockAll", { bucketName: "rtfm-block-all", blockPublicAccess: BlockPublicAccess.BLOCK_ALL });
    const configuration = (name: string) =>
      Object.values(resourcesOf(stack)).find((resource) => resource.Properties.BucketName === name)?.Properties
        .PublicAccessBlockConfiguration;
    expect(configuration("rtfm-default")).toBeUndefined();
    expect(configuration("rtfm-block-all")).toBeDefined();
  });

  it("denies every IAM user", () => {
    expect(denies("iam:CreateUser", userArn("rtfm-backdoor"))).toBe("deny");
    expect(denies("iam:CreateAccessKey", userArn("rtfm-local"))).toBe("deny");
    expect(denies("iam:AttachUserPolicy", userArn("rtfm-agent"))).toBe("deny");
  });

  it("denies changing the bootstrap stack, its roles, bucket and version", () => {
    expect(denies("cloudformation:DeleteStack", stackNamed(TOOLKIT_STACK))).toBe("deny");
    for (const role of Object.values(BOOTSTRAP_ROLES)) {
      expect(denies("iam:PutRolePolicy", roleArn(role))).toBe("deny");
      expect(denies("sts:AssumeRole", roleArn(role))).toBe("deny");
    }
    expect(denies("s3:PutObject", stagingObject)).toBe("deny");
    expect(denies("s3:PutBucketPolicy", `arn:aws:s3:::${STAGING_BUCKET}`)).toBe("deny");
    expect(denies("ssm:PutParameter", parameterArn(BOOTSTRAP_VERSION_PARAMETER))).toBe("deny");
    expect(denies("s3:GetObject", stagingObject)).toBe("allow");
  });

  it("allows nothing beyond resources named for RTFM but Claude and the list of log groups", () => {
    const unnamed = boundary
      .filter((statement) => statement.Effect === "Allow")
      .flatMap((statement) => [statement.Resource].flat())
      .filter((resource) => !/rtfm/i.test(resource));
    expect(unnamed).toEqual([MANTLE_PROJECT, ...CLAUDE_MODELS, logGroupArn("*")]);
  });
});
