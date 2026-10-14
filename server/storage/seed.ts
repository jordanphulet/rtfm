import { readdir, readFile } from "node:fs/promises";
import { readIfExists } from "./files.ts";
import type { ManualStore, StoredManual } from "./types.ts";

const SEED_DIR = new URL("../seed/", import.meta.url);

interface SeedManual {
  manual: StoredManual;
  writtenAtStart: string[];
}

/** Seeds every seed manual, each with the sections it starts with, as the admin's library is seeded. */
export async function seedStore(store: ManualStore, seedDir: URL = SEED_DIR): Promise<void> {
  await seedManuals(store, seedDir, await seedManualIds(seedDir), { withBodies: true });
}

/**
 * Seeds these seed manuals as tables of contents alone, as a recipient's library gets its starters,
 * giving the ids it seeded now.
 */
export function seedStarters(store: ManualStore, manualIds: string[], seedDir: URL = SEED_DIR): Promise<string[]> {
  return seedManuals(store, seedDir, manualIds, { withBodies: false });
}

async function seedManuals(store: ManualStore, seedDir: URL, manualIds: string[], { withBodies }: { withBodies: boolean }) {
  const seeded = new Set(await store.seededManualIds());
  const seededNow: string[] = [];
  for (const manualId of manualIds) {
    if (seeded.has(manualId)) continue;
    if (!(await store.getManual(manualId))) await createSeedManual(store, seedDir, manualId, withBodies);
    await store.markSeeded(manualId);
    seededNow.push(manualId);
  }
  return seededNow;
}

export function readSeedBody(manualId: string, sectionId: string, seedDir: URL = SEED_DIR): Promise<string | undefined> {
  return readIfExists(new URL(`${manualId}/sections/${sectionId}.md`, seedDir));
}

export async function readSeedManual(manualId: string, seedDir: URL = SEED_DIR): Promise<StoredManual> {
  return (await readSeed(seedDir, manualId)).manual;
}

/** Creates the seed manual, and its written sections if asked, unless a different manual has its id. */
async function createSeedManual(store: ManualStore, seedDir: URL, manualId: string, withBodies: boolean) {
  const seed = await readSeed(seedDir, manualId);
  if ((await store.createManual(seed.manual)) === "exists" || !withBodies) return;
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
