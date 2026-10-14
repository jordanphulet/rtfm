import { createInterface } from "node:readline";
import { openAwsSession, type AwsSession, type RoleCredentials } from "../../infra/run-aws.ts";
import { APP_TABLE, REGION, USAGE_TABLE } from "../../infra/rtfm.ts";
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
  /** The table `rtfm-app`, reached with a role's temporary keys. */
  appTable(credentials: RoleCredentials): DynamoDbTable;
  /** The terminal a person reads and types at, or undefined unless standard input and output are both one. */
  terminal(): OpsTerminal | undefined;
  now(): Date;
}

export interface OpsTerminal {
  write(text: string): void;
  /** Resolves once the person presses Enter, or standard input closes. */
  waitForEnter(): Promise<void>;
}

function processTerminal(): OpsTerminal | undefined {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  return {
    write: (text) => process.stdout.write(text),
    waitForEnter: () =>
      new Promise((resolve) => {
        const lines = createInterface({ input: process.stdin });
        lines.once("line", () => lines.close());
        lines.once("close", resolve);
      }),
  };
}

const tableAs = (name: string, credentials: RoleCredentials): DynamoDbTable => ({
  name,
  region: REGION,
  endpoint: `https://dynamodb.${REGION}.amazonaws.com`,
  credentials: { kind: "keys", ...credentials },
});

export const awsContext: OpsContext = {
  openSession: (role) => openAwsSession(role),
  usageTable: (credentials) => tableAs(USAGE_TABLE, credentials),
  appTable: (credentials) => tableAs(APP_TABLE, credentials),
  terminal: processTerminal,
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

/** The table `rtfm-app`, reached as the session's role. */
export async function appTableAs(context: OpsContext, session: AwsSession): Promise<DynamoDbTable> {
  return context.appTable(await session.credentials());
}
