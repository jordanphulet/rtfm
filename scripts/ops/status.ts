import { AwsCommandFailed, type AwsSession } from "../../infra/run-aws.ts";
import { ACCESS_STACK, APP_TABLE, READ_ROLE, REGION, TOOLKIT_STACK, USAGE_TABLE } from "../../infra/rtfm.ts";
import { formatUsd, usageSummary, type PeriodSpend, type UsageSummary } from "../../server/gateway/usage-report.ts";
import { asRole, type CommandResult, type OpsContext } from "./context.ts";
import {
  APP_STACK,
  CERTIFICATE_REGION,
  EDGE_CERTIFICATE_STACK,
  EDGE_STACK,
  WEB_FUNCTION,
  WEB_FUNCTION_ENDPOINT,
} from "./deployed.ts";
import { killSwitchLine } from "./kill-switch.ts";
import { usageInput } from "./usage.ts";

const STACKS = [
  { name: TOOLKIT_STACK, region: REGION },
  { name: ACCESS_STACK, region: REGION },
  { name: APP_STACK, region: REGION },
  { name: EDGE_CERTIFICATE_STACK, region: CERTIFICATE_REGION },
  { name: EDGE_STACK, region: REGION },
];
const TABLES = [APP_TABLE, USAGE_TABLE];
/** How the AWS CLI says a stack, Web Function, endpoint or table isn't there. */
const NOT_THERE = /does not exist|ResourceNotFoundException|TableNotFoundException/;

/** What one read found: the resource, that it isn't there, or why it couldn't be read. */
type Found<T> = T | { missing: true } | { error: string };

interface StackStatus {
  status: string;
  terminationProtection: boolean;
}
interface WebFunctionStatus {
  state: string;
}
interface EndpointStatus {
  authType: string;
  state: string;
}
interface TableStatus {
  status: string;
  deletionProtection: boolean;
  pointInTimeRecovery: string;
}

/**
 * The stacks, the Web Function and its endpoint, the tables' protection, today's and this month's
 * Bedrock spend and the kill switch, read as `rtfm-read`. It is `ok` when every read worked,
 * whatever it found.
 */
export function status(context: OpsContext): Promise<CommandResult> {
  return asRole(context, READ_ROLE, async (session) => {
    const [stacks, webFunction, endpoint, tables, spend] = await Promise.all([
      Promise.all(STACKS.map(async (stack) => ({ ...stack, found: await find(() => stackStatus(session, stack)) }))),
      find(() => webFunctionStatus(session)),
      find(() => endpointStatus(session)),
      Promise.all(TABLES.map(async (name) => ({ name, found: await find(() => tableStatus(session, name)) }))),
      attempt(async () => usageSummary(await usageInput(context, session))),
    ]);
    const reads = [...stacks.map((stack) => stack.found), webFunction, endpoint, ...tables.map((table) => table.found)];
    const text = [
      "Stacks:",
      ...aligned(stacks.map(({ name, region, found }) => [name, region, shown(found, stackText)])),
      `Web Function ${WEB_FUNCTION}: ${shown(webFunction, (fn) => fn.state)}`,
      `  endpoint ${WEB_FUNCTION_ENDPOINT}: ${shown(endpoint, (it) => `${it.authType}, ${it.state}`)}`,
      "Tables:",
      ...aligned(tables.map(({ name, found }) => [name, shown(found, tableText)])),
      ...("error" in spend ? [`Bedrock spend and kill switch: couldn't read: ${spend.error}`] : spendLines(spend)),
    ].join("\n");
    const json = {
      stacks: stacks.map(({ name, region, found }) => ({ name, region, ...found })),
      webFunction: { name: WEB_FUNCTION, ...webFunction },
      endpoint: { name: WEB_FUNCTION_ENDPOINT, ...endpoint },
      tables: tables.map(({ name, found }) => ({ name, ...found })),
      spend: "error" in spend ? spend : { today: spend.today, month: spend.month },
      killSwitchOn: "error" in spend ? null : spend.killSwitchOn,
    };
    return { text, json, ok: [...reads, spend].every((read) => !("error" in read)) };
  });
}

