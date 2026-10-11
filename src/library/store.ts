import { use, useEffect, useSyncExternalStore } from "react";
import { fetchLibrary } from "./api";
import type { ManualSummary } from "./types";

let manuals: ManualSummary[] = [];
let firstLoad: Promise<void> | undefined;
let removalCount = 0;
let mounts = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getManuals() {
  return manuals;
}

function setManuals(next: ManualSummary[]) {
  manuals = next;
  listeners.forEach((listener) => listener());
}

function loadOnce(): Promise<void> {
  firstLoad ??= fetchLibrary().then(setManuals);
  return firstLoad;
}

export async function refreshLibrary() {
  const removalsBefore = removalCount;
  const fresh = await fetchLibrary().catch(() => undefined);
  if (fresh && removalCount === removalsBefore) setManuals(fresh);
}

function refreshOnReturn() {
  mounts += 1;
  if (mounts > 1) void refreshLibrary();
}

export function useLibrary(): ManualSummary[] {
  use(loadOnce());
  useEffect(refreshOnReturn, []);
  return useSyncExternalStore(subscribe, getManuals, getManuals);
}

export function removeFromLibrary(id: string) {
  if (!manuals.some((manual) => manual.id === id)) return;
  removalCount += 1;
  setManuals(manuals.filter((manual) => manual.id !== id));
}
