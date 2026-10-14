import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createExclusively, namesInFolder, readIfExists, writeAtomically } from "./files.ts";
import {
  checkedDigest,
  isSameLink,
  LINK_DIGEST_PATTERN,
  noActivity,
  type LibraryActivity,
  type LibraryLink,
  type LinkStore,
} from "./library-links.ts";
import { checkedRecipientLibraryId } from "./library.ts";
import { ID_PATTERN } from "./manual.ts";

const JSON_EXTENSION = ".json";

/**
 * Links in `links/<digest>.json` and activity in `activity/<libraryId>.json`. One server uses a
 * data folder (its lock), so each file's changes are made one at a time in this process.
 */
export function createFileLinkStore(dataDir: string): LinkStore {
  const linksDir = path.join(dataDir, "links");
  const activityDir = path.join(dataDir, "activity");
  const linkFile = (digest: string) => path.join(linksDir, `${checkedDigest(digest)}${JSON_EXTENSION}`);
  const activityFile = (libraryId: string) =>
    path.join(activityDir, `${checkedRecipientLibraryId(libraryId)}${JSON_EXTENSION}`);
  const oneAtATime = oneAtATimePerKey();

  async function findLink(digest: string): Promise<LibraryLink | undefined> {
    const json = await readIfExists(linkFile(digest));
    return json === undefined ? undefined : { digest, ...(JSON.parse(json) as Omit<LibraryLink, "digest">) };
  }

  async function listLinks(): Promise<LibraryLink[]> {
    const digests = storedNames(await namesInFolder(linksDir), LINK_DIGEST_PATTERN);
    const links = await Promise.all(digests.map(findLink));
    return links.filter((link) => link !== undefined);
  }

  async function getActivity(libraryId: string): Promise<LibraryActivity> {
    const json = await readIfExists(activityFile(libraryId));
    return { ...noActivity(libraryId), ...(json === undefined ? {} : JSON.parse(json)) };
  }

  function updateActivity(libraryId: string, change: (activity: LibraryActivity) => LibraryActivity) {
    const file = activityFile(libraryId);
    return oneAtATime(file, async () => {
      const { libraryId: _, ...stored } = change(await getActivity(libraryId));
      await mkdir(activityDir, { recursive: true });
      await writeAtomically(file, JSON.stringify(stored, null, 2));
    });
  }

  return {
    async createLink(link) {
      const { digest, ...stored } = link;
      const file = linkFile(digest);
      checkedRecipientLibraryId(link.libraryId);
      await mkdir(linksDir, { recursive: true });
      if (await createExclusively(file, JSON.stringify(stored, null, 2))) return "created";
      return isSameLink(await findLink(digest), link) ? "created" : "exists";
    },

    findLink,

    listLinks,

    async revokeLink(libraryId, revokedAt) {
      checkedRecipientLibraryId(libraryId);
      return oneAtATime(linksDir, async () => {
        const links = (await listLinks()).filter((link) => link.libraryId === libraryId);
        const open = links.filter((link) => link.revokedAt === undefined);
        if (links.length === 0) return "no-link";
        if (open.length === 0) return "already-revoked";
        for (const { digest, ...stored } of open) {
          await writeAtomically(linkFile(digest), JSON.stringify({ ...stored, revokedAt }, null, 2));
        }
        return "revoked";
      });
    },

    async recordOpen(libraryId, at) {
      return updateActivity(libraryId, (activity) => ({
        ...activity,
        firstUsedAt: activity.firstUsedAt ?? at,
        opens: activity.opens + 1,
      }));
    },

    async recordLastUse(libraryId, at) {
      return updateActivity(libraryId, (activity) => ({
        ...activity,
        lastUsedAt: activity.lastUsedAt !== undefined && activity.lastUsedAt >= at ? activity.lastUsedAt : at,
      }));
    },

    async count(libraryId, counter) {
      return updateActivity(libraryId, (activity) => ({ ...activity, [counter]: activity[counter] + 1 }));
    },

    getActivity,

    async listActivity() {
      const libraryIds = storedNames(await namesInFolder(activityDir), ID_PATTERN);
      return Promise.all(libraryIds.map(getActivity));
    },
  };
}

/** The names of the folder's `<name>.json` files whose name fits the pattern, leaving out temp files. */
function storedNames(fileNames: string[], pattern: RegExp): string[] {
  return fileNames
    .filter((fileName) => fileName.endsWith(JSON_EXTENSION))
    .map((fileName) => fileName.slice(0, -JSON_EXTENSION.length))
    .filter((name) => pattern.test(name));
}

/** Runs each task given for a key once the one before it has settled, so they never interleave. */
function oneAtATimePerKey() {
  const latest = new Map<string, Promise<unknown>>();
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const run = (latest.get(key) ?? Promise.resolve()).then(task);
    const settled = run.catch(() => {});
    latest.set(key, settled);
    void settled.then(() => {
      if (latest.get(key) === settled) latest.delete(key);
    });
    return run;
  };
}
