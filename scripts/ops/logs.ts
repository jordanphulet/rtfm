import { READ_ROLE } from "../../infra/rtfm.ts";
import { entriesIn, formatEntry, matches, type LogFilter } from "../../server/logging/log-reader.ts";
import { asRole, type CommandResult, type OpsContext } from "./context.ts";
import { APP_LOG_GROUP } from "./deployed.ts";

const MS_PER_UNIT = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const DURATION = /^([1-9]\d*)([mhd])$/;

/** `--since`'s duration, such as `90m`, `6h` or `2d`, in milliseconds. */
export function sinceMs(value: string): number {
  const match = DURATION.exec(value);
  if (!match) throw new Error(`--since must be a whole number of minutes, hours or days (90m, 6h, 2d), not "${value}"`);
  return Number(match[1]) * MS_PER_UNIT[match[2] as keyof typeof MS_PER_UNIT];
}

export interface LogsRequest {
  filter: LogFilter;
  count: number;
  sinceMs: number;
}

/** The last `count` entries in the Web Function's log group that match, read as `rtfm-read`, oldest first. */
export function logs({ filter, count, sinceMs }: LogsRequest, context: OpsContext): Promise<CommandResult> {
  return asRole(context, READ_ROLE, async (session) => {
    const since = new Date(context.now().getTime() - sinceMs);
    const output = (await session.aws([
      "logs",
      "filter-log-events",
      "--log-group-name",
      APP_LOG_GROUP,
      "--start-time",
      String(since.getTime()),
    ])) as { events?: { message?: string }[] };
    const messages = (output.events ?? []).map((event) => event.message ?? "");
    const entries = entriesIn(messages)
      .filter((entry) => matches(entry, filter))
      .slice(-count);
    const text =
      entries.length > 0
        ? entries.map(formatEntry).join("\n")
        : `No entry in ${APP_LOG_GROUP} matches, since ${since.toISOString()}.`;
    return { text, json: entries, ok: true };
  });
}
