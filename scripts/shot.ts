import { mkdir, rm } from "node:fs/promises";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "playwright";
import { createLogger, createServer, type Logger } from "vite";
import type * as ManualModule from "../src/shared/manual/index.ts";
import { designFromArgs, type Design } from "./design-arg.ts";

const PORTS: Record<Design, number> = { a: 5174, b: 5175, c: 5176 };
const SETTLE_MS = 300;
const TOC_TOGGLE_TIMEOUT_MS = 3000;
const TOC_TOGGLE = "[data-shot=toc-toggle]";
const HIDE_SWITCHER = "[data-shot=design-switcher] { display: none !important; }";

type Shot = { state: string; path: string; fullPage?: boolean; openToc?: boolean };
type Variant = { name: string; options: BrowserContextOptions; onlyStates?: string[] };
type ShotResult = { file: string; saved: boolean; errors: string[] };

const VARIANTS: Variant[] = [
  { name: "desktop", options: { viewport: { width: 1440, height: 900 } } },
  {
    name: "mobile",
    options: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
  },
  {
    name: "desktop-reduced",
    options: { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
    onlyStates: ["start", "streaming"],
  },
];

const design = designFromArgs("shot");
const outDir = `shots/${design}`;
const server = await createServer({
  cacheDir: `node_modules/.vite-shot/${design}`,
  server: { port: PORTS[design], strictPort: true, forwardConsole: false },
  clearScreen: false,
  customLogger: createLoggerWithoutRepeatedErrors(),
});

try {
  await server.listen();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const manual = (await server.ssrLoadModule("/src/shared/manual/index.ts")) as typeof ManualModule;
  const results = await captureAll(`http://localhost:${PORTS[design]}`, shotsFor(manual.SHOT_SECTIONS));
  process.exitCode = printSummary(results) ? 0 : 1;
} finally {
  await server.close();
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

function shotsFor(sections: typeof ManualModule.SHOT_SECTIONS): Shot[] {
  const sectionPath = (id: string) => `/${design}/${id}`;
  return [
    { state: "start", path: `/${design}` },
    { state: "toc", path: sectionPath(sections.written), openToc: true },
    { state: "written", path: sectionPath(sections.written), fullPage: true },
    { state: "dense", path: sectionPath(sections.dense), fullPage: true },
    { state: "waiting", path: `${sectionPath(sections.unwritten)}?freeze=0` },
    { state: "streaming", path: `${sectionPath(sections.unwritten)}?freeze=0.5` },
    { state: "appendix", path: sectionPath(sections.appendix), fullPage: true },
  ];
}

async function captureAll(baseURL: string, shots: Shot[]): Promise<ShotResult[]> {
  const browser = await chromium.launch();
  try {
    const results = await Promise.all(
      VARIANTS.map((variant) => captureVariant(browser, baseURL, variant, shots)),
    );
    return results.flat();
  } finally {
    await browser.close();
  }
}

async function captureVariant(
  browser: Browser,
  baseURL: string,
  variant: Variant,
  shots: Shot[],
): Promise<ShotResult[]> {
  const context = await browser.newContext({ ...variant.options, baseURL, colorScheme: "dark" });
  const results: ShotResult[] = [];
  try {
    for (const shot of shots) {
      if (variant.onlyStates && !variant.onlyStates.includes(shot.state)) continue;
      results.push(await capture(context, shot, `${shot.state}-${variant.name}`));
    }
  } finally {
    await context.close();
  }
  return results;
}

async function capture(context: BrowserContext, shot: Shot, name: string): Promise<ShotResult> {
  const file = `${outDir}/${name}.png`;
  const errors = new Set<string>();
  let saved = false;

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.add(briefly(`${message.text()}\n${message.location().url}`));
  });
  page.on("pageerror", (error) => errors.add(briefly(error.stack ?? error.message)));

  try {
    await page.goto(shot.path, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: HIDE_SWITCHER });
    await settle(page);
    if (shot.openToc) await openToc(page, name);
    await page.screenshot({ path: file, fullPage: shot.fullPage, animations: "disabled" });
    saved = true;
  } catch (error) {
    errors.add(`Capture failed: ${String(error).split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return { file, saved, errors: [...errors] };
}

async function openToc(page: Page, name: string) {
  const toggle = page.locator(TOC_TOGGLE).filter({ visible: true }).first();
  if ((await toggle.count()) === 0) {
    console.log(`${name}: no visible ${TOC_TOGGLE}`);
    return;
  }
  await toggle.click({ timeout: TOC_TOGGLE_TIMEOUT_MS });
  await settle(page);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(SETTLE_MS);
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

function printSummary(results: ShotResult[]): boolean {
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
