import { useSyncExternalStore } from "react";

/** Why the server refused: no passcode entered, or the library's link is closed. */
export type PasscodeReason = "passcode-required" | "link-closed";

let reason: PasscodeReason | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function currentReason() {
  return reason;
}

/** The server answered 401: the passcode screen takes the page's place until it reloads. */
export function requirePasscode(why: PasscodeReason) {
  if (reason) return;
  reason = why;
  listeners.forEach((listener) => listener());
}

/** Why the passcode screen shows, or undefined while it doesn't. */
export function usePasscodeReason(): PasscodeReason | undefined {
  return useSyncExternalStore(subscribe, currentReason, currentReason);
}
