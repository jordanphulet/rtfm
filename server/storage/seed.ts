import { readdir, readFile } from "node:fs/promises";
import { readIfExists } from "./files.ts";
import type { ManualStore, StoredManual } from "./types.ts";

const SEED_DIR = new URL("../seed/", import.meta.url);

interface SeedManual {
  manual: StoredManual;
  writtenAtStart: string[];
}

export async function seedStore(store: ManualStore, seedDir: URL = SEED_DIR): Promise<void> {
  const seeded = new Set(await store.seededManualIds());
  for (const manualId of await seedManualIds(seedDir)) {
    if (seeded.has(manualId)) continue;
    if (!(await store.getManual(manualId))) await putSeedManual(store, seedDir, manualId);
    await store.markSeeded(manualId);
  }
}

export function readSeedBody(manualId: string, sectionId: string, seedDir: URL = SEED_DIR): Promise<string | undefined> {
  return readIfExists(new URL(`${manualId}/sections/${sectionId}.md`, seedDir));
}

async function putSeedManual(store: ManualStore, seedDir: URL, manualId: string) {
  const seed = await readSeedManual(seedDir, manualId);
  await store.putManual(seed.manual);
  for (const sectionId of seed.writtenAtStart) {
    const body = await readSeedBody(manualId, sectionId, seedDir);
    if (body === undefined) throw new Error(`The seed has no body for "${sectionId}"`);
    await store.saveBody(manualId, sectionId, body);
  }
}

async function seedManualIds(seedDir: URL): Promise<string[]> {
  const entries = await readdir(seedDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function readSeedManual(seedDir: URL, manualId: string): Promise<SeedManual> {
  const json = await readFile(new URL(`${manualId}/manual.json`, seedDir), "utf8");
  return JSON.parse(json) as SeedManual;
}
