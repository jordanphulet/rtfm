import { fileURLToPath } from "node:url";

export const API_PORT = 8787;

export type WriterName = "fake";

export interface ServerConfig {
  port: number;
  dataDir: string;
  writer: WriterName;
  maxConcurrentRuns: number;
}

export const config: ServerConfig = {
  port: API_PORT,
  dataDir: fileURLToPath(new URL("../.data", import.meta.url)),
  writer: writerFromEnv(process.env.RTFM_WRITER),
  maxConcurrentRuns: 3,
};

function writerFromEnv(value: string | undefined): WriterName {
  if (value === undefined || value === "fake") return "fake";
  throw new Error(`RTFM_WRITER must be "fake", not "${value}"`);
}
