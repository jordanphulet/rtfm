import { Template } from "aws-cdk-lib/assertions";
import type { Stack } from "aws-cdk-lib";

type Strings = string | string[];
export type Statement = {
  Sid?: string;
  Effect: "Allow" | "Deny";
  Action?: Strings;
  NotAction?: Strings;
  Resource: Strings;
  Condition?: Record<string, Record<string, Strings>>;
};
type Resource = { Type: string; Properties: Record<string, unknown> };
type Resources = Record<string, Resource>;
/** The request's condition keys, such as `iam:PermissionsBoundary`. */
export type RequestContext = Record<string, string>;
export type Decision = "allow" | "deny" | "no allow";

/**
 * The CLI sends a template of up to 50 KiB inline, and uploads a larger one to the staging bucket,
 * which `rtfm-deploy` can write. The stacks the user deploys stay well under it.
 */
export const INLINE_TEMPLATE_BUDGET = 40 * 1024;

const list = (value: Strings | undefined): string[] => (value === undefined ? [] : [value].flat());

function wildcardMatches(pattern: unknown, value: string, ignoreCase: boolean): boolean {
  if (typeof pattern !== "string") throw new Error(`Can't evaluate the pattern ${JSON.stringify(pattern)}`);
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${source}$`, ignoreCase ? "i" : "").test(value);
}

function coversAction(statement: Statement, action: string): boolean {
  if (statement.Action !== undefined) return list(statement.Action).some((pattern) => wildcardMatches(pattern, action, true));
  return !list(statement.NotAction).some((pattern) => wildcardMatches(pattern, action, true));
}

/**
 * `StringEquals` compares exactly; the `Like` and `Arn` operators read `*` and `?` as wildcards. A
 * negated operator holds when the key is missing, as in IAM.
 */
function conditionHolds(operator: string, key: string, values: string[], context: RequestContext): boolean {
  const actual = context[key];
  const equalsAny = actual !== undefined && values.includes(actual);
  const matchesAny = actual !== undefined && values.some((value) => wildcardMatches(value, actual, false));
  switch (operator) {
    case "StringEquals":
      return equalsAny;
    case "StringNotEquals":
      return !equalsAny;
    case "StringLike":
    case "ArnEquals":
    case "ArnLike":
      return matchesAny;
    case "StringNotLike":
      return !matchesAny;
    case "Null":
      return (actual === undefined) === (values[0] === "true");
    default:
      throw new Error(`Can't evaluate the condition operator ${operator}`);
  }
}

function applies(statement: Statement, action: string, resource: string, context: RequestContext): boolean {
  if ("NotResource" in statement) throw new Error(`Can't evaluate NotResource (${statement.Sid ?? "no Sid"})`);
  const conditions = Object.entries(statement.Condition ?? {}).flatMap(([operator, keys]) =>
    Object.entries(keys).map(([key, values]) => ({ operator, key, values: list(values) })),
  );
  return (
    coversAction(statement, action) &&
    list(statement.Resource).some((pattern) => wildcardMatches(pattern, resource, false)) &&
    conditions.every(({ operator, key, values }) => conditionHolds(operator, key, values, context))
  );
}

/** What a policy decides for one request: an explicit deny wins over any allow. */
export function decide(statements: Statement[], action: string, resource: string, context: RequestContext = {}): Decision {
  const matching = statements.filter((statement) => applies(statement, action, resource, context));
  if (matching.some((statement) => statement.Effect === "Deny")) return "deny";
  return matching.some((statement) => statement.Effect === "Allow") ? "allow" : "no allow";
}

function documentStatements(document: unknown): Statement[] {
  return (document as { Statement: Statement[] }).Statement;
}

/** The policies a template gives a role or user: inline, managed, and as separate policies. */
function identityStatements(resources: Resources, logicalId: string): Statement[] {
  const { Policies = [], ManagedPolicyArns = [] } = resources[logicalId].Properties as {
    Policies?: { PolicyDocument: unknown }[];
    ManagedPolicyArns?: { Ref: string }[];
  };
  const attached = Object.values(resources).filter(
    (resource) =>
      resource.Type === "AWS::IAM::Policy" &&
      [resource.Properties.Roles, resource.Properties.Users]
        .flatMap((principals) => (principals as { Ref: string }[] | undefined) ?? [])
        .some((principal) => principal.Ref === logicalId),
  );
  return [
    ...Policies.map((policy) => policy.PolicyDocument),
    ...ManagedPolicyArns.map((arn) => resources[arn.Ref].Properties.PolicyDocument),
    ...attached.map((policy) => policy.Properties.PolicyDocument),
  ].flatMap(documentStatements);
}

export function resourcesOf(stack: Stack): Resources {
  return Template.fromStack(stack).toJSON().Resources as Resources;
}

export function logicalIdNamed(resources: Resources, type: string, nameProperty: string, name: string): string {
  const id = Object.keys(resources).find(
    (key) => resources[key].Type === type && resources[key].Properties[nameProperty] === name,
  );
  if (!id) throw new Error(`No ${type} named ${name}`);
  return id;
}

export function managedPolicyStatements(resources: Resources, name: string): Statement[] {
  const id = logicalIdNamed(resources, "AWS::IAM::ManagedPolicy", "ManagedPolicyName", name);
  return documentStatements(resources[id].Properties.PolicyDocument);
}

/**
 * Whether a role or user may make a request: its policies allow it, nothing denies it, and its
 * permissions boundary, if it has one, allows it too.
 */
export function reachOf(resources: Resources, type: "AWS::IAM::Role" | "AWS::IAM::User", name: string) {
  const nameProperty = type === "AWS::IAM::Role" ? "RoleName" : "UserName";
  const logicalId = logicalIdNamed(resources, type, nameProperty, name);
  const statements = identityStatements(resources, logicalId);
  const boundary = resources[logicalId].Properties.PermissionsBoundary as { Ref: string } | undefined;
  const boundaryStatements = boundary && documentStatements(resources[boundary.Ref].Properties.PolicyDocument);
  return (action: string, resource: string, context: RequestContext = {}): boolean =>
    decide(statements, action, resource, context) === "allow" &&
    (!boundaryStatements || decide(boundaryStatements, action, resource, context) === "allow");
}

/** A role's trust policy. */
export function trustOf(resources: Resources, roleName: string): Statement[] {
  const id = logicalIdNamed(resources, "AWS::IAM::Role", "RoleName", roleName);
  return documentStatements(resources[id].Properties.AssumeRolePolicyDocument);
}
