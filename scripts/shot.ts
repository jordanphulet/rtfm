import { mkdir, rm } from "node:fs/promises";
import type { BrowserContextOptions, Locator, Page } from "playwright";
import type * as RepliesModule from "../src/agent/replies.ts";
import type * as ManualModule from "../src/manual/sample/index.ts";
import { captureAll, printSummary, settle, startServer, type CaptureGroup } from "./screenshots.ts";

const PORT = 5174;
const SHOTS_DIR = "shots";
const READER_DIR = `${SHOTS_DIR}/reader`;
const HOME_DIR = `${SHOTS_DIR}/home`;
const TYPED_MESSAGE = "Delete the manual about birthday parties";
const UNHANDLED_MESSAGE = "Sing me a sea shanty about geese";
const CLICK_TIMEOUT_MS = 3000;
const REPLY_TIMEOUT_MS = 10_000;

const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 } };
const PHONE: BrowserContextOptions = {
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
};

type Shot = {
  state: string;
  path: string;
  fullPage?: boolean;
  prepare?: (page: Page, size: Size) => Promise<void>;
};

type Size = {
  name: string;
  options: BrowserContextOptions;
  onlyStates?: string[];
  tocCollapsed?: boolean;
};

const READER_SIZES: Size[] = [
  { name: "desktop", options: DESKTOP },
  { name: "mobile", options: PHONE, tocCollapsed: true },
  {
    name: "desktop-reduced",
    options: { ...DESKTOP, reducedMotion: "reduce" },
    onlyStates: ["start", "streaming"],
  },
];

const HOME_SIZES: Size[] = [
  { name: "desktop", options: DESKTOP },
  { name: "phone", options: PHONE },
];

const server = await startServer(PORT);

try {
  await clearShots();
  const manual = (await server.ssrLoadModule("/src/manual/sample/index.ts")) as typeof ManualModule;
  const replies = (await server.ssrLoadModule("/src/agent/replies.ts")) as typeof RepliesModule;
  const fallbackReply = withoutEmphasis(replies.replyTo(UNHANDLED_MESSAGE));
  const results = await captureAll(`http://localhost:${PORT}`, [
    ...captureGroups(READER_DIR, READER_SIZES, readerShots(manual.SHOT_SECTIONS)),
    ...captureGroups(HOME_DIR, HOME_SIZES, homeShots(fallbackReply)),
  ]);
  process.exitCode = printSummary(results) ? 0 : 1;
} finally {
  await server.close();
}

async function clearShots() {
  await rm(SHOTS_DIR, { recursive: true, force: true });
  await mkdir(READER_DIR, { recursive: true });
  await mkdir(HOME_DIR, { recursive: true });
}

function readerShots(sections: typeof ManualModule.SHOT_SECTIONS): Shot[] {
  const sectionPath = (id: string) => `/read/${id}`;
  return [
    { state: "start", path: "/read" },
    { state: "toc", path: sectionPath(sections.written), prepare: openTocIfCollapsed },
    { state: "written", path: sectionPath(sections.written), fullPage: true },
    { state: "dense", path: sectionPath(sections.dense), fullPage: true },
    { state: "waiting", path: `${sectionPath(sections.unwritten)}?freeze=0` },
    { state: "streaming", path: `${sectionPath(sections.unwritten)}?freeze=0.5` },
    {
      state: "streaming-full",
      path: `${sectionPath(sections.unwritten)}?freeze=0.5`,
      fullPage: true,
    },
    { state: "appendix", path: sectionPath(sections.appendix), fullPage: true },
  ];
}

function homeShots(fallbackReply: string): Shot[] {
  return [
    { state: "first-visit", path: "/" },
    { state: "typing", path: "/", prepare: typeMessage },
    { state: "thinking", path: "/?agentFreeze=thinking" },
    { state: "streaming", path: "/?agentFreeze=0.5" },
    { state: "conversation", path: "/?conversation=demo", fullPage: true },
    { state: "delete-confirm", path: "/", prepare: openDeleteConfirmation },
    { state: "fallback", path: "/", prepare: (page) => sendUnhandledMessage(page, fallbackReply) },
    { state: "empty", path: "/?library=empty" },
  ];
}

function captureGroups(dir: string, sizes: Size[], shots: Shot[]): CaptureGroup[] {
  return sizes.map((size) => ({
    options: size.options,
    captures: shots
      .filter((shot) => !size.onlyStates || size.onlyStates.includes(shot.state))
      .map(({ state, path, fullPage, prepare }) => ({
        path,
        file: `${dir}/${state}-${size.name}.png`,
        fullPage,
        prepare: prepare && ((page) => prepare(page, size)),
      })),
  }));
}

function withoutEmphasis(markdown: string): string {
  return markdown.replaceAll(/[*_`]/g, "");
}

async function openTocIfCollapsed(page: Page, size: Size) {
  if (size.tocCollapsed) await clickHook(page, "toc-toggle");
}

async function typeMessage(page: Page) {
  const input = await clickHook(page, "agent-input");
  await input.pressSequentially(TYPED_MESSAGE);
  await settle(page);
}

async function sendUnhandledMessage(page: Page, reply: string) {
  const input = await clickHook(page, "agent-input");
  await input.pressSequentially(UNHANDLED_MESSAGE);
  await input.press("Enter");
  await page.getByText(reply).first().waitFor({ timeout: REPLY_TIMEOUT_MS });
  await settle(page);
}

async function openDeleteConfirmation(page: Page) {
  await clickHook(page, "delete");
}

async function clickHook(page: Page, hook: string): Promise<Locator> {
  const element = page.locator(`[data-shot=${hook}]`).filter({ visible: true }).first();
  await element.click({ timeout: CLICK_TIMEOUT_MS });
  await settle(page);
  return element;
}
