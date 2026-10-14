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
