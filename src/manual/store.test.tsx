import { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StreamEvent } from "./api";
import type { UseSectionResult } from "./store";
import type { Manual, Section } from "./types";

const fake = vi.hoisted(() => {
  const section = (id: string): Section => ({ id, label: id, title: id, summary: "", status: "unwritten" });
  const manual: Manual = {
    id: "fixture",
    title: "Fixture",
    subtitle: "",
    chapters: [{ id: "1", label: "1", title: "One", sections: ["a", "b", "c", "d", "e"].map(section) }],
    appendices: [],
  };
  const streams: { manualId: string; id: string; send: (event: StreamEvent) => void; closed: boolean }[] = [];
  return { manual, streams };
});

vi.mock("./api", () => ({
  fetchManual: async (manualId: string) => ({ ...fake.manual, id: manualId }),
  fetchSectionState: async () => ({ status: "unwritten" }),
  streamSection(manualId: string, id: string, send: (event: StreamEvent) => void) {
    const stream = { manualId, id, send, closed: false };
    fake.streams.push(stream);
    return () => {
      stream.closed = true;
    };
  },
}));

type Store = typeof import("./store");

async function loadStore(): Promise<Store> {
  vi.resetModules();
  fake.streams.length = 0;
  return import("./store");
}

const MANUAL = "fixture";
const OTHER_MANUAL = "other-fixture";

function read(store: Store, id: string, manualId = MANUAL): UseSectionResult | undefined {
  let result: UseSectionResult | undefined;
  function Probe() {
    result = store.useSection(manualId, id);
    return null;
  }
  renderToStaticMarkup(
    <Suspense fallback={null}>
      <Probe />
    </Suspense>,
  );
  return result;
}

async function openIn(store: Store, manualId: string, ...ids: string[]) {
  for (const id of ids) {
    while (!read(store, id, manualId)) await new Promise((resolve) => setTimeout(resolve));
    store.openSection(manualId, id);
  }
}

const open = (store: Store, ...ids: string[]) => openIn(store, MANUAL, ...ids);

const streamFor = (id: string, manualId = MANUAL) =>
  fake.streams.findLast((stream) => stream.manualId === manualId && stream.id === id)!;
const append = (at: number, text: string): StreamEvent => ({ event: "append", data: { at, text, progress: 0.5 } });

