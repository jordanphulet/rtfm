import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { BrowserContextOptions, Locator, Page } from "playwright";
import { FAKE_REPLIES } from "../server/agent/fake-model.ts";
import { fakePlan } from "../server/agent/planner/fake-planner.ts";
import type { FailureReason, ManualSummary } from "../server/api/types.ts";
import { sectionsInReadingOrder } from "../server/storage/manual.ts";
import { startServer } from "../server/app.ts";
import { config, fixedPasscode, type ServerConfig } from "../server/config.ts";
import { baselineProblem, compareShots } from "./compare.ts";
import { captureAll, printSummary, settle, type CaptureGroup } from "./screenshots.ts";
import { localUrl, startViteServer } from "./vite-server.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { compare: { type: "string" } } });
const SHOTS_DIR = positionals[0] ?? "shots";
const BASELINE_DIR = values.compare;
const READER_DIR = `${SHOTS_DIR}/reader`;
const HOME_DIR = `${SHOTS_DIR}/home`;
const PASSCODE_DIR = `${SHOTS_DIR}/passcode`;
const SHOT_PASSCODE = "copper lantern tidal owl";
const WRONG_PASSCODE = "copper lantern";
const TYPED_MESSAGE = "Delete the manual about birthday parties";
const UNHANDLED_MESSAGE = "Sing me a sea shanty about geese";
const LIST_MESSAGE = "What do I have?";
const NEW_MANUAL_MESSAGE = "Let’s start a new manual about building a treehouse";
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
  { name: "phone", options: PHONE, tocCollapsed: true },
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

const baselineError = BASELINE_DIR && (await baselineProblem(BASELINE_DIR, SHOTS_DIR));
if (baselineError) {
  console.error(baselineError);
  process.exit(1);
}

