import { randomUUID } from "node:crypto";
import { link, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isErrorCode, namesInFolder, readIfExists } from "./files.ts";
import type { ManualStore, StoredManual } from "./types.ts";

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SECTION_FILE_EXTENSION = ".md";

export function createFileManualStore(dataDir: string): ManualStore {
  const manualsDir = path.join(dataDir, "manuals");
  const seededFile = path.join(dataDir, "seeded.json");
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

    async putManual(manual) {
      await mkdir(manualDir(manual.id), { recursive: true });
      await writeAtomically(manualFile(manual.id), JSON.stringify(manual, null, 2));
    },

    async deleteManual(manualId) {
      const deleting = `${manualDir(manualId)}.${randomUUID()}.deleting`;
      try {
        await rename(manualDir(manualId), deleting);
      } catch (error) {
        if (isErrorCode(error, "ENOENT")) return;
        throw error;
      }
      await rm(deleting, { recursive: true, force: true }).catch((error: unknown) => {
        console.error(`The manual "${manualId}" is deleted, but removing ${deleting} failed:`, error);
      });
    },

    getBody: (manualId, sectionId) => readIfExists(sectionFile(manualId, sectionId)),

    async saveBody(manualId, sectionId, body) {
      const target = sectionFile(manualId, sectionId);
      await makeSectionsDir(sectionsDir(manualId), manualId);
      const temp = tempPathFor(target);
      await writeFile(temp, body);
      try {
        await link(temp, target);
        return "saved";
      } catch (error) {
        if (isErrorCode(error, "EEXIST")) return "already-written";
        throw error;
      } finally {
        await rm(temp, { force: true });
      }
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
      await mkdir(dataDir, { recursive: true });
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

async function writeAtomically(target: string, content: string) {
  const temp = tempPathFor(target);
  await writeFile(temp, content);
  await rename(temp, target);
}

function checkedId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Not a valid id: "${id}"`);
  return id;
}

function tempPathFor(target: string): string {
  return `${target}.${randomUUID()}.tmp`;
}
