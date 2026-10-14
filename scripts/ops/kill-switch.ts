import { OPS_ROLE } from "../../infra/rtfm.ts";
import { createDynamoDbSpendingLedger, setKillSwitch } from "../../server/gateway/dynamodb-spending-ledger.ts";
import { asRole, usageTableAs, type CommandResult, type OpsContext } from "./context.ts";

export const KILL_SWITCH_ACTIONS = ["on", "off", "status"] as const;
export type KillSwitchAction = (typeof KILL_SWITCH_ACTIONS)[number];

/** Turns Bedrock's kill switch on or off, as `rtfm-ops`, then reads it back. */
export function killSwitch(action: KillSwitchAction, context: OpsContext): Promise<CommandResult> {
  return asRole(context, OPS_ROLE, async (session) => {
    const table = await usageTableAs(context, session);
    if (action !== "status") await setKillSwitch(table, action === "on");
    const on = await createDynamoDbSpendingLedger(table).killSwitchOn();
    return { text: killSwitchLine(on), json: { killSwitchOn: on }, ok: true };
  });
}

export function killSwitchLine(on: boolean): string {
  return on ? "Kill switch: ON. Every server refuses new Bedrock calls." : "Kill switch: off.";
}