let dataDir: string | undefined;
try {
  dataDir = await mkdtemp(path.join(tmpdir(), "rtfm-shots-"));
  const captured = await captureWithServers(dataDir);
  const matched = !BASELINE_DIR || (await compareShots(SHOTS_DIR, BASELINE_DIR));
  process.exitCode = captured && matched ? 0 : 1;
} finally {
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

/** Both pages on a server with no passcode, then the passcode screen on a second server with one. */
async function captureWithServers(dataDir: string): Promise<boolean> {
  await clearShots();
  const pages = await captureOnServer({ dataDir: path.join(dataDir, "open"), passcode: undefined }, [
    ...captureGroups(READER_DIR, READER_SIZES, readerShots()),
    ...captureGroups(HOME_DIR, HOME_SIZES, homeShots()),
  ]);
  const passcode = await captureOnServer(
    { dataDir: path.join(dataDir, "gated"), passcode: fixedPasscode(SHOT_PASSCODE) },
    captureGroups(PASSCODE_DIR, HOME_SIZES, passcodeShots()),
  );
  return printSummary([...pages, ...passcode]);
}

/** Captures through a Vite server of its own, in front of an API server with the fake models and these settings. */
async function captureOnServer(settings: Pick<ServerConfig, "dataDir" | "passcode">, groups: CaptureGroup[]) {
  const apiServer = await startServer({ ...config, ...settings, port: 0, models: "fake" });
  try {
    const viteServer = await startViteServer(apiServer.port);
    try {
      return await captureAll(localUrl(viteServer), groups);
    } finally {
      await viteServer.close();
    }
  } finally {
    await apiServer.close();
  }
}

async function clearShots() {
  await rm(SHOTS_DIR, { recursive: true, force: true });
  await mkdir(READER_DIR, { recursive: true });
  await mkdir(HOME_DIR, { recursive: true });
  await mkdir(PASSCODE_DIR, { recursive: true });
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

function homeShots(): Shot[] {
  return [
    { state: "first-visit", path: "/" },
    { state: "typing", path: "/", prepare: typeMessage },
    { state: "thinking", path: "/?librarianFreeze=thinking" },
    { state: "working", path: "/?librarianFreeze=0" },
    { state: "streaming", path: "/?librarianFreeze=0.5" },
    { state: "created", path: "/?librarianFreeze=1", beforeLoad: createPlannedManual },
    { state: "conversation", path: "/?conversation=demo", fullPage: true },
    { state: "delete-confirm", path: "/", prepare: openDeleteConfirmation },
    { state: "fallback", path: "/", prepare: sendUnhandledMessage },
    { state: "proposed-delete", path: "/", prepare: askToDelete },
    { state: "reply-budget", path: "/", beforeLoad: (page) => failReplies(page, "budget"), prepare: sendListMessage },
    { state: "reply-failed", path: "/", beforeLoad: (page) => failReplies(page, "error"), prepare: sendListMessage },
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

function passcodeShots(): Shot[] {
  const refusals = [/Failed to load resource: the server responded with a status of 401/];
  return [
    { state: "start", path: "/", expectedErrors: refusals },
    { state: "wrong", path: "/", prepare: enterWrongPasscode, expectedErrors: refusals },
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
  const input = await clickHook(page, "librarian-input");
  await input.pressSequentially(TYPED_MESSAGE);
  await settle(page);
}

async function sendUnhandledMessage(page: Page) {
  await sendMessage(page, UNHANDLED_MESSAGE);
  await page.getByText(withoutEmphasis(FAKE_REPLIES.fallback)).first().waitFor({ timeout: REPLY_TIMEOUT_MS });
  await settle(page);
}

async function askToDelete(page: Page) {
  await sendMessage(page, TYPED_MESSAGE);
  await page.getByRole("alertdialog").waitFor({ timeout: REPLY_TIMEOUT_MS });
  await settle(page);
}

async function sendListMessage(page: Page) {
  await sendMessage(page, LIST_MESSAGE);
  await page.locator(".reply-failure").first().waitFor({ timeout: REPLY_TIMEOUT_MS });
  await settle(page);
}

async function sendMessage(page: Page, message: string) {
  const input = await clickHook(page, "librarian-input");
  await input.pressSequentially(message);
  await input.press("Enter");
}

async function failReplies(page: Page, reason: FailureReason) {
  await page.route("**/api/librarian", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `event: failed\ndata: ${JSON.stringify({ reason })}\n\n`,
    }),
  );
}

/**
 * Plays the fake model's treehouse reply as the server does when it saves the manual: the reply
 * comes from the preview, which saves nothing, so every other shot keeps the seed library, and
 * this page alone is told the manual was created and then lists it.
 */
async function createPlannedManual(page: Page) {
  const plan = fakePlan(NEW_MANUAL_MESSAGE);
  const planned: ManualSummary = {
    id: plan.id,
    title: plan.title,
    subtitle: plan.subtitle,
    chapterCount: plan.chapters.length + plan.appendices.length,
    sectionCount: sectionsInReadingOrder(plan).length,
    writtenCount: 0,
  };
  let created = false;
  await page.route("**/api/manuals", async (route) => {
    const response = await route.fetch();
    const manuals = (await response.json()) as ManualSummary[];
    const listed = created ? [...manuals, planned].sort((a, b) => a.title.localeCompare(b.title, "en")) : manuals;
    await route.fulfill({ response, json: listed });
  });
  await page.route(
    (url) => url.pathname === "/api/librarian",
    async (route) => {
      const response = await route.fetch();
      const action = `event: action\ndata: ${JSON.stringify({ type: "created", manualId: plan.id })}\n\n`;
      created = true;
      await route.fulfill({ response, body: (await response.text()).replace("event: done", `${action}event: done`) });
    },
  );
}

async function enterWrongPasscode(page: Page) {
  const input = await clickHook(page, "passcode-input");
  await input.pressSequentially(WRONG_PASSCODE);
  await input.press("Enter");
  await page.getByText("Wrong passcode.").waitFor({ timeout: REPLY_TIMEOUT_MS });
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
