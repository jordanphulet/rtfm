import type { Logger } from "../logging/logger.ts";
import type { LinkStore } from "../storage/library-links.ts";
import type { ManualStore, SectionLeases } from "../storage/types.ts";
import type { Activity } from "./route.ts";

/** How often an environment writes a library's last use at most. */
export const LAST_USE_EVERY_MS = 60_000;

/** The admin's library's activity: its use is the user's own, in the log alone. */
export const recordsNothing: Activity = { count() {}, used() {}, async opened() {} };

/**
 * Each recipient library's `Activity`, written to the link store: every write is logged as
 * `library.activity-failed` if it fails, and `settled` resolves once every write has.
 */
export function createActivities({ links, logger, now }: { links: LinkStore; logger: Logger; now: () => number }) {
  const writing = new Set<Promise<void>>();
  const lastUseWrittenAt = new Map<string, number>();

  function write(libraryId: string, what: string, change: () => Promise<void>): Promise<void> {
    const written = change().catch((error: unknown) =>
      logger.warn("library.activity-failed", `Couldn't record ${what} in ${libraryId}`, { libraryId, activity: what }, error),
    );
    writing.add(written);
    void written.finally(() => writing.delete(written));
    return written;
  }

  function activityOf(libraryId: string): Activity {
    return {
      count(counter) {
        void write(libraryId, counter, () => links.count(libraryId, counter));
      },
      used() {
        const usedAt = now();
        const writtenAt = lastUseWrittenAt.get(libraryId);
        if (writtenAt !== undefined && usedAt - writtenAt < LAST_USE_EVERY_MS) return;
        lastUseWrittenAt.set(libraryId, usedAt);
        void write(libraryId, "lastUsedAt", () => links.recordLastUse(libraryId, new Date(usedAt).toISOString()));
      },
      opened() {
        return write(libraryId, "opens", () => links.recordOpen(libraryId, new Date(now()).toISOString()));
      },
    };
  }

  async function settled() {
    while (writing.size > 0) await Promise.all(writing);
  }

  return { activityOf, settled };
}

/** The store, counting each manual it creates and each body it saves into the activity. */
export function countingStore(store: ManualStore, activity: Activity): ManualStore {
  return {
    ...store,
    async createManual(manual) {
      const outcome = await store.createManual(manual);
      if (outcome === "created") activity.count("manualsCreated");
      return outcome;
    },
    async saveBody(manualId, sectionId, body) {
      return countedSave(await store.saveBody(manualId, sectionId, body), activity);
    },
  };
}

/** The leases, counting each body a lease saves into the activity. */
export function countingLeases(leases: SectionLeases, activity: Activity): SectionLeases {
  return {
    ...leases,
    async take(manualId, sectionId) {
      const lease = await leases.take(manualId, sectionId);
      return lease && { ...lease, saveBody: async (body) => countedSave(await lease.saveBody(body), activity) };
    },
  };
}

function countedSave(outcome: "saved" | "already-written", activity: Activity) {
  if (outcome === "saved") activity.count("sectionsWritten");
  return outcome;
}
