import { rm, writeFile } from "node:fs/promises";
import { silentLogger } from "../logging/logger.ts";
import { createFileLedger } from "../storage/file-ledger.ts";
import { tempDataDir } from "../testing.ts";
import { openFileSpendingLedger } from "./file-spending-ledger.ts";
import { killSwitchPath } from "./gateway.ts";
import { describeSpendingLedger, SUITE_NOW } from "./spending-ledger-suite.ts";

describeSpendingLedger("the data folder's spending ledger", async () => {
  const dataDir = await tempDataDir();
  const open = () => openFileSpendingLedger({ ledger: createFileLedger(dataDir, silentLogger), dataDir, now: () => SUITE_NOW });
  return {
    open,
    async openRacing() {
      const ledger = await open();
      return [ledger, ledger];
    },
    async setKillSwitch(on) {
      if (on) await writeFile(killSwitchPath(dataDir), "");
      else await rm(killSwitchPath(dataDir));
    },
  };
});
