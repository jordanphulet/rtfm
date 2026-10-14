import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "../logging/logger.ts";
import { createExclusively, isErrorCode, namesInFolder, readIfExists, writeAtomically } from "./files.ts";
import { ADMIN_LIBRARY_ID, libraryFolder } from "./library.ts";
import { ID_PATTERN, isSameManual } from "./manual.ts";
import type { ManualStore, StoredManual } from "./types.ts";

const SECTION_FILE_EXTENSION = ".md";

export function createFileManualStore(dataDir: string, logger: Logger, libraryId = ADMIN_LIBRARY_ID): ManualStore {
  const libraryDir = libraryFolder(dataDir, libraryId);
  const manualsDir = path.join(libraryDir, "manuals");
  const seededFile = path.join(libraryDir, "seeded.json");
  const manualDir = (manualId: string) => path.join(manualsDir, checkedId(manualId));
  const manualFile = (manualId: string) => path.join(manualDir(manualId), "manual.json");
  const sectionsDir = (manualId: string) => path.join(manualDir(manualId), "sections");
  const sectionFile = (manualId: string, sectionId: string) =>
    path.join(sectionsDir(manualId), `${checkedId(sectionId)}${SECTION_FILE_EXTENSION}`);

  async function getManual(manualId: string): Promise<StoredManual | undefined> {
    if (!ID_PATTERN.test(manualId)) return undefined;
    const json = await readIfExists(manualFile(manualId));
    return json === undefined ? undefined : (JSON.parse(json) as StoredManual);
  }

  async function seededManualIds(): Promise<string[]> {
    const json = await readIfExists(seededFile);
    return json === undefined ? [] : (JSON.parse(json) as string[]);
  }

  return {
    async listManuals() {
      const manuals = await Promise.all((await namesInFolder(manualsDir)).map(getManual));
      return manuals.filter((manual) => manual !== undefined);
    },

    getManual,

    async createManual(manual) {
      await mkdir(manualsDir, { recursive: true });
      try {
        await mkdir(manualDir(manual.id));
      } catch (error) {
        if (!isErrorCode(error, "EEXIST")) throw error;
        return isSameManual(await getManual(manual.id), manual) ? "created" : "exists";
      }
      try {
        await writeAtomically(manualFile(manual.id), JSON.stringify(manual, null, 2));
      } catch (error) {
        await rm(manualDir(manual.id), { recursive: true, force: true });
        throw error;
      }
      return "created";
    },

    async deleteManual(manualId) {
      const deleting = `${manualDir(manualId)}.${randomUUID()}.deleting`;
      try {
        await rename(manualDir(manualId), deleting);
      } catch (error) {
        if (isErrorCode(error, "ENOENT")) return "deleted";
        throw error;
      }
      await rm(deleting, { recursive: true, force: true }).catch((error: unknown) => {
        const fields = { libraryId, manualId, folder: deleting };
        logger.error("manual.cleanup-failed", "The manual is deleted, but removing its folder failed", fields, error);
      });
      return "deleted";
    },

    async getBody(manualId, sectionId) {
      return readIfExists(sectionFile(manualId, sectionId));
    },

    async saveBody(manualId, sectionId, body) {
      const target = sectionFile(manualId, sectionId);
      await makeSectionsDir(sectionsDir(manualId), manualId);
      return (await createExclusively(target, body)) ? "saved" : "already-written";
    },

    async writtenSectionIds(manualId) {
      const names = await namesInFolder(sectionsDir(manualId));
      return names
        .filter((name) => name.endsWith(SECTION_FILE_EXTENSION))
        .map((name) => name.slice(0, -SECTION_FILE_EXTENSION.length));
    },

    seededManualIds,

    async markSeeded(manualId) {
      const seeded = new Set(await seededManualIds()).add(manualId);
      await mkdir(libraryDir, { recursive: true });
      await writeAtomically(seededFile, JSON.stringify([...seeded], null, 2));
    },
  };
}

async function makeSectionsDir(dir: string, manualId: string) {
  try {
    await mkdir(dir);
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) return;
    if (isErrorCode(error, "ENOENT")) throw new Error(`There is no manual "${manualId}" to save a section into`);
    throw error;
  }
}

function checkedId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Not a valid id: "${id}"`);
  return id;
}
