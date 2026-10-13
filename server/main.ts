import { runServerProcess } from "./app.ts";
import { config } from "./config.ts";
import { toLogFile } from "./logging/log-file.ts";
import { createLogger, toStandardOutput } from "./logging/logger.ts";

await runServerProcess(config, createLogger([toStandardOutput, toLogFile(config.dataDir)]));
