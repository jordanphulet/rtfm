import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { config } from "../config.ts";
import { silentLogger } from "../logging/logger.ts";
import { SAMPLE_ID, tempDataDir, UNWRITTEN_ID, WRITTEN_ID } from "../testing.ts";
import { createDynamoDbManualStore } from "./dynamodb-manual-store.ts";
import { testAppTable } from "./dynamodb-testing.ts";
import { createFileManualStore } from "./file-manual-store.ts";
import { sectionsInReadingOrder } from "./manual.ts";
import { readSeedBody, readSeedManual, seedStarters, seedStore } from "./seed.ts";
import type { StoredManual } from "./types.ts";

function fixtureManual(id: string): StoredManual {
  return {
    id,
    title: `Manual ${id}`,
    subtitle: "A fixture",
    voice: "Plain",
    chapters: [
      {
        id: "one",
        label: "1",
        title: "One",
        sections: [
          { id: "first", label: "1.1", title: "First", summary: "." },
          { id: "second", label: "1.2", title: "Second", summary: "." },
        ],
      },
    ],
    appendices: [],
  };
}

async function tempSeedDir(): Promise<URL> {
  return pathToFileURL(`${await tempDataDir()}${path.sep}`);
}

async function addSeedManual(seedDir: URL, id: string) {
  const sectionsDir = new URL(`${id}/sections/`, seedDir);
  await mkdir(sectionsDir, { recursive: true });
  const seed = { manual: fixtureManual(id), writtenAtStart: ["first"] };
  await writeFile(new URL(`${id}/manual.json`, seedDir), JSON.stringify(seed));
  await writeFile(new URL("first.md", sectionsDir), `The first section of ${id}.\n`);
}

describe("seedStore", () => {
  it("puts the sample manual and its 7 written sections into an empty store", async () => {
    const store = createFileManualStore(await tempDataDir(), silentLogger);
    await seedStore(store);

    const manual = await store.getManual(SAMPLE_ID);
    const sections = sectionsInReadingOrder(manual!);
    expect(sections).toHaveLength(18);

    const bodies = await Promise.all(sections.map((section) => store.getBody(SAMPLE_ID, section.id)));
    expect(bodies.filter((body) => body !== undefined)).toHaveLength(7);
    expect(await store.getBody(SAMPLE_ID, WRITTEN_ID)).toBe(await readSeedBody(SAMPLE_ID, WRITTEN_ID));
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
  });

  it("has a seed body for every section of the sample", async () => {
    const store = createFileManualStore(await tempDataDir(), silentLogger);
    await seedStore(store);
    for (const section of sectionsInReadingOrder((await store.getManual(SAMPLE_ID))!)) {
      expect(await readSeedBody(SAMPLE_ID, section.id), section.id).toBeTruthy();
    }
  });

  it("seeds every manual in the seed folder, with the sections it starts with", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    await addSeedManual(seedDir, "beta");
    const store = createFileManualStore(await tempDataDir(), silentLogger);
    await seedStore(store, seedDir);

    expect((await store.listManuals()).map(({ id }) => id).sort()).toEqual(["alpha", "beta"]);
    expect(await store.getManual("alpha")).toEqual(fixtureManual("alpha"));
    expect(await store.writtenSectionIds("beta")).toEqual(["first"]);
    expect(await store.getBody("beta", "first")).toBe("The first section of beta.\n");
  });

  it("leaves a seeded manual as it is", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    const store = createFileManualStore(await tempDataDir(), silentLogger);
    await seedStore(store, seedDir);
    await store.saveBody("alpha", "second", "written since");
    await seedStore(store, seedDir);
    expect(await store.getBody("alpha", "second")).toBe("written since");
  });

  it("keeps a deleted seed manual deleted when the store is seeded again", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    await addSeedManual(seedDir, "beta");
    const dataDir = await tempDataDir();
    await seedStore(createFileManualStore(dataDir, silentLogger), seedDir);
    await createFileManualStore(dataDir, silentLogger).deleteManual("alpha");

    const restarted = createFileManualStore(dataDir, silentLogger);
    await seedStore(restarted, seedDir);
    expect((await restarted.listManuals()).map(({ id }) => id)).toEqual(["beta"]);
  });

  it("seeds a seed manual added later, and leaves the others as they are", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    const dataDir = await tempDataDir();
    const store = createFileManualStore(dataDir, silentLogger);
    await seedStore(store, seedDir);
    await store.saveBody("alpha", "second", "written since");

    await addSeedManual(seedDir, "beta");
    const restarted = createFileManualStore(dataDir, silentLogger);
    await seedStore(restarted, seedDir);

    expect((await restarted.listManuals()).map(({ id }) => id).sort()).toEqual(["alpha", "beta"]);
    expect(await restarted.writtenSectionIds("beta")).toEqual(["first"]);
    expect((await restarted.writtenSectionIds("alpha")).sort()).toEqual(["first", "second"]);
  });

  it("adopts a manual stored before seeding was recorded, without changing it", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    await addSeedManual(seedDir, "beta");
    const store = createFileManualStore(await tempDataDir(), silentLogger);
    const storedEarlier = { ...fixtureManual("alpha"), title: "Stored earlier" };
    await store.createManual(storedEarlier);
    await store.saveBody("alpha", "second", "written earlier");

    await seedStore(store, seedDir);

    expect(await store.getManual("alpha")).toEqual(storedEarlier);
    expect(await store.writtenSectionIds("alpha")).toEqual(["second"]);
    expect(await store.writtenSectionIds("beta")).toEqual(["first"]);
    expect((await store.seededManualIds()).sort()).toEqual(["alpha", "beta"]);
  });
});

