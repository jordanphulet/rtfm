import { randomUUID } from "node:crypto";
import { link, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isErrorCode, readIfExists } from "./files.ts";
import type { ManualStore, StoredManual } from "./types.ts";

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function createFileManualStore(dataDir: string): ManualStore {
  const manualsDir = path.join(dataDir, "manuals");
  const manualDir = (manualId: string) => path.join(manualsDir, checkedId(manualId));
  const manualFile = (manualId: string) => path.join(manualDir(manualId), "manual.json");
  const sectionFile = (manualId: string, sectionId: string) =>
    path.join(manualDir(manualId), "sections", `${checkedId(sectionId)}.md`);

  return {
    async getManual(manualId) {
      if (!ID_PATTERN.test(manualId)) return undefined;
      const json = await readIfExists(manualFile(manualId));
      return json === undefined ? undefined : (JSON.parse(json) as StoredManual);
    },

    getBody: (manualId, sectionId) => readIfExists(sectionFile(manualId, sectionId)),

    async saveBody(manualId, sectionId, body) {
      const target = sectionFile(manualId, sectionId);
      await mkdir(path.dirname(target), { recursive: true });
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

    async putManual(manual) {
      const target = manualFile(manual.id);
      await mkdir(path.dirname(target), { recursive: true });
      const temp = tempPathFor(target);
      await writeFile(temp, JSON.stringify(manual, null, 2));
      await rename(temp, target);
    },
  };
}

function checkedId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Not a valid id: "${id}"`);
  return id;
}

function tempPathFor(target: string): string {
  return `${target}.${randomUUID()}.tmp`;
}
