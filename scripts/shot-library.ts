import type { Locator, Page } from "playwright";
import type * as RepliesModule from "../src/agent/replies.ts";
import { libraryVariantFromArgs, type LibraryVariant } from "./library-variant.ts";
import {
  captureAll,
  DESKTOP,
  emptyDir,
  PHONE,
  printSummary,
  settle,
  startServer,
  type Capture,
  type Size,
} from "./screenshots.ts";

const PORTS: Record<LibraryVariant, number> = { a: 5175, b: 5176, c: 5177 };
const HIDE_SWITCHER = "[data-shot=prototype-switcher] { display: none !important; }";
const TYPED_MESSAGE = "Delete the manual about birthday parties";
const UNHANDLED_MESSAGE = "Sing me a sea shanty about geese";
const CLICK_TIMEOUT_MS = 3000;
const REPLY_TIMEOUT_MS = 10_000;

type Shot = {
  state: string;
  query?: string;
  fullPage?: boolean;
  prepare?: (page: Page) => Promise<void>;
};

const SIZES: Size[] = [
  { name: "desktop", options: DESKTOP },
  { name: "phone", options: PHONE },
];

const variant = libraryVariantFromArgs("shot:library");
const port = PORTS[variant];
const outDir = `shots/library/${variant}`;
const server = await startServer(port, `node_modules/.vite-shot/library-${variant}`);

try {
  await emptyDir(outDir);
  const replies = (await server.ssrLoadModule("/src/agent/replies.ts")) as typeof RepliesModule;
  const shots = shotsWith(withoutEmphasis(replies.replyTo(UNHANDLED_MESSAGE)));
  const results = await captureAll(`http://localhost:${port}`, SIZES, (size) =>
    shots.map((shot): Capture => ({
      path: `/library/${variant}${shot.query ?? ""}`,
      file: `${outDir}/${shot.state}-${size.name}.png`,
      fullPage: shot.fullPage,
      style: HIDE_SWITCHER,
      prepare: shot.prepare,
    })),
  );
  process.exitCode = printSummary(results) ? 0 : 1;
} finally {
  await server.close();
}

function shotsWith(fallbackReply: string): Shot[] {
  return [
    { state: "first-visit" },
    { state: "typing", prepare: typeMessage },
    { state: "thinking", query: "?agentFreeze=thinking" },
    { state: "streaming", query: "?agentFreeze=0.5" },
    { state: "conversation", query: "?conversation=demo", fullPage: true },
    { state: "delete-confirm", prepare: openDeleteConfirmation },
    { state: "fallback", prepare: (page) => sendUnhandledMessage(page, fallbackReply) },
    { state: "empty", query: "?library=empty" },
  ];
}

function withoutEmphasis(markdown: string): string {
  return markdown.replaceAll(/[*_`]/g, "");
}

async function typeMessage(page: Page) {
  const input = await findHook(page, "agent-input");
  await input.click({ timeout: CLICK_TIMEOUT_MS });
  await input.pressSequentially(TYPED_MESSAGE);
  await settle(page);
}

async function sendUnhandledMessage(page: Page, reply: string) {
  const input = await findHook(page, "agent-input");
  await input.click({ timeout: CLICK_TIMEOUT_MS });
  await input.pressSequentially(UNHANDLED_MESSAGE);
  await input.press("Enter");
  await page.getByText(reply).first().waitFor({ timeout: REPLY_TIMEOUT_MS });
  await settle(page);
}

async function openDeleteConfirmation(page: Page) {
  const deleteControl = await findHook(page, "delete");
  await deleteControl.click({ timeout: CLICK_TIMEOUT_MS });
  await settle(page);
}

async function findHook(page: Page, hook: string): Promise<Locator> {
  const element = firstVisible(page, hook);
  if ((await element.count()) > 0) return element;

  const opener = firstVisible(page, `${hook}-opener`);
  if ((await opener.count()) === 0) {
    throw new Error(`no visible [data-shot=${hook}] or [data-shot=${hook}-opener]`);
  }
  await opener.click({ timeout: CLICK_TIMEOUT_MS });
  await settle(page);
  if ((await element.count()) > 0) return element;
  throw new Error(`no visible [data-shot=${hook}] after clicking [data-shot=${hook}-opener]`);
}

function firstVisible(page: Page, hook: string): Locator {
  return page.locator(`[data-shot=${hook}]`).filter({ visible: true }).first();
}
