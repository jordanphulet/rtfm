import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tempDataDir } from "../testing.ts";
import { createFileLinkStore } from "./file-link-store.ts";
import { librarySecretDigest, makeLibrarySecret } from "./library-links.ts";
import { describeLinkStore, newLink } from "./link-store-suite.ts";

describeLinkStore(
  "the file link store",
  async () => createFileLinkStore(await tempDataDir()),
  async () => {
    // A file where the links' folder should be, so reading a link fails with ENOTDIR.
    const dataDir = await tempDataDir();
    await writeFile(path.join(dataDir, "links"), "");
    return createFileLinkStore(dataDir);
  },
);

describe("the file link store's files", () => {
  it("keeps each link in links/<digest>.json and each library's activity in activity/<libraryId>.json", async () => {
    const dataDir = await tempDataDir();
    const store = createFileLinkStore(dataDir);
    const link = newLink("acme");
    await store.createLink(link);
    await store.recordOpen("acme", "2026-10-14T10:00:00.000Z");

    expect(await readdir(path.join(dataDir, "links"))).toEqual([`${link.digest}.json`]);
    expect(JSON.parse(await readFile(path.join(dataDir, "links", `${link.digest}.json`), "utf8"))).toEqual({
      libraryId: "acme",
      label: link.label,
      createdAt: link.createdAt,
    });
    expect(await readdir(path.join(dataDir, "activity"))).toEqual(["acme.json"]);
  });

  it("keeps no secret in any file", async () => {
    const dataDir = await tempDataDir();
    const store = createFileLinkStore(dataDir);
    const secret = makeLibrarySecret();
    await store.createLink(newLink("acme", { digest: librarySecretDigest(secret) }));
    await store.recordOpen("acme", "2026-10-14T10:00:00.000Z");
    await store.revokeLink("acme", "2026-10-15T09:00:00.000Z");

    const files = (await readdir(dataDir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
    expect(files).toHaveLength(2);
    for (const file of files) {
      const filePath = path.join(file.parentPath, file.name);
      expect(filePath).not.toContain(secret);
      expect(await readFile(filePath, "utf8")).not.toContain(secret);
    }
  });

  it("lists only link and activity files, leaving out temp files", async () => {
    const dataDir = await tempDataDir();
    const store = createFileLinkStore(dataDir);
    const link = newLink("acme");
    await store.createLink(link);
    await store.count("acme", "sectionsRead");
    await writeFile(path.join(dataDir, "links", `${link.digest}.json.1234.tmp`), "{");
    await writeFile(path.join(dataDir, "activity", "acme.json.1234.tmp"), "{");

    expect(await store.listLinks()).toEqual([link]);
    expect((await store.listActivity()).map(({ libraryId }) => libraryId)).toEqual(["acme"]);
  });
});
