import { randomInt } from "node:crypto";
import { OPS_ROLE } from "../../infra/rtfm.ts";
import { PASSCODE_COOKIE, passcodeDigest } from "../../server/api/passcode.ts";
import { readPasscodeDigest, writePasscodeDigest } from "../../server/storage/dynamodb-manual-store.ts";
import { appTableAs, asRole, type CommandResult, type OpsContext } from "./context.ts";
import { PASSCODE_WORDS } from "./passcode-words.ts";

export const PASSCODE_ACTIONS = ["set", "cookie"] as const;
export type PasscodeAction = (typeof PASSCODE_ACTIONS)[number];

const WORDS_IN_A_PASSCODE = 4;
/** Erases the screen (`2J`) and the scrollback (`3J`), and moves the cursor home (`H`). */
export const CLEAR_SCREEN_AND_SCROLLBACK = "\x1b[2J\x1b[3J\x1b[H";

export function passcode(action: PasscodeAction, context: OpsContext): Promise<CommandResult> {
  return action === "set" ? setPasscode(context) : passcodeCookie(context);
}

/**
 * A new passcode of four random words; only its digest is stored, as `rtfm-ops`. The words are
 * written to the terminal alone, never to standard output as a result, and once the person presses
 * Enter the screen and its scrollback are cleared. Without a terminal it refuses before reaching AWS.
 */
async function setPasscode(context: OpsContext): Promise<CommandResult> {
  const terminal = context.terminal();
  if (!terminal) {
    throw new Error("passcode set shows the new passcode once, so it runs only in a terminal: run it there yourself.");
  }
  const words = randomPasscode();
  await asRole(context, OPS_ROLE, async (session) => {
    await writePasscodeDigest(await appTableAs(context, session), passcodeDigest(words));
  });
  terminal.write(`The new passcode, shown only this once:\n\n    ${words}\n\nKeep it, then press Enter to clear the screen.\n`);
  await terminal.waitForEnter();
  terminal.write(CLEAR_SCREEN_AND_SCROLLBACK);
  return { text: "The passcode is set. Every browser is asked for it within a minute.", json: { passcodeSet: true }, ok: true };
}

function randomPasscode(): string {
  return Array.from({ length: WORDS_IN_A_PASSCODE }, () => PASSCODE_WORDS[randomInt(PASSCODE_WORDS.length)]).join(" ");
}

/** The passcode cookie, `rtfm_passcode=<digest>`, read as `rtfm-ops`: it opens the app, and never shows the passcode. */
async function passcodeCookie(context: OpsContext): Promise<CommandResult> {
  const digest = await asRole(context, OPS_ROLE, async (session) =>
    readPasscodeDigest(await appTableAs(context, session)),
  );
  if (digest === undefined) {
    throw new Error(
      "No passcode is set, so the app refuses every API request. The user sets one with npm run ops -- passcode set.",
    );
  }
  const cookie = `${PASSCODE_COOKIE}=${digest}`;
  return { text: cookie, json: { cookie }, ok: true };
}