/** What a read found, or why it couldn't be read. */
async function attempt<T>(read: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await read();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** What a read of a resource found, that it isn't there, or why it couldn't be read. */
function find<T extends object>(read: () => Promise<T>): Promise<Found<T>> {
  return attempt(async () => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof AwsCommandFailed && NOT_THERE.test(error.stderr)) return { missing: true as const };
      throw error;
    }
  });
}

async function stackStatus(session: AwsSession, { name, region }: (typeof STACKS)[number]): Promise<StackStatus> {
  const args = ["cloudformation", "describe-stacks", "--stack-name", name, "--region", region];
  const output = (await session.aws(args)) as {
    Stacks: { StackStatus: string; EnableTerminationProtection?: boolean }[];
  };
  const [stack] = output.Stacks;
  return { status: stack.StackStatus, terminationProtection: stack.EnableTerminationProtection === true };
}

async function webFunctionStatus(session: AwsSession): Promise<WebFunctionStatus> {
  const output = (await session.aws(["lambda-web", "get-web-function", "--function-name", WEB_FUNCTION])) as {
    state: string;
  };
  return { state: output.state };
}

async function endpointStatus(session: AwsSession): Promise<EndpointStatus> {
  const output = (await session.aws([
    "lambda-web",
    "get-web-function-endpoint",
    "--function-name",
    WEB_FUNCTION,
    "--endpoint-name",
    WEB_FUNCTION_ENDPOINT,
  ])) as EndpointStatus;
  return { authType: output.authType, state: output.state };
}

async function tableStatus(session: AwsSession, name: string): Promise<TableStatus> {
  const [description, backups] = (await Promise.all([
    session.aws(["dynamodb", "describe-table", "--table-name", name]),
    session.aws(["dynamodb", "describe-continuous-backups", "--table-name", name]),
  ])) as [
    { Table: { TableStatus: string; DeletionProtectionEnabled?: boolean } },
    { ContinuousBackupsDescription: { PointInTimeRecoveryDescription?: { PointInTimeRecoveryStatus?: string } } },
  ];
  return {
    status: description.Table.TableStatus,
    deletionProtection: description.Table.DeletionProtectionEnabled === true,
    pointInTimeRecovery:
      backups.ContinuousBackupsDescription.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus ?? "DISABLED",
  };
}

function shown<T extends object>(found: Found<T>, text: (value: T) => string): string {
  if ("missing" in found) return "missing";
  if ("error" in found) return `couldn't read: ${found.error}`;
  return text(found);
}

function stackText({ status, terminationProtection }: StackStatus): string {
  return `${status}, termination protection ${terminationProtection ? "on" : "off"}`;
}

function tableText({ status, deletionProtection, pointInTimeRecovery }: TableStatus): string {
  const protection = `deletion protection ${deletionProtection ? "on" : "off"}`;
  return `${status}, ${protection}, point-in-time recovery ${pointInTimeRecovery}`;
}

function spendLines({ today, month, killSwitchOn }: UsageSummary): string[] {
  const period = (title: string, spend: PeriodSpend) =>
    `${title}, ${spend.period}: ${formatUsd(spend.usd)} of $${spend.capUsd.toFixed(2)}`;
  return [`Bedrock spend: ${period("today", today)}; ${period("this month", month)}`, killSwitchLine(killSwitchOn)];
}

/** Rows as indented columns, each padded to its widest cell. */
function aligned(rows: string[][]): string[] {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const padded = (row: string[]) => row.map((cell, column) => (column < row.length - 1 ? cell.padEnd(widths[column]) : cell));
  return rows.map((row) => `  ${padded(row).join("  ")}`);
}
