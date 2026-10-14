import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_LIBRARY_ID } from "./library.ts";
import { sectionsInReadingOrder } from "./manual.ts";
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

/** Opens a library's store on one table or data folder, which every library opened from it shares. */
export type OpenLibrary = (libraryId: string) => ManualStore;

const RECIPIENT_LIBRARY_ID = "acme";

/**
 * The rules every `ManualStore` keeps (`server/storage/README.md` › Manuals and sections), run
 * against each implementation, in the admin's library and in a recipient's, on a new table or data
 * folder for every test, beside another library that holds manuals of the same ids and is checked
 * unchanged after each test; then the rules that keep libraries apart.
 */
export function describeManualStore(name: string, newStorage: () => Promise<OpenLibrary>): void {
  for (const [libraryId, neighbourId] of [
    [ADMIN_LIBRARY_ID, RECIPIENT_LIBRARY_ID],
    [RECIPIENT_LIBRARY_ID, ADMIN_LIBRARY_ID],
  ]) {
    describe(`${name}, in the library ${libraryId}: the ManualStore rules`, () => {
      let store: ManualStore;
      let neighbour: ManualStore;
      let neighbourBefore: LibraryContents;

      beforeEach(async () => {
        const open = await newStorage();
        store = open(libraryId);
        neighbour = open(neighbourId);
        await fillNeighbour(neighbour);
        neighbourBefore = await contentsOf(neighbour);
      });

      afterEach(async () => {
        expect(await contentsOf(neighbour)).toEqual(neighbourBefore);
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

        expect(await store.deleteManual(manual.id)).toBe("deleted");

        expect(await store.getManual(manual.id)).toBeUndefined();
        expect(await store.getBody(manual.id, "s")).toBeUndefined();
        expect((await store.listManuals()).map(({ id }) => id)).toEqual(["kept"]);
        expect(await store.getBody("kept", "s")).toBe("kept body");
        expect(await store.seededManualIds()).toEqual([manual.id]);
      });

      it("deletes a manual that isn't there without complaint", async () => {
        await expect(store.deleteManual("not-there")).resolves.toBe("deleted");
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

  describeLibrariesApart(name, newStorage);
}

function describeLibrariesApart(name: string, newStorage: () => Promise<OpenLibrary>): void {
  describe(`${name}: libraries kept apart`, () => {
    let admin: ManualStore;
    let recipient: ManualStore;

    beforeEach(async () => {
      const open = await newStorage();
      admin = open(ADMIN_LIBRARY_ID);
      recipient = open(RECIPIENT_LIBRARY_ID);
    });

    it("keeps a manual of one id in two libraries apart, with its own sections", async () => {
      const recipientsManual = { ...manual, title: "The Recipient's Manual" };
      expect(await admin.createManual(manual)).toBe("created");
      expect(await recipient.getManual(manual.id)).toBeUndefined();
      expect(await recipient.createManual(recipientsManual)).toBe("created");
      expect(await admin.saveBody(manual.id, "s", "the admin's")).toBe("saved");

      expect(await recipient.writtenSectionIds(manual.id)).toEqual([]);
      expect(await recipient.getBody(manual.id, "s")).toBeUndefined();
      expect(await recipient.saveBody(manual.id, "s", "the recipient's")).toBe("saved");

      expect(await admin.getManual(manual.id)).toEqual(manual);
      expect(await recipient.getManual(manual.id)).toEqual(recipientsManual);
      expect(await admin.getBody(manual.id, "s")).toBe("the admin's");
      expect(await recipient.getBody(manual.id, "s")).toBe("the recipient's");
    });

    it("lists each library's manuals alone", async () => {
      await admin.createManual(manual);
      await recipient.createManual({ ...manual, id: "recipients-own" });
      expect((await admin.listManuals()).map(({ id }) => id)).toEqual([manual.id]);
      expect((await recipient.listManuals()).map(({ id }) => id)).toEqual(["recipients-own"]);
    });

    it("deletes a manual in one library only", async () => {
      await admin.createManual(manual);
      await admin.saveBody(manual.id, "s", "the admin's");
      await recipient.createManual(manual);
      await recipient.saveBody(manual.id, "s", "the recipient's");

      expect(await recipient.deleteManual(manual.id)).toBe("deleted");

      expect(await recipient.getManual(manual.id)).toBeUndefined();
      expect(await admin.getManual(manual.id)).toEqual(manual);
      expect(await admin.getBody(manual.id, "s")).toBe("the admin's");
    });

    it("refuses a save into a manual that only another library has", async () => {
      await admin.createManual(manual);
      await expect(recipient.saveBody(manual.id, "s", "x")).rejects.toThrow('There is no manual "a-manual"');
      expect(await admin.writtenSectionIds(manual.id)).toEqual([]);
    });

    it("keeps each library's seeding record", async () => {
      await admin.markSeeded("one");
      await recipient.markSeeded("two");
      expect(await admin.seededManualIds()).toEqual(["one"]);
      expect(await recipient.seededManualIds()).toEqual(["two"]);
    });
  });
}

/** Everything a library holds: its manuals, every section's body, and its seeding record. */
interface LibraryContents {
  manuals: { manual: StoredManual; written: string[]; bodies: (string | undefined)[] }[];
  seeded: string[];
}

async function contentsOf(store: ManualStore): Promise<LibraryContents> {
  const manuals = (await store.listManuals()).sort((one, other) => one.id.localeCompare(other.id));
  return {
    manuals: await Promise.all(
      manuals.map(async (stored) => ({
        manual: stored,
        written: (await store.writtenSectionIds(stored.id)).sort(),
        bodies: await Promise.all(sectionsInReadingOrder(stored).map(({ id }) => store.getBody(stored.id, id))),
      })),
    ),
    seeded: (await store.seededManualIds()).sort(),
  };
}

/** Manuals of the ids the rules use, so a rule that reached this library would find them, or change them. */
async function fillNeighbour(neighbour: ManualStore) {
  await neighbour.createManual({ ...manual, title: "The Neighbour's Manual" });
  await neighbour.saveBody(manual.id, "s", "the neighbour's");
  await neighbour.createManual({ ...manual, id: "kept", title: "The Neighbour's Kept Manual" });
  await neighbour.markSeeded("one");
  await neighbour.markSeeded(manual.id);
}