describe("seedStarters", () => {
  it("seeds only the starters named, as tables of contents with no section written, giving the ids it seeded", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    await addSeedManual(seedDir, "beta");
    const store = createFileManualStore(await tempDataDir(), silentLogger, "acme");

    expect(await seedStarters(store, ["beta"], seedDir)).toEqual(["beta"]);

    expect(await store.listManuals()).toEqual([fixtureManual("beta")]);
    expect(await store.writtenSectionIds("beta")).toEqual([]);
    expect(await store.seededManualIds()).toEqual(["beta"]);
    expect(await seedStarters(store, ["beta"], seedDir)).toEqual([]);
  });

  it("keeps a deleted starter deleted", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    const store = createFileManualStore(await tempDataDir(), silentLogger, "acme");
    await seedStarters(store, ["alpha"], seedDir);
    await store.deleteManual("alpha");

    expect(await seedStarters(store, ["alpha"], seedDir)).toEqual([]);
    expect(await store.listManuals()).toEqual([]);
  });

  it("are committed seed manuals: the configured starters each have a seed", async () => {
    for (const manualId of config.starterManualIds) expect((await readSeedManual(manualId)).id).toBe(manualId);
  });
});

describe("seedStore on one table from two servers at once", () => {
  it("seeds each manual once, with its sections, and neither server fails", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    await addSeedManual(seedDir, "beta");
    const table = await testAppTable();
    const [one, other] = [createDynamoDbManualStore(table), createDynamoDbManualStore(table)];

    await Promise.all([seedStore(one, seedDir), seedStore(other, seedDir)]);

    expect((await one.listManuals()).map(({ id }) => id).sort()).toEqual(["alpha", "beta"]);
    expect(await one.writtenSectionIds("alpha")).toEqual(["first"]);
    expect(await one.getBody("beta", "first")).toBe("The first section of beta.\n");
    expect((await one.seededManualIds()).sort()).toEqual(["alpha", "beta"]);
  });

  it("keeps a seed manual deleted while the other server starts later", async () => {
    const seedDir = await tempSeedDir();
    await addSeedManual(seedDir, "alpha");
    const table = await testAppTable();
    await seedStore(createDynamoDbManualStore(table), seedDir);
    await createDynamoDbManualStore(table).deleteManual("alpha");

    const later = createDynamoDbManualStore(table);
    await seedStore(later, seedDir);
    expect(await later.listManuals()).toEqual([]);
  });
});

describe("the committed seeds", () => {
  const seedDir = new URL("../seed/", import.meta.url);

  async function committedSeeds() {
    const entries = await readdir(seedDir, { withFileTypes: true });
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    return Promise.all(
      folders.map(async (folder) => {
        const json = await readFile(new URL(`${folder}/manual.json`, seedDir), "utf8");
        return { folder, seed: JSON.parse(json) as { manual: StoredManual; writtenAtStart: string[] } };
      }),
    );
  }

  it("give each manual its folder's name as its id", async () => {
    const seeds = await committedSeeds();
    expect(seeds).not.toHaveLength(0);
    for (const { folder, seed } of seeds) expect(seed.manual.id, folder).toBe(folder);
  });

  it("start written only sections in the manual's own table of contents", async () => {
    for (const { folder, seed } of await committedSeeds()) {
      const sectionIds = sectionsInReadingOrder(seed.manual).map(({ id }) => id);
      for (const sectionId of seed.writtenAtStart) expect(sectionIds, `${folder}: ${sectionId}`).toContain(sectionId);
    }
  });
});
