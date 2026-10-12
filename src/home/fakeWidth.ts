import { act } from "react";
import { vi } from "vitest";

/**
 * For tests: stands in for `window.matchMedia` at a page width, and returns a function that
 * changes the width. `min-width` and `max-width` queries follow the width, any other query doesn't
 * match, and every change tells the listeners, both ways (happy-dom's own `matchMedia` reports
 * only queries that start matching).
 */
export function fakeWidth(initial: number): (width: number) => void {
  let width = initial;
  const listeners = new Set<() => void>();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        media: query,
        get matches() {
          return matchesWidth(query, width);
        },
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
  return (next) => {
    width = next;
    act(() => listeners.forEach((listener) => listener()));
  };
}

function matchesWidth(query: string, width: number): boolean {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (!min && !max) return false;
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
}
