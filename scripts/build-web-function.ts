import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "rolldown";
import { build as buildApp } from "vite";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = "server/web-function.ts";
/** Where the bundle puts the entry: `AWS_LAMBDA_NODEJS_ENTRYPOINT`, relative to the package's root. */
export const WEB_FUNCTION_ENTRYPOINT = "server/web-function.mjs";
const USAGE = "Usage: node scripts/build-web-function.ts <empty output folder>";

/**
 * Builds the Web Function's package into an empty folder: the built app in `dist/`; the server,
 * with what it uses of `node_modules`, bundled into one file, `server/web-function.mjs`; and the
 * seed manuals in `seed/`. Every module in the bundle resolves a path against the bundle's own
 * URL, so `seed.ts`'s `../seed/` is the package's `seed/`, and `web-function.ts`'s `../dist` its
 * `dist/`.
 */
export async function buildWebFunction(outDir: string): Promise<void> {
  await buildApp({ root: ROOT, logLevel: "warn", build: { outDir: path.join(outDir, "dist"), emptyOutDir: true } });
  await bundle({
    cwd: ROOT,
    input: path.join(ROOT, ENTRY),
    platform: "node",
    logLevel: "warn",
    output: { file: path.join(outDir, WEB_FUNCTION_ENTRYPOINT), format: "esm", codeSplitting: false },
  });
  await cp(path.join(ROOT, "server/seed"), path.join(outDir, "seed"), { recursive: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [outDir] = process.argv.slice(2);
  if (!outDir) {
    console.error(USAGE);
    process.exit(2);
  }
  await mkdir(outDir, { recursive: true });
  if ((await readdir(outDir)).length > 0) {
    console.error(`${outDir} isn't empty.\n${USAGE}`);
    process.exit(2);
  }
  await buildWebFunction(path.resolve(outDir));
}
