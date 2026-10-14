import { describe, expect, it } from "vitest";
import { createDynamoDbSpendingLedger } from "../../server/gateway/dynamodb-spending-ledger.ts";
import { testUsageTable } from "../../server/gateway/dynamodb-testing.ts";
import { status } from "./status.ts";
import { standInAws, type StandInAnswer } from "./testing.ts";

const now = new Date("2026-10-13T12:00:00.000Z");
const stack = (name: string, StackStatus: string, protectedStack = true): StandInAnswer => ({
  args: ["cloudformation", "describe-stacks", "--stack-name", name],
  stdout: { Stacks: [{ StackName: name, StackStatus, EnableTerminationProtection: protectedStack }] },
});
const table = (name: string): StandInAnswer[] => [
  {
    args: ["dynamodb", "describe-table", "--table-name", name],
    stdout: { Table: { TableName: name, TableStatus: "ACTIVE", DeletionProtectionEnabled: true } },
  },
  {
    args: ["dynamodb", "describe-continuous-backups", "--table-name", name],
    stdout: {
      ContinuousBackupsDescription: {
        ContinuousBackupsStatus: "ENABLED",
        PointInTimeRecoveryDescription: { PointInTimeRecoveryStatus: "ENABLED" },
      },
    },
  },
];
const DEPLOYED: StandInAnswer[] = [
  stack("RtfmToolkit", "UPDATE_COMPLETE"),
  stack("RtfmAccess", "UPDATE_COMPLETE"),
  stack("RtfmApp", "UPDATE_COMPLETE", false),
  stack("RtfmEdgeCertificate", "CREATE_COMPLETE"),
  {
    args: ["cloudformation", "describe-stacks", "--stack-name", "RtfmEdge"],
    stderr: "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id RtfmEdge does not exist",
    code: 254,
  },
  { args: ["lambda-web", "get-web-function", "--function-name", "rtfm-app"], stdout: { name: "rtfm-app", state: "Active" } },
  {
    args: ["lambda-web", "get-web-function-endpoint", "--function-name", "rtfm-app", "--endpoint-name", "main"],
    stdout: { name: "main", authType: "IamAuth", state: "Active" },
  },
  ...table("rtfm-app"),
  ...table("rtfm-usage"),
];

async function usageTableWithSpend() {
  const usageTable = await testUsageTable();
  const model = "global.anthropic.claude-haiku-4-5-20251001-v1:0";
  const call = { libraryId: "admin", job: "write-section", model, worstCaseUsd: 0.01 };
  await createDynamoDbSpendingLedger(usageTable).importCall({ callId: "a", reservedAt: "2026-10-13T09:00:00.000Z", ...call });
  return usageTable;
}

describe("npm run ops -- status", () => {
  it("reads the stacks, the Web Function, the tables, the spend and the kill switch, as rtfm-read", async () => {
    const { context, calls } = standInAws(DEPLOYED, { usageTable: await usageTableWithSpend(), now });

    const result = await status(context);

    expect(result.text).toBe(
      [
        "Stacks:",
        "  RtfmToolkit          us-west-2  UPDATE_COMPLETE, termination protection on",
        "  RtfmAccess           us-west-2  UPDATE_COMPLETE, termination protection on",
        "  RtfmApp              us-west-2  UPDATE_COMPLETE, termination protection off",
        "  RtfmEdgeCertificate  us-east-1  CREATE_COMPLETE, termination protection on",
        "  RtfmEdge             us-west-2  missing",
        "Web Function rtfm-app: Active",
        "  endpoint main: IamAuth, Active",
        "Tables:",
        "  rtfm-app    ACTIVE, deletion protection on, point-in-time recovery ENABLED",
        "  rtfm-usage  ACTIVE, deletion protection on, point-in-time recovery ENABLED",
        "Bedrock spend: today, 2026-10-13: $0.0100 of $2.00; this month, 2026-10: $0.0100 of $20.00",
        "Kill switch: off.",
      ].join("\n"),
    );
    expect(result.ok).toBe(true);
    expect(result.json).toMatchObject({
      stacks: [
        { name: "RtfmToolkit", region: "us-west-2", status: "UPDATE_COMPLETE", terminationProtection: true },
        { name: "RtfmAccess", region: "us-west-2", status: "UPDATE_COMPLETE", terminationProtection: true },
        { name: "RtfmApp", region: "us-west-2", status: "UPDATE_COMPLETE", terminationProtection: false },
        { name: "RtfmEdgeCertificate", region: "us-east-1", status: "CREATE_COMPLETE", terminationProtection: true },
        { name: "RtfmEdge", region: "us-west-2", missing: true },
      ],
      webFunction: { name: "rtfm-app", state: "Active" },
      endpoint: { name: "main", authType: "IamAuth", state: "Active" },
      tables: [
        { name: "rtfm-app", status: "ACTIVE", deletionProtection: true, pointInTimeRecovery: "ENABLED" },
        { name: "rtfm-usage", status: "ACTIVE", deletionProtection: true, pointInTimeRecovery: "ENABLED" },
      ],
      spend: { today: { period: "2026-10-13", usd: 0.01, capUsd: 2 }, month: { period: "2026-10", usd: 0.01 } },
      killSwitchOn: false,
    });

    expect(new Set(calls().map((call) => call.profile))).toEqual(new Set(["rtfm-read"]));
    const certificate = calls().find((call) => call.args.includes("RtfmEdgeCertificate"))!;
    expect(certificate.args.slice(-4)).toEqual(["--region", "us-east-1", "--output", "json"]);
  });

  it("fails, saying what it couldn't read, and still shows the rest", async () => {
    const denied = "An error occurred (AccessDeniedException) when calling the DescribeTable operation: not authorized";
    const answers = [{ args: ["dynamodb", "describe-table", "--table-name", "rtfm-app"], stderr: denied, code: 254 }, ...DEPLOYED];
    const { context } = standInAws(answers, { usageTable: await usageTableWithSpend(), now });

    const result = await status(context);

    expect(result.ok).toBe(false);
    expect(result.text).toContain(`  rtfm-app    couldn't read: aws dynamodb describe-table failed: ${denied}`);
    expect(result.text).toContain("  rtfm-usage  ACTIVE, deletion protection on, point-in-time recovery ENABLED");
    expect(result.json).toMatchObject({
      tables: [{ name: "rtfm-app", error: `aws dynamodb describe-table failed: ${denied}` }, { name: "rtfm-usage" }],
    });
  });

  it("fails when rtfm-usage can't be read", async () => {
    const usageTable = { ...(await testUsageTable()), name: "rtfm-test-usage-not-there" };
    const { context } = standInAws(DEPLOYED, { usageTable, now });

    const result = await status(context);

    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/\nBedrock spend and kill switch: couldn't read: .*non-existent table/);
    expect(result.json).toMatchObject({ killSwitchOn: null, spend: { error: expect.stringMatching(/non-existent table/) } });
  });
});
