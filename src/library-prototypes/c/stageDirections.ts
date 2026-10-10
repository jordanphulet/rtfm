import { useSyncExternalStore } from "react";

export interface StageDirection {
  id: string;
  title: string;
  afterExchange: number;
}

let directions: StageDirection[] = [];
const listeners = new Set<() => void>();

export function recordDeletion(title: string, afterExchange: number) {
  const id = `direction-${directions.length + 1}`;
  directions = [...directions, { id, title, afterExchange }];
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getDirections() {
  return directions;
}

export function useStageDirections(): StageDirection[] {
  return useSyncExternalStore(subscribe, getDirections, getDirections);
}
