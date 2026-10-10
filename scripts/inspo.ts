import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";

const OUT_DIR = "docs/inspo";
const SOFTWARE_WEBGL_ARGS = ["--enable-unsafe-swiftshader"];
const SETTLE_MS = 1500;
const STRIPE_PRESS_WAIT_MS = 6000;
const GWERN_TOOLBAR_INTRO_MS = 12000;
const SCROLL_MARGIN_PX = 120;
const POPUP_DELAY_MS = 3000;
const CONSENT_CLICK_TIMEOUT_MS = 2000;
const DECLINE_BUTTON = /^(reject all|reject|decline|decline all|deny|only necessary|necessary only)$/i;

type Size = "desktop" | "mobile";
type Capture = {
  file: string;
  url: string;
  size?: Size;
  waitMs?: number;
  scrollTo?: string;
  hover?: string;
};

const SIZES: Record<Size, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
};

const STRIPE_PRESS_HOME = { url: "https://press.stripe.com", waitMs: STRIPE_PRESS_WAIT_MS };
const GWERN_DESIGN = { url: "https://gwern.net/design", waitMs: GWERN_TOOLBAR_INTRO_MS };
const TUFTE_CSS = "https://edwardtufte.github.io/tufte-css/";

const CAPTURES: Capture[] = [
  { file: "a/linear-docs-desktop.png", url: "https://linear.app/docs/conceptual-model" },
  { file: "a/linear-docs-mobile.png", url: "https://linear.app/docs/conceptual-model", size: "mobile" },
  { file: "a/rust-book-desktop.png", url: "https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html" },
  {
    file: "a/claude-platform-docs-desktop.png",
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview",
  },
  { file: "b/practical-typography-desktop.png", url: "https://practicaltypography.com/line-length.html" },
  { file: "b/stripe-press-home-desktop.png", ...STRIPE_PRESS_HOME },
  {
    file: "b/stripe-press-book-desktop.png",
    url: "https://press.stripe.com/poor-charlies-almanack",
    waitMs: STRIPE_PRESS_WAIT_MS,
  },
  { file: "b/gwern-design-desktop.png", ...GWERN_DESIGN },
  {
    file: "b/gwern-design-footnote-popup-desktop.png",
    ...GWERN_DESIGN,
    scrollTo: "#markdownBody a.footnote-ref",
    hover: "#markdownBody a.footnote-ref",
  },
  { file: "b/tufte-css-desktop.png", url: TUFTE_CSS },
  { file: "b/tufte-css-sidenotes-desktop.png", url: TUFTE_CSS, scrollTo: ".sidenote" },
  { file: "b/tufte-css-figures-desktop.png", url: TUFTE_CSS, scrollTo: "#figures" },
  { file: "c/stripe-press-home-desktop.png", ...STRIPE_PRESS_HOME },
];

const browser = await chromium.launch({ args: SOFTWARE_WEBGL_ARGS });
try {
  for (const capture of CAPTURES) await captureOne(browser, capture);
} finally {
  await browser.close();
}

async function captureOne(browser: Browser, capture: Capture) {
  const file = `${OUT_DIR}/${capture.file}`;
  await mkdir(dirname(file), { recursive: true });
  const context = await browser.newContext({ ...SIZES[capture.size ?? "desktop"], colorScheme: "dark" });
  try {
    const page = await context.newPage();
    await page.goto(capture.url, { waitUntil: "networkidle" });
    await declineCookies(page);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(capture.waitMs ?? SETTLE_MS);
    if (capture.scrollTo) await scrollNearTop(page, capture.scrollTo);
    if (capture.hover) await hoverOver(page, capture.hover);
    await page.screenshot({ path: file });
    console.log(`Saved ${file}`);
  } catch (error) {
    console.log(`Failed ${file}: ${String(error).split("\n")[0]}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

async function scrollNearTop(page: Page, selector: string) {
  await page.locator(selector).first().evaluate(
    (element, margin) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - margin),
    SCROLL_MARGIN_PX,
  );
  await page.waitForTimeout(SETTLE_MS);
}

async function hoverOver(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box to hover`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await page.waitForTimeout(POPUP_DELAY_MS);
}

async function declineCookies(page: Page) {
  const button = page.getByRole("button", { name: DECLINE_BUTTON }).first();
  if (!(await button.isVisible())) return;
  await button.click({ timeout: CONSENT_CLICK_TIMEOUT_MS });
  console.log(`Declined cookies on ${page.url()}`);
}
