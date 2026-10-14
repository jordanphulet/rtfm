import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PASSCODE_PARTITION } from "../../infra/rtfm.ts";
import { passcodeDigest } from "../../server/api/passcode.ts";
import { PASSCODE_KEY, readPasscodeDigest, writePasscodeDigest } from "../../server/storage/dynamodb-manual-store.ts";
import { testAppTable } from "../../server/storage/dynamodb-testing.ts";
import { CLEAR_SCREEN_AND_SCROLLBACK, passcode } from "./passcode.ts";
import { PASSCODE_WORDS } from "./passcode-words.ts";
import { standInAws, type TerminalEvent } from "./testing.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TEST_TIMEOUT_MS = 30_000;
const SHOWN_PASSCODE =
  /^The new passcode, shown only this once:\n\n {4}([a-z]+(?: [a-z]+){3})\n\nKeep it, then press Enter to clear the screen\.\n$/;
const SET = { text: "The passcode is set. Every browser is asked for it within a minute.", json: { passcodeSet: true }, ok: true };

/** The words the stand-in terminal was shown, from the first thing written to it. */
function shownWords(events: TerminalEvent[]): string {
  const [first] = events;
  if (typeof first !== "object") throw new Error("Nothing was written to the terminal");
  return first.wrote.match(SHOWN_PASSCODE)![1];
}

describe("npm run ops -- passcode set", () => {
  it("shows four random words in the terminal alone, and stores only their digest, as rtfm-ops", { timeout: TEST_TIMEOUT_MS }, async () => {
    const appTable = await testAppTable();
    const { context, calls, terminalEvents } = standInAws([], { appTable, terminal: true });

    const result = await passcode("set", context);

    const words = shownWords(terminalEvents);
    expect(words.split(" ").every((word) => PASSCODE_WORDS.includes(word))).toBe(true);
    expect(result).toEqual(SET);
    expect(await readPasscodeDigest(appTable)).toBe(passcodeDigest(words));
    expect(calls().map((call) => call.profile)).toEqual(["rtfm-ops", "rtfm-ops"]);
    expect(calls().map((call) => call.callerKey)).toEqual([undefined, undefined]);
    expect(JSON.stringify(calls())).not.toContain(words);
  });

  it("waits for Enter, then clears the screen and its scrollback", { timeout: TEST_TIMEOUT_MS }, async () => {
    const { context, terminalEvents } = standInAws([], { appTable: await testAppTable(), terminal: true });

    await passcode("set", context);

    expect(terminalEvents).toEqual([
      { wrote: expect.stringMatching(SHOWN_PASSCODE) },
      "enter",
      { wrote: CLEAR_SCREEN_AND_SCROLLBACK },
    ]);
    expect(CLEAR_SCREEN_AND_SCROLLBACK).toBe("\x1b[2J\x1b[3J\x1b[H");
  });

  it("makes a new passcode each time, replacing the digest before", { timeout: TEST_TIMEOUT_MS }, async () => {
    const appTable = await testAppTable();
    const first = standInAws([], { appTable, terminal: true });
    const second = standInAws([], { appTable, terminal: true });

    await passcode("set", first.context);
    await passcode("set", second.context);

    expect(shownWords(second.terminalEvents)).not.toBe(shownWords(first.terminalEvents));
    expect(await readPasscodeDigest(appTable)).toBe(passcodeDigest(shownWords(second.terminalEvents)));
  });

  it("refuses to run without a terminal, before reaching AWS", { timeout: TEST_TIMEOUT_MS }, async () => {
    const appTable = await testAppTable();
    const { context, calls, terminalEvents } = standInAws([], { appTable });

    await expect(passcode("set", context)).rejects.toThrow(/^passcode set .* runs only in a terminal/);

    expect(calls()).toEqual([]);
    expect(terminalEvents).toEqual([]);
    expect(await readPasscodeDigest(appTable)).toBeUndefined();
  });

  it("exits 1 as a command whose standard input and output aren't a terminal, printing no passcode", () => {
    const { env, calls } = standInAws();
    const result = spawnSync("npm", ["run", "--silent", "ops", "--", "passcode", "set"], { cwd: REPO_ROOT, env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/runs only in a terminal/);
    expect(calls()).toEqual([]);
  });

  it("draws its words from a list of at least 1,024 different plain words", () => {
    expect(new Set(PASSCODE_WORDS).size).toBe(PASSCODE_WORDS.length);
    expect(PASSCODE_WORDS.length).toBeGreaterThanOrEqual(1024);
    for (const word of PASSCODE_WORDS) expect(word).toMatch(/^[a-z]{3,9}$/);
  });
});

describe("npm run ops -- passcode cookie", () => {
  it("prints the cookie that holds the stored digest, as rtfm-ops, and never the passcode", { timeout: TEST_TIMEOUT_MS }, async () => {
    const appTable = await testAppTable();
    const { context, calls, terminalEvents } = standInAws([], { appTable, terminal: true });
    await passcode("set", context);
    const words = shownWords(terminalEvents);

    const result = await passcode("cookie", context);

    const cookie = `rtfm_passcode=${passcodeDigest(words)}`;
    expect(result).toEqual({ text: cookie, json: { cookie }, ok: true });
    expect(JSON.stringify(result)).not.toContain(words);
    expect(calls().map((call) => call.profile)).toEqual(Array(4).fill("rtfm-ops"));
  });

  it("fails, saying who sets one, while no passcode is set", { timeout: TEST_TIMEOUT_MS }, async () => {
    const { context } = standInAws([], { appTable: await testAppTable() });
    await expect(passcode("cookie", context)).rejects.toThrow(/^No passcode is set.*npm run ops -- passcode set/);
  });

  it("reads the item in the one partition rtfm-ops may touch in rtfm-app", { timeout: TEST_TIMEOUT_MS }, async () => {
    expect(PASSCODE_KEY.pk).toBe(PASSCODE_PARTITION);
    const appTable = await testAppTable();
    await writePasscodeDigest(appTable, passcodeDigest("copper lantern tidal owl"));
    const { context } = standInAws([], { appTable });
    expect((await passcode("cookie", context)).text).toBe(`rtfm_passcode=${passcodeDigest("copper lantern tidal owl")}`);
  });
});
