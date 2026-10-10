import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { designFromArgs } from "./design-arg.ts";

const design = designFromArgs("check");

const configDir = "node_modules/.tmp";
const configPath = `${configDir}/tsconfig.check-${design}.json`;
const config = {
  extends: "../../tsconfig.app.json",
  compilerOptions: { tsBuildInfoFile: `./tsconfig.check-${design}.tsbuildinfo` },
  include: ["../../src/shared", `../../src/designs/${design}`],
};

await mkdir(configDir, { recursive: true });
await writeFile(configPath, JSON.stringify(config, null, 2));

const tsc = spawnSync("npx", ["tsc", "-b", configPath], { stdio: "inherit" });
if (tsc.status === 0) console.log(`Design ${design} type-checks.`);
process.exit(tsc.status ?? 1);
