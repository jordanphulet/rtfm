import { readdir, readFile } from "node:fs/promises";
import { readIfExists } from "./files.ts";
import type { ManualStore, StoredManual } from "./types.ts";

const SEED_DIR = new URL("../seed/", import.meta.url);

interface SeedManual {
  manual: StoredManual;
  writtenAtStart: string[];
}

export async function seedStore(store: ManualStore): Promise<void> {
  for (const manualId of await seedManualIds()) {
    if (await store.getManual(manualId)) continue;
    const seed = await readSeedManual(manualId);
    for (const sectionId of seed.writtenAtStart) {
      const body = await readSeedBody(manualId, sectionId);
      if (body === undefined) throw new Error(`The seed has no body for "${sectionId}"`);
      await store.saveBody(manualId, sectionId, body);
    }
    await store.putManual(seed.manual);
  }
}

export function readSeedBody(manualId: string, sectionId: string): Promise<string | undefined> {
  return readIfExists(new URL(`${manualId}/sections/${sectionId}.md`, SEED_DIR));
}

async function seedManualIds(): Promise<string[]> {
  const entries = await readdir(SEED_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function readSeedManual(manualId: string): Promise<SeedManual> {
  const json = await readFile(new URL(`${manualId}/manual.json`, SEED_DIR), "utf8");
  return JSON.parse(json) as SeedManual;
}
