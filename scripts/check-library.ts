import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { libraryVariantFromArgs } from "./library-variant.ts";

const variant = libraryVariantFromArgs("check:library");

const configDir = "node_modules/.tmp";
const configPath = `${configDir}/tsconfig.check-library-${variant}.json`;
const config = {
  extends: "../../tsconfig.app.json",
  compilerOptions: { tsBuildInfoFile: `./tsconfig.check-library-${variant}.tsbuildinfo` },
  include: [`../../src/library-prototypes/${variant}`],
};

await mkdir(configDir, { recursive: true });
await writeFile(configPath, JSON.stringify(config, null, 2));

const tsc = spawnSync("npx", ["tsc", "-b", configPath], { stdio: "inherit" });
if (tsc.status === 0) console.log(`Library variant ${variant} type-checks.`);
process.exit(tsc.status ?? 1);
