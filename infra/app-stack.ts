import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  AssetHashType,
  CfnOutput,
  DockerImage,
  RemovalPolicy,
  Stack,
  Validations,
  type ILocalBundling,
} from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import {
  Effect,
  ManagedPolicy,
  PermissionsBoundary,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { CfnWebFunction, CfnWebFunctionEndpoint, CfnWebFunctionRevision } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import type { Construct } from "constructs";
import { claudeStatements } from "./bedrock.ts";
import {
  ACCOUNT,
  APP_TABLE,
  APP_TABLE_ARN,
  BOUNDARY_POLICY,
  LINK_PARTITION,
  PASSCODE_PARTITION,
  REGION,
  USAGE_TABLE,
  USAGE_TABLE_ACTIONS,
  USAGE_TABLE_ARN,
  logGroupArn,
  policyArn,
} from "./rtfm.ts";

export const APP_STACK = "RtfmApp";
export const APP_LOG_GROUP = "/rtfm/app";
/** Lambda writes a Web Function's logs here first, then copies them to `APP_LOG_GROUP`. */
export const APP_LOCAL_LOG_GROUP = `${APP_LOG_GROUP}.local`;
/** Bucket names are global, so the account and region keep it RTFM's own. */
export const APP_BUCKET = `rtfm-app-${ACCOUNT}-${REGION}`;
/**
 * What `server/storage/dynamodb-manual-store.ts` does to the table, its transactions included;
 * `GetItem` also reads the passcode's digest and the libraries' links.
 */
const APP_TABLE_ACTIONS = [
  "dynamodb:GetItem",
  "dynamodb:Query",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
];
/**
 * The partitions of `rtfm-app` that decide who opens the app, the passcode's and the links', which
 * only `rtfm-ops` writes.
 */
const OPS_PARTITIONS = [PASSCODE_PARTITION, LINK_PARTITION];
/**
 * The writes the Web Function's role may never make in `OPS_PARTITIONS`. `BatchWriteItem` isn't
 * granted, but the deny names it as well.
 */
const OPS_PARTITION_WRITE_ACTIONS = [
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:BatchWriteItem",
];
/** The edge's resource policy names the Web Function, so its name never changes. */
export const WEB_FUNCTION = "rtfm-app";
export const WEB_FUNCTION_ROLE = "rtfm-app-web-function";
export const WEB_FUNCTION_ENDPOINT = "main";
/** Where `scripts/build-web-function.ts` puts the server in the package. */
export const WEB_FUNCTION_ENTRYPOINT = "server/web-function.mjs";
const WEB_FUNCTION_TIMEOUT_SECONDS = 300;

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUILD_SCRIPT = fileURLToPath(new URL("../scripts/build-web-function.ts", import.meta.url));

/** Builds the Web Function's package on this machine, with no Docker. */
const buildOnThisMachine: ILocalBundling = {
  tryBundle(outputDir) {
    const { status } = spawnSync(process.execPath, [BUILD_SCRIPT, outputDir], { stdio: ["ignore", 2, 2] });
    if (status !== 0) throw new Error(`Building the Web Function's package failed: node ${BUILD_SCRIPT} ${outputDir}`);
    return true;
  },
};

/**
 * RTFM's app, deployed through the bootstrap with `npm run cdk -- deploy`. Every resource is named
 * explicitly for RTFM, since the boundary refuses a name CloudFormation makes up, and every role
 * carries the boundary.
 */
export class RtfmAppStack extends Stack {
  constructor(scope: Construct) {
    super(scope, APP_STACK, {
      env: { account: ACCOUNT, region: REGION },
      description: "RTFM's app: deployed with npm run cdk -- deploy",
    });
    PermissionsBoundary.of(this).apply(ManagedPolicy.fromManagedPolicyArn(this, "Boundary", policyArn(BOUNDARY_POLICY)));
    // Unset `blockPublicAccess` keeps S3's default, which blocks public access; setting it, even to
    // BLOCK_ALL, calls PutBucketPublicAccessBlock, which the boundary refuses.
    new Bucket(this, "AppBucket", {
      bucketName: APP_BUCKET,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.webFunction(this.keptTable("AppTable", APP_TABLE));
    this.keptTable("UsageTable", USAGE_TABLE);
  }

  /**
   * A table kept whatever happens to the stack, since it holds the library or the record of what
   * was spent: nothing can delete it while its deletion protection is on, and point-in-time
   * recovery can restore it to any second of the last 35 days.
   */
  private keptTable(id: string, tableName: string): Table {
    return new Table(this, id, {
      tableName,
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }

  /**
   * The server on a Lambda Web Function, behind an `IamAuth` endpoint that only the edge's
   * CloudFront distribution may invoke, once the user's edge stack lets it.
   */
  private webFunction(table: Table): void {
    const logGroups = [this.logGroup("AppLogs", APP_LOG_GROUP), this.logGroup("AppLocalLogs", APP_LOCAL_LOG_GROUP)];
    const role = new Role(this, "WebFunctionRole", {
      roleName: WEB_FUNCTION_ROLE,
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        WriteLogs: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
              resources: [APP_LOG_GROUP, APP_LOCAL_LOG_GROUP].map((name) => `${logGroupArn(name)}:*`),
            }),
          ],
        }),
        ReadAndWriteLibrary: new PolicyDocument({
          statements: [
            new PolicyStatement({ actions: APP_TABLE_ACTIONS, resources: [APP_TABLE_ARN] }),
            new PolicyStatement({
              sid: "LeaveAccessToOps",
              effect: Effect.DENY,
              actions: OPS_PARTITION_WRITE_ACTIONS,
              resources: [APP_TABLE_ARN],
              conditions: { "ForAnyValue:StringEquals": { "dynamodb:LeadingKeys": OPS_PARTITIONS } },
            }),
          ],
        }),
        ReadAndWriteUsage: new PolicyDocument({
          statements: [new PolicyStatement({ actions: USAGE_TABLE_ACTIONS, resources: [USAGE_TABLE_ARN] })],
        }),
        InvokeClaude: new PolicyDocument({ statements: claudeStatements() }),
      },
    });
    const code = new Asset(this, "WebFunctionCode", {
      path: REPO_ROOT,
      assetHashType: AssetHashType.OUTPUT,
      // `image` is required, but the local build always runs instead.
      bundling: { image: DockerImage.fromRegistry("unused"), local: buildOnThisMachine },
    });

    const webFunction = new CfnWebFunction(this, "WebFunction", { functionName: WEB_FUNCTION });
    const revision = new CfnWebFunctionRevision(this, "WebFunctionRevision", {
      functionName: WEB_FUNCTION,
      buildConfig: {
        codeConfig: { s3Object: { bucket: code.s3BucketName, key: code.s3ObjectKey } },
        runtimeConfig: { runtime: "nodejs24.x" },
      },
      serviceConfig: {
        executionRoleArn: role.roleArn,
        timeoutSeconds: WEB_FUNCTION_TIMEOUT_SECONDS,
        environmentVariables: {
          AWS_LAMBDA_NODEJS_ENTRYPOINT: WEB_FUNCTION_ENTRYPOINT,
          RTFM_MODELS: "bedrock",
          RTFM_APP_TABLE: APP_TABLE,
          RTFM_USAGE_TABLE: USAGE_TABLE,
        },
        telemetryConfig: { loggingConfig: { logGroup: APP_LOG_GROUP } },
      },
    });
    revision.addResourceDependency(webFunction);
    revision.node.addDependency(...logGroups, table);

    const endpoint = new CfnWebFunctionEndpoint(this, "WebFunctionEndpoint", {
      functionName: WEB_FUNCTION,
      endpointName: WEB_FUNCTION_ENDPOINT,
      endpointType: "HomeRegion",
      authType: "IamAuth",
      revisionWeights: [{ revisionId: revision.attrRevisionId, weight: 100 }],
      scalingConfig: { maxEnvironments: 2 },
      throttleConfig: { rateLimit: 100 },
    });
    endpoint.addResourceDependency(webFunction);
    new CfnOutput(this, "EndpointDomain", { value: endpoint.attrDomainName });
    Validations.of(this).acknowledge({
      id: "CloudFormation-Validate::F3006",
      reason: "The CDK's CloudFormation schemas predate the Web Function resource types",
    });
  }

  private logGroup(id: string, logGroupName: string): LogGroup {
    return new LogGroup(this, id, {
      logGroupName,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
