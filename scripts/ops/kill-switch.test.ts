import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT, KILL_SWITCH_PARTITION } from "../../infra/rtfm.ts";
import { KILL_SWITCH_KEY, createDynamoDbSpendingLedger } from "../../server/gateway/dynamodb-spending-ledger.ts";
import { testUsageTable } from "../../server/gateway/dynamodb-testing.ts";
import { killSwitch } from "./kill-switch.ts";
import { standInAws } from "./testing.ts";

describe("npm run ops -- kill-switch", () => {
  it("turns Bedrock's kill switch on and off in rtfm-usage, and reads it, as rtfm-ops", async () => {
    const usageTable = await testUsageTable();
    const { context, calls } = standInAws([], { usageTable });
    const serverLedger = createDynamoDbSpendingLedger(usageTable);

    expect(await killSwitch("status", context)).toEqual({
      text: "Kill switch: off.",
      json: { killSwitchOn: false },
      ok: true,
    });
    expect(await killSwitch("on", context)).toEqual({
      text: "Kill switch: ON. Every server refuses new Bedrock calls.",
      json: { killSwitchOn: true },
      ok: true,
    });
    expect(await serverLedger.killSwitchOn()).toBe(true);
    expect((await killSwitch("status", context)).json).toEqual({ killSwitchOn: true });
    expect((await killSwitch("off", context)).json).toEqual({ killSwitchOn: false });
    expect(await serverLedger.killSwitchOn()).toBe(false);

    expect(calls().map((call) => call.profile)).toEqual(Array(8).fill("rtfm-ops"));
    expect(calls().map((call) => call.args.slice(0, 2).join(" "))).toEqual(
      Array(4).fill(["sts get-caller-identity", "configure export-credentials"]).flat(),
    );
    expect(calls().map((call) => call.callerKey)).toEqual(Array(8).fill(undefined));
  });

  it("writes the item in the one partition rtfm-ops may write in rtfm-usage", () => {
    expect(KILL_SWITCH_KEY.pk).toBe(KILL_SWITCH_PARTITION);
  });

  it("refuses to act as anything but rtfm-ops, touching nothing and leaving no HOME behind", async () => {
    const usageTable = await testUsageTable();
    const readArn = `arn:aws:sts::${ACCOUNT}:assumed-role/rtfm-read/session`;
    const { context, calls } = standInAws([{ args: ["sts", "get-caller-identity"], stdout: { Arn: readArn } }], {
      usageTable,
    });

    await expect(killSwitch("on", context)).rejects.toThrow(/^Refused: This acts as .*rtfm-read.*, not as rtfm-ops/);

    expect(await createDynamoDbSpendingLedger(usageTable).killSwitchOn()).toBe(false);
    expect(calls().map((call) => call.args.slice(0, 2).join(" "))).toEqual(["sts get-caller-identity"]);
    expect(existsSync(calls()[0].home)).toBe(false);
  });

  it("fails with a fixed message, quoting none of it, when the CLI gives no temporary keys", async () => {
    const usageTable = await testUsageTable();
    const exportCredentials = ["configure", "export-credentials"];
    for (const answer of [
      { args: exportCredentials, rawStdout: "AccessKeyId=ASIASECRETLOOKING not JSON" },
      { args: exportCredentials, stdout: { AccessKeyId: "ASIASECRETLOOKING", SecretAccessKey: "s" } },
    ]) {
      const { context } = standInAws([answer], { usageTable });
      const failure = killSwitch("on", context);
      await expect(failure).rejects.toThrow("aws configure export-credentials gave no temporary keys for rtfm-ops");
      await expect(failure).rejects.not.toThrow(/ASIASECRETLOOKING/);
    }
    expect(await createDynamoDbSpendingLedger(usageTable).killSwitchOn()).toBe(false);
  });

  it("removes its HOME, with the cached role session, once it is done", async () => {
    const { context, calls } = standInAws([], { usageTable: await testUsageTable() });
    await killSwitch("status", context);
    expect(existsSync(calls()[0].home)).toBe(false);
  });
});
