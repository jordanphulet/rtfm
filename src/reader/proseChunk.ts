import { use } from "react";

type ProseModule = typeof import("./Prose");

let request: Promise<ProseModule> | undefined;

/**
 * Starts loading `Prose`, which brings KaTeX, in a chunk of its own, so the start page never waits
 * for it. A failed load is forgotten, so the next section page asks again.
 */
export function loadProse(): Promise<ProseModule> {
  request ??= import("./Prose").catch((error: unknown) => {
    request = undefined;
    throw error;
  });
  return request;
}

/** Starts loading `Prose` early. A failure is left for the section page that needs it to report. */
export function preloadProse() {
  loadProse().catch(() => undefined);
}

/** `Prose`, suspending while its chunk is still on its way. */
export function useProse(): ProseModule["Prose"] {
  return use(loadProse()).Prose;
}
