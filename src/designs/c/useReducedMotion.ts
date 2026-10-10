import { useSyncExternalStore } from "react";
import { media } from "./tokens";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(media.reducedMotion);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function prefersReducedMotion() {
  return window.matchMedia(media.reducedMotion).matches;
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, prefersReducedMotion);
}
