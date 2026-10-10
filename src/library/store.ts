import { useSyncExternalStore } from "react";
import { seedManuals } from "./seed";
import type { LibraryManual } from "./types";

let manuals = startingManuals();
const listeners = new Set<() => void>();

function startingManuals(): LibraryManual[] {
  const startsEmpty = new URLSearchParams(window.location.search).get("library") === "empty";
  if (startsEmpty) return [];
  return [...seedManuals].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getManuals() {
  return manuals;
}

export function useLibrary(): LibraryManual[] {
  return useSyncExternalStore(subscribe, getManuals, getManuals);
}

export function deleteManual(id: string) {
  if (!manuals.some((manual) => manual.id === id)) return;
  manuals = manuals.filter((manual) => manual.id !== id);
  listeners.forEach((listener) => listener());
}
