import { describe, expect, it } from "vitest";
import { SAMPLE_ID, tempDataDir, UNWRITTEN_ID, WRITTEN_ID } from "../testing.ts";
import { createFileManualStore } from "./file-manual-store.ts";
import { readSeedBody, seedStore } from "./seed.ts";

describe("seedStore", () => {
  it("puts the sample manual and its 7 written sections into an empty store", async () => {
    const store = createFileManualStore(await tempDataDir());
    await seedStore(store);

    const manual = await store.getManual(SAMPLE_ID);
    const sections = [...manual!.chapters, ...manual!.appendices].flatMap((chapter) => chapter.sections);
    expect(sections).toHaveLength(18);

    const bodies = await Promise.all(sections.map((section) => store.getBody(SAMPLE_ID, section.id)));
    expect(bodies.filter((body) => body !== undefined)).toHaveLength(7);
    expect(await store.getBody(SAMPLE_ID, WRITTEN_ID)).toBe(await readSeedBody(SAMPLE_ID, WRITTEN_ID));
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBeUndefined();
  });

  it("has a seed body for every section", async () => {
    const store = createFileManualStore(await tempDataDir());
    await seedStore(store);
    const manual = await store.getManual(SAMPLE_ID);
    for (const chapter of [...manual!.chapters, ...manual!.appendices]) {
      for (const section of chapter.sections) {
        expect(await readSeedBody(SAMPLE_ID, section.id), section.id).toBeTruthy();
      }
    }
  });

  it("leaves a seeded store as it is", async () => {
    const store = createFileManualStore(await tempDataDir());
    await seedStore(store);
    await store.saveBody(SAMPLE_ID, UNWRITTEN_ID, "written since");
    await seedStore(store);
    expect(await store.getBody(SAMPLE_ID, UNWRITTEN_ID)).toBe("written since");
  });
});
