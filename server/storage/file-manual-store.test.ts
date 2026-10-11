import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tempDataDir } from "../testing.ts";
import { createFileManualStore } from "./file-manual-store.ts";
import type { ManualStore, StoredManual } from "./types.ts";

const manual: StoredManual = {
  id: "a-manual",
  title: "A Manual",
  subtitle: "For testing",
  voice: "Plain",
  chapters: [{ id: "one", label: "1", title: "One", sections: [{ id: "s", label: "1.1", title: "S", summary: "." }] }],
  appendices: [],
};

describe("file manual store", () => {
  let dataDir: string;
  let store: ManualStore;

  beforeEach(async () => {
    dataDir = await tempDataDir();
    store = createFileManualStore(dataDir);
  });

  it("stores and reads a manual", async () => {
    expect(await store.getManual(manual.id)).toBeUndefined();
    await store.putManual(manual);
    expect(await store.getManual(manual.id)).toEqual(manual);
  });

  it("treats an id that isn't a slug as no manual", async () => {
    expect(await store.getManual("../outside")).toBeUndefined();
  });

  it("lists the stored manuals, skipping folders that aren't manuals", async () => {
    expect(await store.listManuals()).toEqual([]);
    await store.putManual(manual);
    await store.putManual({ ...manual, id: "another-manual" });
    await mkdir(path.join(dataDir, "manuals", "no-manual-json"));
    const leftover = path.join(dataDir, "manuals", "a-manual.leftover.deleting");
    await mkdir(leftover);
    await writeFile(path.join(leftover, "manual.json"), JSON.stringify(manual));

    const ids = (await store.listManuals()).map(({ id }) => id).sort();
    expect(ids).toEqual(["a-manual", "another-manual"]);
  });

  it("saves a body once and keeps the first one", async () => {
    await store.putManual(manual);
    expect(await store.getBody(manual.id, "s")).toBeUndefined();
    expect(await store.saveBody(manual.id, "s", "first")).toBe("saved");
    expect(await store.saveBody(manual.id, "s", "second")).toBe("already-written");
    expect(await store.getBody(manual.id, "s")).toBe("first");
  });

  it("lets only one of two simultaneous saves win, and leaves no temp files", async () => {
    await store.putManual(manual);
    const results = await Promise.all([
      store.saveBody(manual.id, "s", "one"),
      store.saveBody(manual.id, "s", "two"),
    ]);
    expect(results.sort()).toEqual(["already-written", "saved"]);
    expect(await readdir(path.join(dataDir, "manuals", manual.id, "sections"))).toEqual(["s.md"]);
  });

  it("refuses a section id that isn't a slug", async () => {
    await store.putManual(manual);
    await expect(store.saveBody(manual.id, "../s", "x")).rejects.toThrow("Not a valid id");
  });

  it("refuses to save a section into a manual that doesn't exist", async () => {
    await expect(store.saveBody(manual.id, "s", "x")).rejects.toThrow('There is no manual "a-manual"');
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("lists the written sections, ignoring temp files", async () => {
    await store.putManual(manual);
    expect(await store.writtenSectionIds(manual.id)).toEqual([]);
    await store.saveBody(manual.id, "s", "body");
    await writeFile(path.join(dataDir, "manuals", manual.id, "sections", "t.md.1234.tmp"), "half");
    expect(await store.writtenSectionIds(manual.id)).toEqual(["s"]);
  });

  it("deletes a manual with its sections, and nothing else", async () => {
    await store.putManual(manual);
    await store.putManual({ ...manual, id: "kept" });
    await store.saveBody(manual.id, "s", "body");
    const ledgerFile = path.join(dataDir, "ledger", "2026-10.jsonl");
    await mkdir(path.dirname(ledgerFile));
    await writeFile(ledgerFile, '{"kind":"reserve"}\n');

    await store.deleteManual(manual.id);

    expect(await store.getManual(manual.id)).toBeUndefined();
    expect(await store.getBody(manual.id, "s")).toBeUndefined();
    expect(await readdir(path.join(dataDir, "manuals"))).toEqual(["kept"]);
    expect(await readFile(ledgerFile, "utf8")).toBe('{"kind":"reserve"}\n');
  });

  it("counts a manual as deleted once it is renamed away, even if removing its files fails", async () => {
    await store.putManual(manual);
    await store.saveBody(manual.id, "s", "body");
    const manualsDir = path.join(dataDir, "manuals");
    await chmod(path.join(manualsDir, manual.id, "sections"), 0o500);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(store.deleteManual(manual.id)).resolves.toBeUndefined();
      expect(await store.getManual(manual.id)).toBeUndefined();
      expect(await store.listManuals()).toEqual([]);
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      const [leftover] = await readdir(manualsDir);
      await chmod(path.join(manualsDir, leftover, "sections"), 0o700);
      consoleError.mockRestore();
    }
  });

  it("deletes a manual that isn't there without complaint", async () => {
    await expect(store.deleteManual("not-there")).resolves.toBeUndefined();
  });

  it("can't save a section into a deleted manual", async () => {
    await store.putManual(manual);
    await store.deleteManual(manual.id);
    await expect(store.saveBody(manual.id, "s", "late")).rejects.toThrow("There is no manual");
    expect(await readdir(path.join(dataDir, "manuals"))).toEqual([]);
  });

  it("remembers which manuals have been seeded", async () => {
    expect(await store.seededManualIds()).toEqual([]);
    await store.markSeeded("one");
    await store.markSeeded("two");
    await store.markSeeded("one");
    expect(await createFileManualStore(dataDir).seededManualIds()).toEqual(["one", "two"]);
  });
});
