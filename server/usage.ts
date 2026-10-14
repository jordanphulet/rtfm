import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { config, usageTableWith } from "./config.ts";
import { readAwsCredentials } from "./gateway/credentials.ts";
import { createDynamoDbSpendingLedger } from "./gateway/dynamodb-spending-ledger.ts";
import { killSwitchPath } from "./gateway/file-spending-ledger.ts";
import { importUsage } from "./gateway/usage-import.ts";
import { usageReport } from "./gateway/usage-report.ts";
import { createLogger, toStandardError } from "./logging/logger.ts";
import { createFileLedger, monthOf } from "./storage/file-ledger.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { import: { type: "boolean", default: false }, apply: { type: "boolean", default: false } },
});
const dataDir = positionals[0] ?? config.dataDir;
const now = new Date();
const month = monthOf(now.toISOString());
const dataFolderLedger = createFileLedger(dataDir, createLogger([toStandardError]));
const usageTableLedger = () => createDynamoDbSpendingLedger(usageTableWith(config.usageTable, readAwsCredentials()));

function refuse(message: string): never {
  console.error(message);
  process.exit(1);
}

if (values.import) {
  if (config.models !== "bedrock") refuse("--import copies into rtfm-usage, so it runs with RTFM_MODELS=bedrock");
  console.log(await importUsage({ from: dataFolderLedger, into: usageTableLedger(), month, apply: values.apply }));
} else if (values.apply) {
  refuse("--apply goes with --import");
} else if (config.models === "bedrock") {
  if (positionals[0]) refuse("With RTFM_MODELS=bedrock, npm run usage reads rtfm-usage, not a data folder");
  const usageTable = usageTableLedger();
  const monthEntries = await usageTable.entriesForMonth(month);
  console.log(usageReport({ monthEntries, now, caps: config.caps, killSwitchOn: await usageTable.killSwitchOn() }));
} else {
  const monthEntries = await dataFolderLedger.entriesForMonth(month);
  console.log(usageReport({ monthEntries, now, caps: config.caps, killSwitchOn: existsSync(killSwitchPath(dataDir)) }));
}
