import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "../logging/logger.ts";
import { capturingLogger, tempDataDir } from "../testing.ts";
import { createFileManualStore } from "./file-manual-store.ts";
import { describeManualStore, manual } from "./manual-store-suite.ts";
import type { ManualStore } from "./types.ts";

describeManualStore("the file manual store", async () => createFileManualStore(await tempDataDir(), silentLogger));

describe("the file manual store's files", () => {
  let dataDir: string;
  let store: ManualStore;

  beforeEach(async () => {
    dataDir = await tempDataDir();
    store = createFileManualStore(dataDir, silentLogger);
  });

  it("removes the manual's folder again when writing manual.json fails, so the id isn't left taken", async () => {
    const unserializable = { ...manual, voice: 1n as unknown as string };
    await expect(store.createManual(unserializable)).rejects.toThrow(TypeError);

    expect(await readdir(path.join(dataDir, "manuals"))).toEqual([]);
    expect(await store.createManual(manual)).toBe("created");
    expect(await store.getManual(manual.id)).toEqual(manual);
  });

  it("lists only folders that are manuals", async () => {
    await store.createManual(manual);
    await mkdir(path.join(dataDir, "manuals", "no-manual-json"));
    const leftover = path.join(dataDir, "manuals", "a-manual.leftover.deleting");
    await mkdir(leftover);
    await writeFile(path.join(leftover, "manual.json"), JSON.stringify(manual));

    expect((await store.listManuals()).map(({ id }) => id)).toEqual(["a-manual"]);
  });

  it("leaves no temp files after two simultaneous saves", async () => {
    await store.createManual(manual);
    await Promise.all([store.saveBody(manual.id, "s", "one"), store.saveBody(manual.id, "s", "two")]);
    expect(await readdir(path.join(dataDir, "manuals", manual.id, "sections"))).toEqual(["s.md"]);
  });

  it("makes no folder when saving into a manual that doesn't exist", async () => {
    await expect(store.saveBody(manual.id, "s", "x")).rejects.toThrow("There is no manual");
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("ignores temp files when listing the written sections", async () => {
    await store.createManual(manual);
    await store.saveBody(manual.id, "s", "body");
    await writeFile(path.join(dataDir, "manuals", manual.id, "sections", "t.md.1234.tmp"), "half");
    expect(await store.writtenSectionIds(manual.id)).toEqual(["s"]);
  });

  it("deletes only the manual's folder, leaving the ledger alone", async () => {
    await store.createManual(manual);
    await store.createManual({ ...manual, id: "kept" });
    const ledgerFile = path.join(dataDir, "ledger", "2026-10.jsonl");
    await mkdir(path.dirname(ledgerFile));
    await writeFile(ledgerFile, '{"kind":"reserve"}\n');

    await store.deleteManual(manual.id);

    expect(await readdir(path.join(dataDir, "manuals"))).toEqual(["kept"]);
    expect(await readFile(ledgerFile, "utf8")).toBe('{"kind":"reserve"}\n');
  });

  it("counts a manual as deleted once it is renamed away, even if removing its files fails", async () => {
    await store.createManual(manual);
    await store.saveBody(manual.id, "s", "body");
    const manualsDir = path.join(dataDir, "manuals");
    await chmod(path.join(manualsDir, manual.id, "sections"), 0o500);
    const { logger, entries } = capturingLogger();

    try {
      await expect(createFileManualStore(dataDir, logger).deleteManual(manual.id)).resolves.toBeUndefined();
      expect(await store.getManual(manual.id)).toBeUndefined();
      expect(await store.listManuals()).toEqual([]);
      expect(entries).toEqual([
        expect.objectContaining({ level: "ERROR", event: "manual.cleanup-failed", manualId: manual.id }),
      ]);
    } finally {
      const [leftover] = await readdir(manualsDir);
      await chmod(path.join(manualsDir, leftover, "sections"), 0o700);
    }
  });

  it("makes no folder when saving into a deleted manual", async () => {
    await store.createManual(manual);
    await store.deleteManual(manual.id);
    await expect(store.saveBody(manual.id, "s", "late")).rejects.toThrow("There is no manual");
    expect(await readdir(path.join(dataDir, "manuals"))).toEqual([]);
  });

  it("keeps the record of seeded manuals in the data folder", async () => {
    await store.markSeeded("one");
    expect(await createFileManualStore(dataDir, silentLogger).seededManualIds()).toEqual(["one"]);
  });
});
