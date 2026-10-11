import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryManual } from "./types";

async function loadLibrary(search = "") {
  vi.stubGlobal("window", { location: { search } });
  vi.resetModules();
  const { useLibrary, deleteManual } = await import("./store");

  const readManuals = () => {
    let manuals: LibraryManual[] = [];
    function Probe() {
      manuals = useLibrary();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    return manuals;
  };
  return { readManuals, deleteManual };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("library store", () => {
  it("lists every seed manual, most recently opened first", async () => {
    const { readManuals } = await loadLibrary();
    const manuals = readManuals();
    expect(manuals).toHaveLength(7);
    const times = manuals.map((manual) => manual.lastOpenedAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("includes the sample manual with its seeded progress", async () => {
    const { readManuals } = await loadLibrary();
    const haunt = readManuals().find((manual) => manual.id === "the-haunt-that-listens");
    expect(haunt).toMatchObject({
      title: "The Haunt That Listens",
      chapterCount: 7,
      sectionCount: 18,
      writtenCount: 7,
    });
  });

  it("includes a manual about birthday parties", async () => {
    const { readManuals } = await loadLibrary();
    expect(readManuals().some((manual) => /birthday party/i.test(manual.title))).toBe(true);
  });

  it("deletes a manual in memory", async () => {
    const { readManuals, deleteManual } = await loadLibrary();
    deleteManual("negotiating-with-geese");
    const ids = readManuals().map((manual) => manual.id);
    expect(ids).toHaveLength(6);
    expect(ids).not.toContain("negotiating-with-geese");
  });

  it("ignores an unknown id", async () => {
    const { readManuals, deleteManual } = await loadLibrary();
    const before = readManuals();
    deleteManual("no-such-manual");
    expect(readManuals()).toBe(before);
  });

  it("restores every manual on reload", async () => {
    const first = await loadLibrary();
    first.deleteManual("negotiating-with-geese");
    const second = await loadLibrary();
    expect(second.readManuals()).toHaveLength(7);
  });

  it("starts empty with ?library=empty", async () => {
    const { readManuals } = await loadLibrary("?library=empty");
    expect(readManuals()).toEqual([]);
  });
});
