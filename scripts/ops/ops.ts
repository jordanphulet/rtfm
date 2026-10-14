import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { LOG_OPTIONS, logOptionsFrom } from "../../server/logging/log-reader.ts";
import { awsContext, type CommandResult, type OpsContext } from "./context.ts";
import { KILL_SWITCH_ACTIONS, killSwitch, type KillSwitchAction } from "./kill-switch.ts";
import { logs, sinceMs } from "./logs.ts";
import { status } from "./status.ts";
import { usage } from "./usage.ts";

const USAGE = `Usage: npm run ops -- <command> [--json]

  kill-switch on|off|status   Bedrock's kill switch in rtfm-usage, as rtfm-ops
  usage                       Today's and this month's Bedrock spend in rtfm-usage, as rtfm-read
  logs [--level <level>] [--event <event>] [--lines <n>] [--since <90m|6h|2d>]
                              The Web Function's log entries in /rtfm/app, as rtfm-read
  status                      The stacks, the Web Function, the tables, the spend and the kill switch, as rtfm-read`;

const JSON_OPTION = { json: { type: "boolean", default: false } } as const;
const LOGS_OPTIONS = { ...LOG_OPTIONS, since: { type: "string", default: "1d" } } as const;

/** A command line the tools don't take, with what is wrong. */
export class OpsUsageError extends Error {}

/** Runs one ops command and gives what to print: text, or JSON with `--json`. */
export async function runOps(args: string[], context: OpsContext): Promise<{ stdout: string; ok: boolean }> {
  const [command, ...rest] = args;
  const { values, positionals } = parsed(rest, command === "logs" ? LOGS_OPTIONS : {});
  const result = await commandResult(command, positionals, values, context);
  return { stdout: values.json ? JSON.stringify(result.json, null, 2) : result.text, ok: result.ok };
}

function commandResult(
  command: string | undefined,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
  context: OpsContext,
): Promise<CommandResult> {
  switch (command) {
    case "kill-switch": {
      const [action, ...extra] = positionals;
      if (!KILL_SWITCH_ACTIONS.includes(action as KillSwitchAction) || extra.length > 0) {
        throw new OpsUsageError("kill-switch takes one of on, off or status");
      }
      return killSwitch(action as KillSwitchAction, context);
    }
    case "usage":
      noPositionals(command, positionals);
      return usage(context);
    case "logs": {
      noPositionals(command, positionals);
      const { filter, count } = logOptionsFrom(values as { level?: string; event?: string; lines?: string });
      return logs({ filter, count, sinceMs: sinceMs(values.since as string) }, context);
    }
    case "status":
      noPositionals(command, positionals);
      return status(context);
    default:
      throw new OpsUsageError(command === undefined ? "Name a command." : `There is no command "${command}".`);
  }
}

function parsed(args: string[], options: ParseArgsOptionsConfig) {
  try {
    return parseArgs({ args, options: { ...options, ...JSON_OPTION }, allowPositionals: true, strict: true });
  } catch (error) {
    throw new OpsUsageError((error as Error).message);
  }
}

function noPositionals(command: string, positionals: string[]): void {
  if (positionals.length > 0) throw new OpsUsageError(`${command} takes no argument, not "${positionals.join(" ")}"`);
}

async function main(args: string[]): Promise<void> {
  try {
    const { stdout, ok } = await runOps(args, awsContext);
    console.log(stdout);
    process.exitCode = ok ? 0 : 1;
  } catch (error) {
    console.error((error as Error).message);
    if (error instanceof OpsUsageError) console.error(`\n${USAGE}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