describe("the manual store", () => {
  it("opens at most three streams and queues the rest as waiting", async () => {
    const store = await loadStore();
    await open(store, "a", "b", "c", "d", "e");

    expect(fake.streams.map((stream) => stream.id)).toEqual(["a", "b", "c"]);
    expect(read(store, "d")).toMatchObject({ status: "writing", text: "", progress: 0 });

    streamFor("a").send({ event: "written", data: {} });
    expect(fake.streams.map((stream) => stream.id)).toEqual(["a", "b", "c", "d"]);
    streamFor("b").send({ event: "failed", data: { reason: "error" } });
    expect(fake.streams.map((stream) => stream.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("frees a slot when a stream freezes", async () => {
    const store = await loadStore();
    await open(store, "a", "b", "c", "d");
    streamFor("a").send({ event: "frozen", data: {} });
    expect(streamFor("d")).toBeDefined();
    expect(read(store, "a")).toMatchObject({ status: "writing" });
  });

  it("fails a section when an append doesn't continue its text", async () => {
    const store = await loadStore();
    await open(store, "a", "b");

    streamFor("a").send(append(0, "Hello there "));
    expect(read(store, "a")).toMatchObject({ status: "writing", text: "Hello there " });
    streamFor("a").send(append(6, "rewritten "));
    expect(read(store, "a")).toMatchObject({ status: "unwritten", text: "Hello there ", failure: "error" });
    expect(streamFor("a").closed).toBe(true);

    streamFor("b").send(append(5, "a gap "));
    expect(read(store, "b")).toMatchObject({ status: "unwritten", text: "", failure: "error" });
    expect(streamFor("b").closed).toBe(true);
  });

  it("retries a failed section in place", async () => {
    const store = await loadStore();
    await open(store, "a");
    streamFor("a").send(append(0, "Some words "));
    streamFor("a").send({ event: "failed", data: { reason: "budget" } });
    expect(read(store, "a")).toMatchObject({ status: "unwritten", failure: "budget" });

    store.retrySection(MANUAL, "a");
    expect(read(store, "a")).toEqual(expect.objectContaining({ status: "writing", text: "", failure: undefined }));
    expect(fake.streams.map((stream) => stream.id)).toEqual(["a", "a"]);
    streamFor("a").send(append(0, "Fresh words "));
    expect(read(store, "a")).toMatchObject({ status: "writing", text: "Fresh words " });
  });

  it("queues a retry until a stream slot is free", async () => {
    const store = await loadStore();
    await open(store, "a", "b", "c", "d");
    streamFor("a").send({ event: "error" });
    expect(streamFor("d")).toBeDefined();

    store.retrySection(MANUAL, "a");
    expect(fake.streams.filter((stream) => stream.id === "a")).toHaveLength(1);
    expect(read(store, "a")).toMatchObject({ status: "writing", text: "" });
    streamFor("b").send({ event: "written", data: {} });
    expect(fake.streams.filter((stream) => stream.id === "a")).toHaveLength(2);
  });

  it("does nothing when asked to retry a section that hasn't failed", async () => {
    const store = await loadStore();
    await open(store, "a");
    store.retrySection(MANUAL, "a");
    expect(fake.streams).toHaveLength(1);
  });

  it("keeps each manual's sections and streams separate", async () => {
    const store = await loadStore();
    await openIn(store, MANUAL, "a");
    await openIn(store, OTHER_MANUAL, "a");
    expect(fake.streams.map((stream) => [stream.manualId, stream.id])).toEqual([
      [MANUAL, "a"],
      [OTHER_MANUAL, "a"],
    ]);

    streamFor("a", MANUAL).send(append(0, "First manual "));
    streamFor("a", OTHER_MANUAL).send({ event: "failed", data: { reason: "budget" } });
    expect(read(store, "a", MANUAL)).toMatchObject({ status: "writing", text: "First manual " });
    expect(read(store, "a", OTHER_MANUAL)).toMatchObject({ status: "unwritten", text: "", failure: "budget" });

    streamFor("a", MANUAL).send({ event: "written", data: {} });
    expect(read(store, "a", MANUAL)).toMatchObject({ status: "written" });
    expect(read(store, "a", OTHER_MANUAL)).toMatchObject({ status: "unwritten" });
  });

  it("shares the three open streams between manuals, in the order they were opened", async () => {
    const store = await loadStore();
    await openIn(store, MANUAL, "a", "b");
    await openIn(store, OTHER_MANUAL, "a", "b");
    expect(fake.streams.map((stream) => [stream.manualId, stream.id])).toEqual([
      [MANUAL, "a"],
      [MANUAL, "b"],
      [OTHER_MANUAL, "a"],
    ]);

    streamFor("a", MANUAL).send({ event: "written", data: {} });
    expect(fake.streams.at(-1)).toMatchObject({ manualId: OTHER_MANUAL, id: "b" });
  });

  it.each<[string, StreamEvent]>([
    ["failed", { event: "failed", data: { reason: "error" } }],
    ["a mismatched append", append(5, "a gap ")],
    ["frozen", { event: "frozen", data: {} }],
  ])("opens a stream queued for another manual when one ends with %s", async (_name, event) => {
    const store = await loadStore();
    await openIn(store, MANUAL, "a", "b", "c");
    await openIn(store, OTHER_MANUAL, "a");
    expect(fake.streams).toHaveLength(3);

    streamFor("a", MANUAL).send(event);
    expect(fake.streams.at(-1)).toMatchObject({ manualId: OTHER_MANUAL, id: "a" });
  });

  it("queues a retry in one manual behind another manual's open streams", async () => {
    const store = await loadStore();
    await openIn(store, MANUAL, "a");
    await openIn(store, OTHER_MANUAL, "a", "b", "c");
    streamFor("a", MANUAL).send({ event: "failed", data: { reason: "error" } });
    expect(fake.streams.at(-1)).toMatchObject({ manualId: OTHER_MANUAL, id: "c" });

    store.retrySection(MANUAL, "a");
    expect(fake.streams.filter((stream) => stream.manualId === MANUAL)).toHaveLength(1);
    expect(read(store, "a", MANUAL)).toMatchObject({ status: "writing", text: "" });

    streamFor("b", OTHER_MANUAL).send({ event: "written", data: {} });
    expect(fake.streams.at(-1)).toMatchObject({ manualId: MANUAL, id: "a" });
  });
});
