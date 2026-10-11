import { readdir } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
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

  it("saves a body once and keeps the first one", async () => {
    expect(await store.getBody(manual.id, "s")).toBeUndefined();
    expect(await store.saveBody(manual.id, "s", "first")).toBe("saved");
    expect(await store.saveBody(manual.id, "s", "second")).toBe("already-written");
    expect(await store.getBody(manual.id, "s")).toBe("first");
  });

  it("lets only one of two simultaneous saves win, and leaves no temp files", async () => {
    const results = await Promise.all([
      store.saveBody(manual.id, "s", "one"),
      store.saveBody(manual.id, "s", "two"),
    ]);
    expect(results.sort()).toEqual(["already-written", "saved"]);
    expect(await readdir(path.join(dataDir, "manuals", manual.id, "sections"))).toEqual(["s.md"]);
  });

  it("refuses a section id that isn't a slug", async () => {
    await expect(store.saveBody(manual.id, "../s", "x")).rejects.toThrow("Not a valid id");
  });
});
