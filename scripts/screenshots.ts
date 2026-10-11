import { chromium, type BrowserContext, type BrowserContextOptions, type Page } from "playwright";
import { createLogger, createServer, type Logger, type ViteDevServer } from "vite";

const SETTLE_MS = 300;

// Re-rastering only the changed part of a tile leaves anti-aliased edges, such as a status
// ring's, one color step off from run to run. Re-rastering whole tiles makes shots repeatable.
const REPEATABLE_RASTER_ARGS = ["--disable-partial-raster"];

type Capture = {
  path: string;
  file: string;
  fullPage?: boolean;
  prepare?: (page: Page) => Promise<void>;
};

export type CaptureGroup = { options: BrowserContextOptions; captures: Capture[] };

type ShotResult = { file: string; saved: boolean; errors: string[] };

export async function startViteServer(port: number, apiPort: number): Promise<ViteDevServer> {
  const server = await createServer({
    server: {
      port,
      strictPort: true,
      forwardConsole: false,
      proxy: { "/api": `http://localhost:${apiPort}` },
    },
    clearScreen: false,
    customLogger: createLoggerWithoutRepeatedErrors(),
  });
  await server.listen();
  return server;
}

export async function captureAll(baseURL: string, groups: CaptureGroup[]): Promise<ShotResult[]> {
  const browser = await chromium.launch({ args: REPEATABLE_RASTER_ARGS });
  try {
    const results = await Promise.all(
      groups.map(async ({ options, captures }) => {
        const context = await browser.newContext({ ...options, baseURL, colorScheme: "dark" });
        try {
          const groupResults: ShotResult[] = [];
          for (const shot of captures) groupResults.push(await capture(context, shot));
          return groupResults;
        } finally {
          await context.close();
        }
      }),
    );
    return results.flat();
  } finally {
    await browser.close();
  }
}

async function capture(
  context: BrowserContext,
  { path, file, fullPage, prepare }: Capture,
): Promise<ShotResult> {
  const errors = new Set<string>();
  let saved = false;

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.add(briefly(`${message.text()}\n${message.location().url}`));
  });
  page.on("pageerror", (error) => errors.add(briefly(error.stack ?? error.message)));

  try {
    await page.goto(path, { waitUntil: "networkidle" });
    await settle(page);
    await prepare?.(page);
    await page.screenshot({ path: file, fullPage, animations: "disabled" });
    saved = true;
  } catch (error) {
    errors.add(`Capture failed: ${String(error).split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return { file, saved, errors: [...errors] };
}

export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(SETTLE_MS);
}

export function printSummary(results: ShotResult[]): boolean {
  const saved = results.filter((result) => result.saved);
  console.log(`\nSaved ${saved.length} of ${results.length} screenshots:`);
  for (const { file } of saved) console.log(`  ${file}`);

  const failed = results.filter((result) => result.errors.length > 0);
  if (failed.length === 0) {
    console.log("\nNo errors.");
    return true;
  }

  console.log(`\nErrors in ${failed.length} screenshots:`);
  for (const { file, errors } of failed) {
    console.log(`  ${file}`);
    for (const error of errors) console.log(`    ${error}`);
  }
  return false;
}

function createLoggerWithoutRepeatedErrors(): Logger {
  const logger = createLogger("warn");
  const loggedErrors = new Set<string>();
  const logError = logger.error;
  logger.error = (message, options) => {
    const key = options?.error?.message ?? message;
    if (loggedErrors.has(key)) return;
    loggedErrors.add(key);
    logError(message, options);
  };
  return logger;
}

function briefly(error: string): string {
  return error
    .replaceAll(/%[a-zA-Z]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, 2)
    .join("  ");
}
