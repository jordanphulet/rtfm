import { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualSummary } from "./types";

const fake = vi.hoisted(() => ({
  responses: [] as (() => Promise<ManualSummary[]>)[],
}));

vi.mock("./api", () => ({
  fetchLibrary: () => fake.responses.shift()!(),
}));

type Store = typeof import("./store");

function summary(id: string, writtenCount = 0): ManualSummary {
  return { id, title: id, subtitle: "", chapterCount: 1, sectionCount: 4, writtenCount };
}

const GEESE = summary("geese");
const HAUNT = summary("haunt", 7);

async function loadStore(): Promise<Store> {
  vi.resetModules();
  return import("./store");
}

function read(store: Store): ManualSummary[] | undefined {
  let manuals: ManualSummary[] | undefined;
  function Probe() {
    manuals = store.useLibrary();
    return null;
  }
  renderToStaticMarkup(
    <Suspense fallback={null}>
      <Probe />
    </Suspense>,
  );
  return manuals;
}

async function readLoaded(store: Store): Promise<ManualSummary[]> {
  let manuals = read(store);
  while (!manuals) {
    await new Promise((resolve) => setTimeout(resolve));
    manuals = read(store);
  }
  return manuals;
}

function respond(manuals: ManualSummary[]) {
  fake.responses.push(async () => manuals);
}

beforeEach(() => {
  fake.responses.length = 0;
});

describe("the library store", () => {
  it("suspends until the library arrives, then lists it in the server's order", async () => {
    respond([GEESE, HAUNT]);
    const store = await loadStore();
    expect(read(store)).toBeUndefined();
    expect(await readLoaded(store)).toEqual([GEESE, HAUNT]);
  });

  it("loads the library once per page load", async () => {
    respond([GEESE, HAUNT]);
    const store = await loadStore();
    const first = await readLoaded(store);
    expect(read(store)).toBe(first);
    expect(fake.responses).toHaveLength(0);
  });

  it("removes a manual from the list", async () => {
    respond([GEESE, HAUNT]);
    const store = await loadStore();
    await readLoaded(store);
    store.removeFromLibrary("geese");
    expect(read(store)).toEqual([HAUNT]);
  });

  it("refreshes the counts", async () => {
    respond([GEESE, HAUNT]);
    respond([GEESE, summary("haunt", 8)]);
    const store = await loadStore();
    await readLoaded(store);
    await store.refreshLibrary();
    expect(read(store)?.[1].writtenCount).toBe(8);
  });

  it("keeps a removal made while a refresh was on its way", async () => {
    respond([GEESE, HAUNT]);
    let answerRefresh: (manuals: ManualSummary[]) => void = () => {};
    fake.responses.push(() => new Promise((resolve) => (answerRefresh = resolve)));
    const store = await loadStore();
    await readLoaded(store);

    const refresh = store.refreshLibrary();
    store.removeFromLibrary("geese");
    answerRefresh([GEESE, HAUNT]);
    await refresh;
    expect(read(store)).toEqual([HAUNT]);
  });

  it("keeps the list it has when a refresh fails", async () => {
    respond([GEESE, HAUNT]);
    fake.responses.push(() => Promise.reject(new Error("unreachable")));
    const store = await loadStore();
    await readLoaded(store);
    await store.refreshLibrary();
    expect(read(store)).toEqual([GEESE, HAUNT]);
  });
});
