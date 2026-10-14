import type { ManualStore, SectionLeases } from "./types.ts";

/**
 * Leases for a server that is the only one on its store, as on this machine (one server per data
 * folder): every take is granted, since the runs' own map already keeps one writer per section
 * within the process.
 */
export function createInProcessLeases(store: ManualStore): SectionLeases {
  const neverLost = new AbortController().signal;
  return {
    async take(manualId, sectionId) {
      return {
        lost: neverLost,
        saveBody: (body) => store.saveBody(manualId, sectionId, body),
        async release() {},
      };
    },
  };
}
