import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserContextOptions, Locator, Page } from "playwright";
import type { ViteDevServer } from "vite";
import { startServer } from "../server/app.ts";
import { config } from "../server/config.ts";
import type * as RepliesModule from "../src/agent/replies.ts";
import { captureAll, printSummary, settle, startViteServer, type CaptureGroup } from "./screenshots.ts";

const PORT = 5174;
const SHOTS_DIR = "shots";
const READER_DIR = `${SHOTS_DIR}/reader`;
const HOME_DIR = `${SHOTS_DIR}/home`;
const TYPED_MESSAGE = "Delete the manual about birthday parties";
const UNHANDLED_MESSAGE = "Sing me a sea shanty about geese";
const CLICK_TIMEOUT_MS = 3000;
const REPLY_TIMEOUT_MS = 10_000;

const SHOT_MANUAL = "the-haunt-that-listens";
const SHOT_SECTIONS = {
  written: "sensing-the-guest",
  dense: "the-half-second-problem",
  unwritten: "the-room-controller",
  appendix: "servos-steppers-and-pneumatics",
} as const;

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
  beforeLoad?: (page: Page) => Promise<void>;
  prepare?: (page: Page, size: Size) => Promise<void>;
  expectedErrors?: RegExp[];
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

const dataDir = await mkdtemp(path.join(tmpdir(), "rtfm-shots-"));
const apiServer = await startServer({ ...config, port: 0, dataDir, writer: "fake" });
try {
  const viteServer = await startViteServer(PORT, apiServer.port);
  try {
    process.exitCode = (await captureShots(viteServer)) ? 0 : 1;
  } finally {
    await viteServer.close();
  }
} finally {
  await apiServer.close();
  await rm(dataDir, { recursive: true, force: true });
}

async function captureShots(viteServer: ViteDevServer): Promise<boolean> {
  await clearShots();
  const replies = (await viteServer.ssrLoadModule("/src/agent/replies.ts")) as typeof RepliesModule;
  const fallbackReply = withoutEmphasis(replies.replyTo(UNHANDLED_MESSAGE));
  const results = await captureAll(`http://localhost:${PORT}`, [
    ...captureGroups(READER_DIR, READER_SIZES, readerShots()),
    ...captureGroups(HOME_DIR, HOME_SIZES, homeShots(fallbackReply)),
  ]);
  return printSummary(results);
}

async function clearShots() {
  await rm(SHOTS_DIR, { recursive: true, force: true });
  await mkdir(READER_DIR, { recursive: true });
  await mkdir(HOME_DIR, { recursive: true });
}

function readerShots(): Shot[] {
  const contentsPath = `/read/${SHOT_MANUAL}`;
  const sectionPath = (id: string) => `${contentsPath}/${id}`;
  const unwrittenPath = sectionPath(SHOT_SECTIONS.unwritten);
  return [
    { state: "start", path: contentsPath },
    { state: "toc", path: sectionPath(SHOT_SECTIONS.written), prepare: openTocIfCollapsed },
    { state: "written", path: sectionPath(SHOT_SECTIONS.written), fullPage: true },
    { state: "dense", path: sectionPath(SHOT_SECTIONS.dense), fullPage: true },
    { state: "waiting", path: `${unwrittenPath}?freeze=0` },
    { state: "streaming", path: `${unwrittenPath}?freeze=0.5` },
    { state: "streaming-full", path: `${unwrittenPath}?freeze=0.5`, fullPage: true },
    { state: "budget", path: `${unwrittenPath}?fail=budget` },
    { state: "error", path: `${unwrittenPath}?fail=error` },
    { state: "appendix", path: sectionPath(SHOT_SECTIONS.appendix), fullPage: true },
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
    {
      state: "library-unreachable",
      path: "/",
      beforeLoad: failLibraryRequests,
      expectedErrors: [/net::ERR_CONNECTION_REFUSED/, /TypeError: Failed to fetch/],
    },
    {
      state: "delete-failed",
      path: "/",
      beforeLoad: refuseDeletes,
      prepare: deleteFirstManual,
      expectedErrors: [/Failed to load resource: the server responded with a status of 409/],
    },
  ];
}

function captureGroups(dir: string, sizes: Size[], shots: Shot[]): CaptureGroup[] {
  return sizes.map((size) => ({
    options: size.options,
    captures: shots
      .filter((shot) => !size.onlyStates || size.onlyStates.includes(shot.state))
      .map(({ state, prepare, ...shot }) => ({
        ...shot,
        file: `${dir}/${state}-${size.name}.png`,
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

async function failLibraryRequests(page: Page) {
  await page.route("**/api/manuals", (route) => route.abort("connectionrefused"));
}

async function refuseDeletes(page: Page) {
  await page.route("**/api/manuals/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 409, json: { error: "A section of this manual is being written" } })
      : route.fallback(),
  );
}

async function deleteFirstManual(page: Page) {
  await clickHook(page, "delete");
  await clickHook(page, "confirm-delete");
}

async function clickHook(page: Page, hook: string): Promise<Locator> {
  const element = page.locator(`[data-shot=${hook}]`).filter({ visible: true }).first();
  await element.click({ timeout: CLICK_TIMEOUT_MS });
  await settle(page);
  return element;
}
