import { beforeEach, describe, expect, it } from "vitest";
import {
  librarySecretDigest,
  makeLibrarySecret,
  noActivity,
  type LinkStore,
  type NewLibraryLink,
} from "./library-links.ts";

export function newLink(libraryId: string, fields: Partial<NewLibraryLink> = {}): NewLibraryLink {
  return {
    digest: librarySecretDigest(makeLibrarySecret()),
    libraryId,
    label: `Sent to ${libraryId}`,
    createdAt: "2026-10-14T09:00:00.000Z",
    ...fields,
  };
}

/**
 * The rules every `LinkStore` keeps (`server/storage/README.md` › Library links and activity), run
 * against each implementation with a new, empty store for every test, and with one whose storage
 * can't be read.
 */
export function describeLinkStore(
  name: string,
  newStore: () => Promise<LinkStore>,
  unreadableStore: () => Promise<LinkStore>,
): void {
  describe(`${name}: the LinkStore rules`, { timeout: 20_000 }, () => {
    let store: LinkStore;

    beforeEach(async () => {
      store = await newStore();
    });

    it("stores a link and finds it by its digest", async () => {
      const link = newLink("acme");
      expect(await store.findLink(link.digest)).toBeUndefined();
      expect(await store.createLink(link)).toBe("created");
      expect(await store.findLink(link.digest)).toEqual(link);
    });

    it("stores a link without a label", async () => {
      const link = newLink("acme", { label: undefined });
      expect(await store.createLink(link)).toBe("created");
      expect(await store.findLink(link.digest)).toEqual({ ...link, label: undefined });
    });

    it("never replaces a link whose digest is taken", async () => {
      const link = newLink("acme");
      await store.createLink(link);
      expect(await store.createLink({ ...link, libraryId: "globex" })).toBe("exists");
      expect(await store.findLink(link.digest)).toEqual(link);
    });

    it("answers a create of the very link already stored as its own, and of a revoked one as taken", async () => {
      const link = newLink("acme");
      await store.createLink(link);
      expect(await store.createLink({ ...link })).toBe("created");
      await store.revokeLink("acme", "2026-10-15T09:00:00.000Z");
      expect(await store.createLink({ ...link })).toBe("exists");
    });

    it("lets only one of two simultaneous creates with one digest win", async () => {
      const link = newLink("acme");
      const results = await Promise.all([store.createLink(link), store.createLink({ ...link, libraryId: "globex" })]);
      expect(results.sort()).toEqual(["created", "exists"]);
    });

    it("refuses to keep or look up anything but a digest, a secret included", async () => {
      const secret = makeLibrarySecret();
      await expect(store.createLink(newLink("acme", { digest: secret }))).rejects.toThrow("Not a link's digest");
      await expect(store.findLink(secret)).rejects.toThrow("Not a link's digest");
      await expect(store.findLink("../outside")).rejects.toThrow("Not a link's digest");
      expect(await store.listLinks()).toEqual([]);
    });

    it("refuses a library id that isn't a slug, or is the admin's", async () => {
      for (const libraryId of ["admin", "../outside", "L#acme"]) {
        await expect(store.createLink(newLink(libraryId))).rejects.toThrow("Not a recipient library's id");
        await expect(store.revokeLink(libraryId, "2026-10-15T09:00:00.000Z")).rejects.toThrow("Not a recipient");
        await expect(store.recordOpen(libraryId, "2026-10-15T09:00:00.000Z")).rejects.toThrow("Not a recipient");
        await expect(store.getActivity(libraryId)).rejects.toThrow("Not a recipient library's id");
      }
      expect(await store.listLinks()).toEqual([]);
      expect(await store.listActivity()).toEqual([]);
    });

    it("lists the links", async () => {
      expect(await store.listLinks()).toEqual([]);
      const acme = newLink("acme");
      const globex = newLink("globex", { label: undefined });
      await store.createLink(acme);
      await store.createLink(globex);
      const links = (await store.listLinks()).sort((one, other) => one.libraryId.localeCompare(other.libraryId));
      expect(links).toEqual([acme, { ...globex, label: undefined }]);
    });

    it("revokes a library's link, keeping it, and leaves the others open", async () => {
      const acme = newLink("acme");
      const globex = newLink("globex");
      await store.createLink(acme);
      await store.createLink(globex);

      expect(await store.revokeLink("acme", "2026-10-15T09:00:00.000Z")).toBe("revoked");

      expect(await store.findLink(acme.digest)).toEqual({ ...acme, revokedAt: "2026-10-15T09:00:00.000Z" });
      expect(await store.findLink(globex.digest)).toEqual(globex);
      expect(await store.listLinks()).toHaveLength(2);
    });

    it("revokes a link once, keeping its first revocation's time", async () => {
      const acme = newLink("acme");
      await store.createLink(acme);
      await store.revokeLink("acme", "2026-10-15T09:00:00.000Z");
      expect(await store.revokeLink("acme", "2026-10-16T09:00:00.000Z")).toBe("already-revoked");
      expect((await store.findLink(acme.digest))?.revokedAt).toBe("2026-10-15T09:00:00.000Z");
    });

    it("lets only one of two simultaneous revokes revoke", async () => {
      await store.createLink(newLink("acme"));
      const results = await Promise.all([
        store.revokeLink("acme", "2026-10-15T09:00:00.000Z"),
        store.revokeLink("acme", "2026-10-15T09:00:01.000Z"),
      ]);
      expect(results.sort()).toEqual(["already-revoked", "revoked"]);
    });

    it("answers a revoke of a library with no link as such", async () => {
      await store.createLink(newLink("acme"));
      expect(await store.revokeLink("globex", "2026-10-15T09:00:00.000Z")).toBe("no-link");
    });

    it("throws when a link can't be read, rather than answering that there is none", async () => {
      const unreadable = await unreadableStore();
      await expect(unreadable.findLink(newLink("acme").digest)).rejects.toThrow();
    });

    it("gives a library never used no activity", async () => {
      expect(await store.getActivity("acme")).toEqual(noActivity("acme"));
      expect(await store.listActivity()).toEqual([]);
    });

    it("counts the links opened, keeping the first one's time", async () => {
      await store.recordOpen("acme", "2026-10-14T10:00:00.000Z");
      await store.recordOpen("acme", "2026-10-14T11:00:00.000Z");
      expect(await store.getActivity("acme")).toEqual({
        ...noActivity("acme"),
        firstUsedAt: "2026-10-14T10:00:00.000Z",
        opens: 2,
      });
    });

    it("keeps the last use, never moving it back", async () => {
      await store.recordLastUse("acme", "2026-10-14T10:00:00.000Z");
      await store.recordLastUse("acme", "2026-10-14T11:00:00.000Z");
      await store.recordLastUse("acme", "2026-10-14T10:30:00.000Z");
      expect(await store.getActivity("acme")).toEqual({ ...noActivity("acme"), lastUsedAt: "2026-10-14T11:00:00.000Z" });
    });

    it("counts each counter on its own", async () => {
      await store.count("acme", "sectionsRead");
      await store.count("acme", "sectionsRead");
      await store.count("acme", "librarianMessages");
      await store.count("acme", "manualsCreated");
      await store.count("acme", "sectionsWritten");
      await store.count("acme", "sectionsWritten");
      await store.count("acme", "sectionsWritten");
      expect(await store.getActivity("acme")).toEqual({
        ...noActivity("acme"),
        sectionsRead: 2,
        librarianMessages: 1,
        manualsCreated: 1,
        sectionsWritten: 3,
      });
    });

    it("loses no count when many are made at once", async () => {
      await Promise.all([
        ...Array.from({ length: 10 }, () => store.count("acme", "sectionsRead")),
        ...Array.from({ length: 5 }, (_, index) => store.recordOpen("acme", `2026-10-14T10:00:0${index}.000Z`)),
      ]);
      const activity = await store.getActivity("acme");
      expect(activity.sectionsRead).toBe(10);
      expect(activity.opens).toBe(5);
      expect(activity.firstUsedAt).toMatch(/^2026-10-14T10:00:0\d\.000Z$/);
    });

    it("keeps each library's activity apart, and lists every library used", async () => {
      await store.recordOpen("acme", "2026-10-14T10:00:00.000Z");
      await store.count("globex", "sectionsRead");

      expect(await store.getActivity("acme")).toEqual({
        ...noActivity("acme"),
        firstUsedAt: "2026-10-14T10:00:00.000Z",
        opens: 1,
      });
      expect(await store.getActivity("globex")).toEqual({ ...noActivity("globex"), sectionsRead: 1 });
      const listed = (await store.listActivity()).sort((one, other) => one.libraryId.localeCompare(other.libraryId));
      expect(listed).toEqual([await store.getActivity("acme"), await store.getActivity("globex")]);
    });
  });
}
