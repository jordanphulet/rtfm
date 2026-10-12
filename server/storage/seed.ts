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
    if (!(await store.getManual(manualId))) await createSeedManual(store, seedDir, manualId);
    await store.markSeeded(manualId);
  }
}

export function readSeedBody(manualId: string, sectionId: string, seedDir: URL = SEED_DIR): Promise<string | undefined> {
  return readIfExists(new URL(`${manualId}/sections/${sectionId}.md`, seedDir));
}

export async function readSeedManual(manualId: string, seedDir: URL = SEED_DIR): Promise<StoredManual> {
  return (await readSeed(seedDir, manualId)).manual;
}

async function createSeedManual(store: ManualStore, seedDir: URL, manualId: string) {
  const seed = await readSeed(seedDir, manualId);
  if ((await store.createManual(seed.manual)) === "exists") throw new Error(`The seed manual "${manualId}" already exists`);
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

async function readSeed(seedDir: URL, manualId: string): Promise<SeedManual> {
  const json = await readFile(new URL(`${manualId}/manual.json`, seedDir), "utf8");
  return JSON.parse(json) as SeedManual;
}
