import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SectionState } from "../server/api/types.ts";
import { startServer, type RunningServer } from "../server/app.ts";
import { config } from "../server/config.ts";
import { localUrl, startViteServer } from "./vite-server.ts";

const START_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 60_000;
const MANUAL = "the-haunt-that-listens";
const SECTION = "sensing-the-guest";
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };
/** Every host but `localhost` and `127.0.0.1` fails to resolve, so the page reaches only loopback (`server/README.md` › Tests). */
const LOOPBACK_ONLY_ARGS = ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"];

const subscripts = (count: number) => Array.from({ length: count }, (_, index) => `x_{${index + 1}}`).join("");
const longSum = Array.from({ length: 30 }, (_, index) => `a_{${index + 1}}`).join(" + ");
const BODY = String.raw`The pitch is $$v = f\lambda$$ for a closed pipe.

The sum $$${longSum}$$ breaks after its plus signs.

Forty subscripts in a row, $$${subscripts(40)}$$, have nowhere to break.

Twenty, $$${subscripts(20)}$$, fit a desktop's line but not a phone's.

Nor do two hundred delimiters, $$${String.raw`\Bigg(`.repeat(200)}$$, at all.

| Name | Formula |
| --- | --- |
| Subscripts | $$${subscripts(40)}$$ |`;

let dataDir: string;
let apiServer: RunningServer;
let viteServer: ViteDevServer;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "rtfm-wide-formula-"));
  apiServer = await startServer({ ...config, dataDir, passcode: undefined, port: 0, models: "fake" });
  viteServer = await startViteServer(apiServer.port);
  browser = await chromium.launch({ args: LOOPBACK_ONLY_ARGS });
  page = await browser.newPage({ viewport: PHONE, isMobile: true, hasTouch: true });
  const section: SectionState = { status: "written", body: BODY };
  await page.route(`**/api/manuals/${MANUAL}/sections/${SECTION}`, (route) => route.fulfill({ json: section }));
  await page.goto(`${localUrl(viteServer)}read/${MANUAL}/${SECTION}`, { waitUntil: "networkidle" });
  await page.locator("td .formula").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const regions = page.locator("span.formula[role=region]");
  await vi.waitFor(async () => expect(await regions.count()).toBe(3));
}, START_TIMEOUT_MS);

afterAll(async () => {
  await browser?.close();
  await viteServer?.close();
  await apiServer?.close();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}, START_TIMEOUT_MS);

describe("an inline formula wider than the measure, at phone width", () => {
  it("keeps the page as wide as the viewport", { timeout: TEST_TIMEOUT_MS }, async () => {
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBe(PHONE.width);
  });

  it("scrolls sideways in its own labelled, focusable region", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (const region of await page.locator("span.formula[role=region]").all()) {
      expect(await region.getAttribute("aria-label")).toBe("Formula");
      expect(await region.getAttribute("tabindex")).toBe("0");
      expect(await scrollsSideways(region)).toBe(true);
    }
  });

  it("widens a table's cell instead, so the table scrolls", { timeout: TEST_TIMEOUT_MS }, async () => {
    const formula = page.locator("td span.formula");
    expect(await formula.getAttribute("role")).toBeNull();
    expect(await scrollsSideways(page.locator(".table-scroll"))).toBe(true);
  });

  it("leaves a formula that fits, or breaks across lines, flowing with the text", { timeout: TEST_TIMEOUT_MS }, async () => {
    const [short, sum] = await page.locator("span.formula").all();
    for (const formula of [short!, sum!]) {
      expect(await formula.getAttribute("role")).toBeNull();
      expect(await formula.getAttribute("tabindex")).toBeNull();
      expect(await formula.evaluate((element) => getComputedStyle(element).display)).toBe("inline");
    }
    expect(await sum!.evaluate((element) => element.getClientRects().length)).toBeGreaterThan(1);
  });

  it("goes back on the line when the window grows wide enough", { timeout: TEST_TIMEOUT_MS }, async () => {
    const twenty = page.locator("p", { hasText: "Twenty" }).locator("span.formula");
    await page.setViewportSize(DESKTOP);
    await expect.poll(() => twenty.getAttribute("role")).toBeNull();
    await page.setViewportSize(PHONE);
    await expect.poll(() => twenty.getAttribute("role")).toBe("region");
  });
});

function scrollsSideways(element: Locator): Promise<boolean> {
  return element.evaluate((box) => box.scrollWidth > box.clientWidth);
}
