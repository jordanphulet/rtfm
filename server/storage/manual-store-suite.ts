import { beforeEach, describe, expect, it } from "vitest";
import type { ManualStore, StoredManual } from "./types.ts";

export const manual: StoredManual = {
  id: "a-manual",
  title: "A Manual",
  subtitle: "For testing",
  voice: "Plain",
  chapters: [
    {
      id: "one",
      label: "1",
      title: "One",
      sections: [
        { id: "s", label: "1.1", title: "S", summary: "." },
        { id: "t", label: "1.2", title: "T", summary: "." },
      ],
    },
  ],
  appendices: [],
};

/**
 * The rules every `ManualStore` keeps (`server/storage/README.md` › Manuals and sections), run
 * against each implementation with a new, empty store for every test.
 */
export function describeManualStore(name: string, newStore: () => Promise<ManualStore>): void {
  describe(`${name}: the ManualStore rules`, () => {
    let store: ManualStore;

    beforeEach(async () => {
      store = await newStore();
    });

    it("stores and reads a manual", async () => {
      expect(await store.getManual(manual.id)).toBeUndefined();
      expect(await store.createManual(manual)).toBe("created");
      expect(await store.getManual(manual.id)).toEqual(manual);
    });

    it("never replaces a manual whose id is taken", async () => {
      await store.createManual(manual);
      expect(await store.createManual({ ...manual, title: "Another Manual" })).toBe("exists");
      expect(await store.getManual(manual.id)).toEqual(manual);
    });

    it("answers a create of the very manual already stored as its own, changing nothing", async () => {
      await store.createManual(manual);
      await store.saveBody(manual.id, "s", "body");
      expect(await store.createManual({ ...manual })).toBe("created");
      expect(await store.getManual(manual.id)).toEqual(manual);
      expect(await store.writtenSectionIds(manual.id)).toEqual(["s"]);
    });

    it("lets only one of two simultaneous creates with one id win", async () => {
      const results = await Promise.all([
        store.createManual(manual),
        store.createManual({ ...manual, title: "Another Manual" }),
      ]);
      expect(results.sort()).toEqual(["created", "exists"]);
    });

    it("treats an id that isn't a slug as no manual", async () => {
      expect(await store.getManual("../outside")).toBeUndefined();
    });

    it("lists the stored manuals", async () => {
      expect(await store.listManuals()).toEqual([]);
      await store.createManual(manual);
      await store.createManual({ ...manual, id: "another-manual" });
      await store.saveBody(manual.id, "s", "body");
      const ids = (await store.listManuals()).map(({ id }) => id).sort();
      expect(ids).toEqual(["a-manual", "another-manual"]);
    });

    it("saves a body once and keeps the first one", async () => {
      await store.createManual(manual);
      expect(await store.getBody(manual.id, "s")).toBeUndefined();
      expect(await store.saveBody(manual.id, "s", "first")).toBe("saved");
      expect(await store.saveBody(manual.id, "s", "second")).toBe("already-written");
      expect(await store.getBody(manual.id, "s")).toBe("first");
    });

    it("lets only one of two simultaneous saves of a section win", async () => {
      await store.createManual(manual);
      const results = await Promise.all([store.saveBody(manual.id, "s", "one"), store.saveBody(manual.id, "s", "two")]);
      expect(results.sort()).toEqual(["already-written", "saved"]);
      expect(await store.writtenSectionIds(manual.id)).toEqual(["s"]);
    });

    it("saves two sections of a manual at once", async () => {
      await store.createManual(manual);
      const results = await Promise.all([store.saveBody(manual.id, "s", "one"), store.saveBody(manual.id, "t", "two")]);
      expect(results).toEqual(["saved", "saved"]);
      expect((await store.writtenSectionIds(manual.id)).sort()).toEqual(["s", "t"]);
    });

    it("refuses a section id that isn't a slug", async () => {
      await store.createManual(manual);
      await expect(store.saveBody(manual.id, "../s", "x")).rejects.toThrow("Not a valid id");
      await expect(store.getBody(manual.id, "../s")).rejects.toThrow("Not a valid id");
    });

    it("refuses a manual id that isn't a slug everywhere but getManual", async () => {
      await expect(store.deleteManual("../outside")).rejects.toThrow("Not a valid id");
      await expect(store.getBody("../outside", "s")).rejects.toThrow("Not a valid id");
      await expect(store.saveBody("../outside", "s", "x")).rejects.toThrow("Not a valid id");
      await expect(store.writtenSectionIds("../outside")).rejects.toThrow("Not a valid id");
    });

    it("refuses to save a section into a manual that doesn't exist", async () => {
      await expect(store.saveBody(manual.id, "s", "x")).rejects.toThrow('There is no manual "a-manual"');
      expect(await store.getBody(manual.id, "s")).toBeUndefined();
    });

    it("lists the written sections", async () => {
      await store.createManual(manual);
      expect(await store.writtenSectionIds(manual.id)).toEqual([]);
      await store.saveBody(manual.id, "s", "body");
      expect(await store.writtenSectionIds(manual.id)).toEqual(["s"]);
    });

    it("deletes a manual with its sections, and nothing else", async () => {
      await store.createManual(manual);
      await store.createManual({ ...manual, id: "kept" });
      await store.saveBody(manual.id, "s", "body");
      await store.saveBody("kept", "s", "kept body");
      await store.markSeeded(manual.id);

      await store.deleteManual(manual.id);

      expect(await store.getManual(manual.id)).toBeUndefined();
      expect(await store.getBody(manual.id, "s")).toBeUndefined();
      expect((await store.listManuals()).map(({ id }) => id)).toEqual(["kept"]);
      expect(await store.getBody("kept", "s")).toBe("kept body");
      expect(await store.seededManualIds()).toEqual([manual.id]);
    });

    it("deletes a manual that isn't there without complaint", async () => {
      await expect(store.deleteManual("not-there")).resolves.toBeUndefined();
    });

    it("can't save a section into a deleted manual", async () => {
      await store.createManual(manual);
      await store.deleteManual(manual.id);
      await expect(store.saveBody(manual.id, "s", "late")).rejects.toThrow("There is no manual");
      expect(await store.getBody(manual.id, "s")).toBeUndefined();
    });

    // Checks the outcome of whichever order the two run in; it can't force one interleaving.
    it("leaves no section behind when a save and a delete run at once", async () => {
      await store.createManual(manual);
      await Promise.allSettled([store.saveBody(manual.id, "s", "racing"), store.deleteManual(manual.id)]);

      expect(await store.getManual(manual.id)).toBeUndefined();
      expect(await store.getBody(manual.id, "s")).toBeUndefined();
    });

    it("gives a manual made again under a deleted one's id none of its sections", async () => {
      await store.createManual(manual);
      await store.saveBody(manual.id, "s", "old");
      await store.deleteManual(manual.id);

      expect(await store.createManual(manual)).toBe("created");
      expect(await store.writtenSectionIds(manual.id)).toEqual([]);
      expect(await store.getBody(manual.id, "s")).toBeUndefined();
    });

    it("remembers which manuals have been seeded", async () => {
      expect(await store.seededManualIds()).toEqual([]);
      await store.markSeeded("one");
      await store.markSeeded("two");
      await store.markSeeded("one");
      expect((await store.seededManualIds()).sort()).toEqual(["one", "two"]);
    });
  });
}
