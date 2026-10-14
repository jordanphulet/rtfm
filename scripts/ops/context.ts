import { openAwsSession, type AwsSession, type RoleCredentials } from "../../infra/run-aws.ts";
import { REGION, USAGE_TABLE } from "../../infra/rtfm.ts";
import type { DynamoDbTable } from "../../server/storage/dynamodb-manual-store.ts";

/** What a command's output holds: text for people, the same as JSON, and whether it read everything. */
export interface CommandResult {
  text: string;
  json: unknown;
  ok: boolean;
}

/** Where the ops tools reach AWS: AWS itself, or the tests' stand-ins. */
export interface OpsContext {
  openSession(role: string): AwsSession;
  /** The table `rtfm-usage`, reached with a role's temporary keys. */
  usageTable(credentials: RoleCredentials): DynamoDbTable;
  now(): Date;
}

export const awsContext: OpsContext = {
  openSession: (role) => openAwsSession(role),
  usageTable: (credentials) => ({
    name: USAGE_TABLE,
    region: REGION,
    endpoint: `https://dynamodb.${REGION}.amazonaws.com`,
    credentials: { kind: "keys", ...credentials },
  }),
  now: () => new Date(),
};

/** Runs `use` in a session as `role`, and closes the session after. */
export async function asRole<T>(context: OpsContext, role: string, use: (session: AwsSession) => Promise<T>): Promise<T> {
  const session = context.openSession(role);
  try {
    return await use(session);
  } finally {
    session.close();
  }
}

/** The table `rtfm-usage`, reached as the session's role. */
export async function usageTableAs(context: OpsContext, session: AwsSession): Promise<DynamoDbTable> {
  return context.usageTable(await session.credentials());
}
