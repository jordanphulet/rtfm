import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tempDataDir } from "../testing.ts";
import { DataFolderInUse, LOCK_FILE_NAME, lockDataFolder } from "./lock.ts";

function endedProcessPid(): number {
  const { pid } = spawnSync(process.execPath, ["-e", ""]);
  if (pid === undefined) throw new Error("Couldn't start a process");
  return pid;
}

describe("lockDataFolder", () => {
  it("writes this process's PID to the lock file, and leaves no other file", async () => {
    const dataDir = await tempDataDir();
    await lockDataFolder(dataDir);
    expect(await readFile(path.join(dataDir, LOCK_FILE_NAME), "utf8")).toBe(String(process.pid));
    expect(await readdir(dataDir)).toEqual([LOCK_FILE_NAME]);
  });

  it("refuses a second lock while the holder is running, naming the folder and the PID", async () => {
    const dataDir = await tempDataDir();
    await lockDataFolder(dataDir);
    const second = lockDataFolder(dataDir);
    await expect(second).rejects.toThrow(DataFolderInUse);
    await expect(second).rejects.toThrow(`(PID ${process.pid})`);
    await expect(second).rejects.toThrow(dataDir);
  });

  it("takes over a lock left by a process that has ended", async () => {
    const dataDir = await tempDataDir();
    await writeFile(path.join(dataDir, LOCK_FILE_NAME), String(endedProcessPid()));
    await lockDataFolder(dataDir);
    expect(await readFile(path.join(dataDir, LOCK_FILE_NAME), "utf8")).toBe(String(process.pid));
  });

  it("takes over a lock file that holds no PID", async () => {
    const dataDir = await tempDataDir();
    await writeFile(path.join(dataDir, LOCK_FILE_NAME), "");
    await lockDataFolder(dataDir);
    expect(await readFile(path.join(dataDir, LOCK_FILE_NAME), "utf8")).toBe(String(process.pid));
  });

  it("lets only one of two simultaneous locks win", async () => {
    const dataDir = await tempDataDir();
    const results = await Promise.allSettled([lockDataFolder(dataDir), lockDataFolder(dataDir)]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("removes the lock file on release, so the folder can be locked again", async () => {
    const dataDir = await tempDataDir();
    const lock = await lockDataFolder(dataDir);
    await lock.release();
    expect(await readdir(dataDir)).toEqual([]);
    await expect(lockDataFolder(dataDir)).resolves.toBeDefined();
  });
});
