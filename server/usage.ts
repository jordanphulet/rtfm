import { existsSync } from "node:fs";
import { config } from "./config.ts";
import { killSwitchPath } from "./gateway/gateway.ts";
import { usageReport } from "./gateway/usage-report.ts";
import { createLogger, toStandardError } from "./logging/logger.ts";
import { createFileLedger, monthOf } from "./storage/file-ledger.ts";

const dataDir = process.argv[2] ?? config.dataDir;
const now = new Date();
const ledger = createFileLedger(dataDir, createLogger([toStandardError]));
const monthEntries = await ledger.entriesForMonth(monthOf(now.toISOString()));
const killSwitchOn = existsSync(killSwitchPath(dataDir));

console.log(usageReport({ monthEntries, now, caps: config.caps, killSwitchOn }));
