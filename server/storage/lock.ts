import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createExclusively, isErrorCode, readIfExists } from "./files.ts";

export const LOCK_FILE_NAME = "server.lock";

export class DataFolderInUse extends Error {
  constructor(dataDir: string, pid: number) {
    super(`Another server (PID ${pid}) is using the data folder ${dataDir}. Stop it first, or use another data folder.`);
  }
}

export interface DataFolderLock {
  release(): Promise<void>;
}

/** Holds the data folder for this process. A lock left by a process that has ended is taken over. */
export async function lockDataFolder(dataDir: string): Promise<DataFolderLock> {
  const lockFile = path.join(dataDir, LOCK_FILE_NAME);
  await mkdir(dataDir, { recursive: true });
  while (!(await createExclusively(lockFile, String(process.pid)))) {
    const holder = await lockHolder(lockFile);
    if (holder !== undefined && isRunning(holder)) throw new DataFolderInUse(dataDir, holder);
    await rm(lockFile, { force: true });
  }
  return { release: () => rm(lockFile, { force: true }) };
}

async function lockHolder(lockFile: string): Promise<number | undefined> {
  const pid = Number(await readIfExists(lockFile));
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrorCode(error, "EPERM");
  }
}
