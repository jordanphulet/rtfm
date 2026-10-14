import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { BrowserContextOptions, Locator, Page } from "playwright";
import { FAKE_REPLIES } from "../server/agent/fake-model.ts";
import { fakePlan } from "../server/agent/planner/fake-planner.ts";
import type { FailureReason, ManualSummary, SectionState } from "../server/api/types.ts";
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
const LINK_DIR = `${SHOTS_DIR}/link`;
/** A secret of the right form that no link has, so the server answers that the link is closed. */
const UNKNOWN_SECRET = "Qk3vX9_tLmN2pRs7Yw-AbC";
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

/** A written section's body with formulas, served in place of `SHOT_SECTIONS.written`'s for the `math` state. */
const MATH_BODY = String.raw`An ultrasonic sensor never measures distance. It measures time — the round trip of a chirp from the sensor to the guest and back — and the controller does the arithmetic. Sound crosses a hall at about $$v = 1{,}125\ \text{ft/s}$$, so the guest stands at

$$
d = \frac{v\,t}{2}
$$

where $$t$$ is the echo’s round trip. A $4 sensor and a $40 one share this formula; what the extra $36 buys is a cleaner echo.

## Warm halls read short

Sound speeds up as the hall warms, by about 1.1 ft/s for every degree Fahrenheit:

$$v(T) \approx 1{,}052 + 1.1\,(T - 32)\quad\text{ft/s, with } T \text{ in °F}$$

| Hall | Speed of sound | Error at 10 ft, uncorrected |
| --- | ---: | ---: |
| Cold cellar, 50 °F | 1,072 ft/s | 4.7 in |
| Parlor, 70 °F | 1,094 ft/s | 2.5 in |
| Attic in August, 95 °F | 1,121 ft/s | 0.4 in |

> $$t_{\text{scare}} = t_{\text{sense}} + t_{\text{decide}} + t_{\text{act}} \le 500\ \text{ms}$$
`;

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
  waitUntil?: "load" | "networkidle";
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

/** Both pages and a link's on a server with no passcode, then the passcode screen on a second server with one. */
async function captureWithServers(dataDir: string): Promise<boolean> {
  await clearShots();
  const pages = await captureOnServer({ dataDir: path.join(dataDir, "open"), passcode: undefined }, [
    ...captureGroups(READER_DIR, READER_SIZES, readerShots()),
    ...captureGroups(HOME_DIR, HOME_SIZES, homeShots()),
    ...captureGroups(LINK_DIR, HOME_SIZES, linkShots()),
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
  await mkdir(LINK_DIR, { recursive: true });
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
    { state: "math", path: sectionPath(SHOT_SECTIONS.written), fullPage: true, beforeLoad: serveMathBody },
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

function linkShots(): Shot[] {
  const linkPath = `/l#${UNKNOWN_SECRET}`;
  return [
    { state: "opening", path: linkPath, waitUntil: "load", beforeLoad: holdLinkRequests },
    {
      state: "failed",
      path: linkPath,
      beforeLoad: failLinkRequests,
      expectedErrors: [/Failed to load resource: the server responded with a status of 500/],
    },
    {
      state: "closed",
      path: linkPath,
      expectedErrors: [/Failed to load resource: the server responded with a status of 401/],
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

async function serveMathBody(page: Page) {
  const section: SectionState = { status: "written", body: MATH_BODY };
  await page.route(`**/api/manuals/${SHOT_MANUAL}/sections/${SHOT_SECTIONS.written}`, (route) =>
    route.fulfill({ json: section }),
  );
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

/** Never answers the link's request, so the page stays as it is while the server checks a link. */
async function holdLinkRequests(page: Page) {
  await page.route("**/api/link", () => {});
}

async function failLinkRequests(page: Page) {
  await page.route("**/api/link", (route) => route.fulfill({ status: 500, json: { error: "Internal error" } }));
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
