import path from "node:path";
import { ID_PATTERN } from "./manual.ts";

/** The admin's library, whose keys have no prefix and whose files are in the data folder itself. */
export const ADMIN_LIBRARY_ID = "admin";

/** Whether a recipient's library may take this id: a slug, and never the admin's. */
export function isRecipientLibraryId(libraryId: string): boolean {
  return ID_PATTERN.test(libraryId) && libraryId !== ADMIN_LIBRARY_ID;
}

/** A partition key of `rtfm-app` in the library: `L#<libraryId>#` before it, or nothing for the admin's. */
export function libraryPartition(libraryId: string, partition: string): string {
  return libraryId === ADMIN_LIBRARY_ID ? partition : `L#${checkedLibraryId(libraryId)}#${partition}`;
}

/** The library's folder in the data folder: `libraries/<libraryId>/`, or the data folder itself for the admin's. */
export function libraryFolder(dataDir: string, libraryId: string): string {
  return libraryId === ADMIN_LIBRARY_ID ? dataDir : path.join(dataDir, "libraries", checkedLibraryId(libraryId));
}

function checkedLibraryId(libraryId: string): string {
  if (!ID_PATTERN.test(libraryId)) throw new Error(`Not a valid library id: "${libraryId}"`);
  return libraryId;
}

/** The longest id a recipient's library may take. */
export const MOST_LIBRARY_ID_CHARACTERS = 63;

/**
 * The id, if a recipient's library may take it: a slug of at most 63 characters, never the
 * admin's. The error doesn't repeat it, so a secret passed by mistake never reaches a log.
 */
export function checkedRecipientLibraryId(libraryId: string): string {
  const fits = ID_PATTERN.test(libraryId) && libraryId.length <= MOST_LIBRARY_ID_CHARACTERS;
  if (!fits || libraryId === ADMIN_LIBRARY_ID) {
    throw new Error(`Not a recipient library's id: a slug of at most ${MOST_LIBRARY_ID_CHARACTERS} characters, not the admin's`);
  }
  return libraryId;
}
