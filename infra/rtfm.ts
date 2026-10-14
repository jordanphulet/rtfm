export const ACCOUNT = "438180219169";
export const REGION = "us-west-2";
export const QUALIFIER = "rtfm";
/** On every resource the app makes, so the budget can count RTFM's cost. */
export const PROJECT_TAG = { key: "project", value: "rtfm" };

export const ACCESS_STACK = "RtfmAccess";
export const TOOLKIT_STACK = "RtfmToolkit";

export const READ_ROLE = "rtfm-read";
export const DEPLOY_ROLE = "rtfm-deploy";
export const OPS_ROLE = "rtfm-ops";
export const LOCAL_USER = "rtfm-local";
export const AGENT_USER = "rtfm-agent";
export const BEDROCK_POLICY = "rtfm-bedrock";
export const BOUNDARY_POLICY = "rtfm-boundary";
export const EXECUTION_POLICY = "rtfm-cfn-execution";
export const BUDGET = "rtfm-monthly";

export const BOOTSTRAP_ROLES = {
  deploy: `cdk-${QUALIFIER}-deploy-role-${ACCOUNT}-${REGION}`,
  filePublishing: `cdk-${QUALIFIER}-file-publishing-role-${ACCOUNT}-${REGION}`,
  lookup: `cdk-${QUALIFIER}-lookup-role-${ACCOUNT}-${REGION}`,
  execution: `cdk-${QUALIFIER}-cfn-exec-role-${ACCOUNT}-${REGION}`,
};
export const STAGING_BUCKET = `cdk-${QUALIFIER}-assets-${ACCOUNT}-${REGION}`;
export const BOOTSTRAP_VERSION_PARAMETER = `/cdk-bootstrap/${QUALIFIER}/version`;

export const roleArn = (name: string) => `arn:aws:iam::${ACCOUNT}:role/${name}`;
export const userArn = (name: string) => `arn:aws:iam::${ACCOUNT}:user/${name}`;
export const policyArn = (name: string) => `arn:aws:iam::${ACCOUNT}:policy/${name}`;
export const stackArn = (name: string) => `arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/${name}/*`;
export const bucketArns = (name: string) => [`arn:aws:s3:::${name}`, `arn:aws:s3:::${name}/*`];
export const parameterArn = (name: string) => `arn:aws:ssm:${REGION}:${ACCOUNT}:parameter${name}`;
export const logGroupArn = (name: string) => `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${name}`;
export const budgetArn = (name: string) => `arn:aws:budgets::${ACCOUNT}:budget/${name}`;

export const functionArn = (name: string) => `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${name}`;
/** A Web Function's revisions and endpoints are under its ARN: `…/revision/<id>`, `…/endpoint/<name>`. */
export const webFunctionArn = (name: string) => `arn:aws:lambda:${REGION}:${ACCOUNT}:web-function/${name}`;

export const RTFM_STACKS = stackArn("Rtfm*");

/**
 * Every Bedrock call's spending, the caps' totals and the kill switch (`server/gateway/README.md` ›
 * The table `rtfm-usage`). `RtfmApp` holds it; `rtfm-local` reaches it too, from the laptop.
 */
export const USAGE_TABLE = "rtfm-usage";
export const USAGE_TABLE_ARN = `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${USAGE_TABLE}`;
/** What `server/gateway/dynamodb-spending-ledger.ts` does to the table, its transactions' parts included. */
export const USAGE_TABLE_ACTIONS = [
  "dynamodb:GetItem",
  "dynamodb:Query",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:ConditionCheckItem",
];

/** The partition of the kill-switch item in `rtfm-usage`, the only one `rtfm-ops` may touch there. */
export const KILL_SWITCH_PARTITION = "KILL_SWITCH";

/** The manuals and their sections (`server/storage/README.md` › The table `rtfm-app`). `RtfmApp` holds it. */
export const APP_TABLE = "rtfm-app";
export const APP_TABLE_ARN = `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${APP_TABLE}`;
/** The partition of the passcode's item in `rtfm-app`, the only one `rtfm-ops` may touch there. */
export const PASSCODE_PARTITION = "PASSCODE";

/**
 * The prefix of the stacks that put the app on the web (its certificate, DNS record, CloudFront
 * distribution, and what lets the distribution invoke the app), which the user deploys: RTFM's
 * roles get no Route 53, ACM or CloudFront permission, and no resource policy. No app stack may
 * be named with it.
 */
export const EDGE_STACKS = "RtfmEdge";

/** The stacks the user deploys with their own sign-in, which RTFM's roles may only read. */
export const USER_STACKS = [ACCESS_STACK, TOOLKIT_STACK, `${EDGE_STACKS}*`];

/**
 * RTFM's resources. Every one an app stack creates must be named explicitly with the `rtfm-`
 * prefix: a name CloudFormation makes up starts with the stack's (`RtfmApp-…`, `rtfmapp-…` for a
 * bucket) or with `CFN-` (a parameter), which these don't match, so the boundary refuses it.
 */
export const RTFM_RESOURCES = {
  logGroups: ["rtfm-*", "/rtfm/*", "/aws/lambda/rtfm-*"].map(logGroupArn),
  functions: [functionArn("rtfm-*")],
  webFunctions: [webFunctionArn("rtfm-*")],
  tables: [`arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/rtfm-*`],
  buckets: bucketArns("rtfm-*"),
  parameters: [parameterArn("/rtfm/*")],
  roles: [roleArn("rtfm-*")],
  policies: [policyArn("rtfm-*")],
};
