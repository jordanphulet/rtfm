import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchManual, fetchSectionState, streamSection, type StreamEvent } from "./api";

class FakeEventSource {
  static last: FakeEventSource;
  url: string;
  closed = false;
  private listeners = new Map<string, (message: { data: string }) => void>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }

  addEventListener(type: string, listener: (message: { data: string }) => void) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown = {}) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) });
  }
}

function open(search = "") {
  vi.stubGlobal("window", { location: { search } });
  vi.stubGlobal("EventSource", FakeEventSource);
  const events: StreamEvent[] = [];
  const close = streamSection("the-haunt-that-listens", "the-director", (event) => events.push(event));
  return { source: FakeEventSource.last, events, close };
}

function stubFetch(status = 200) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    return { ok: status === 200, status, json: async () => ({}) };
  });
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("streamSection", () => {
  it("keeps the source open after append", () => {
    const { source, events } = open();
    source.emit("append", { at: 0, text: "Hello ", progress: 0.1 });
    expect(events).toEqual([{ event: "append", data: { at: 0, text: "Hello ", progress: 0.1 } }]);
    expect(source.closed).toBe(false);
  });

  it.each([
    ["written", {}],
    ["frozen", {}],
    ["failed", { reason: "budget" }],
  ])("closes the source after %s", (name, data) => {
    const { source, events } = open();
    source.emit(name, data);
    expect(events).toEqual([{ event: name, data }]);
    expect(source.closed).toBe(true);
  });

  it("closes the source on an error, asks the section's URL, then reports the error", async () => {
    const urls = stubFetch();
    const { source, events } = open();
    source.emit("error");
    expect(source.closed).toBe(true);
    await vi.waitFor(() => expect(events).toEqual([{ event: "error" }]));
    expect(urls).toEqual(["/api/manuals/the-haunt-that-listens/sections/the-director"]);
  });

  it("reports the error when the section's URL gets no answer either", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const { source, events } = open();
    source.emit("error");
    await vi.waitFor(() => expect(events).toEqual([{ event: "error" }]));
  });

  it("shows the passcode screen instead of an error when the section's URL answers 401", async () => {
    const required = vi.spyOn(await import("../passcode/required"), "requirePasscode");
    stubFetch(401);
    const { source, events } = open();
    source.emit("error");
    await vi.waitFor(() => expect(required).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual([]);
  });

  it("returns a function that closes the source", () => {
    const { source, close } = open();
    close();
    expect(source.closed).toBe(true);
  });

  it("opens the section's stream", () => {
    expect(open().source.url).toBe("/api/manuals/the-haunt-that-listens/sections/the-director/stream");
  });

  it("passes ?freeze and ?fail through, and no other options", () => {
    const { source } = open("?freeze=0.5&fail=budget&conversation=demo");
    expect(source.url).toBe("/api/manuals/the-haunt-that-listens/sections/the-director/stream?freeze=0.5&fail=budget");
  });
});

describe("fetching", () => {
  it("requests the manual and a section by their ids", async () => {
    const urls = stubFetch();
    await fetchManual("x");
    await fetchSectionState("x", "y");
    expect(urls).toEqual(["/api/manuals/x", "/api/manuals/x/sections/y"]);
  });

  it("encodes ids that aren't safe in a path", async () => {
    const urls = stubFetch();
    await fetchManual("a/b c");
    await fetchSectionState("a/b c", "d?e");
    expect(urls).toEqual(["/api/manuals/a%2Fb%20c", "/api/manuals/a%2Fb%20c/sections/d%3Fe"]);
  });
});
