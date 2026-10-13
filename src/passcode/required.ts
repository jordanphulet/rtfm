import { useSyncExternalStore } from "react";

let required = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isRequired() {
  return required;
}

/** The server answered 401: the passcode screen takes the page's place until it reloads. */
export function requirePasscode() {
  if (required) return;
  required = true;
  listeners.forEach((listener) => listener());
}

export function usePasscodeRequired(): boolean {
  return useSyncExternalStore(subscribe, isRequired, isRequired);
}
