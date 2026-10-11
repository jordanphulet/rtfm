import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteManual, fetchLibrary } from "./api";

function stubFetch(response: (url: string, init?: RequestInit) => Promise<Response>, search = "") {
  vi.stubGlobal("window", { location: { search } });
  const fetch = vi.fn(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchLibrary", () => {
  it("reads the summaries from the API", async () => {
    const summaries = [{ id: "geese", title: "Negotiating With Geese" }];
    const fetch = stubFetch(async () => Response.json(summaries));
    expect(await fetchLibrary()).toEqual(summaries);
    expect(fetch).toHaveBeenCalledWith("/api/manuals");
  });

  it("passes ?library=empty on to the API", async () => {
    const fetch = stubFetch(async () => Response.json([]), "?library=empty&conversation=demo");
    await fetchLibrary();
    expect(fetch).toHaveBeenCalledWith("/api/manuals?library=empty");
  });

  it("fails when the API answers with an error", async () => {
    stubFetch(async () => new Response(null, { status: 502 }));
    await expect(fetchLibrary()).rejects.toThrow("502");
  });
});

describe("deleteManual", () => {
  it.each([
    [204, "deleted"],
    [404, "deleted"],
    [409, "being-written"],
    [500, "failed"],
  ])("reads %i as %s", async (status, result) => {
    const fetch = stubFetch(async () => new Response(null, { status }));
    expect(await deleteManual("negotiating-with-geese")).toBe(result);
    expect(fetch).toHaveBeenCalledWith(
      "/api/manuals/negotiating-with-geese",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("gives up after 10 seconds without an answer", async () => {
    vi.useFakeTimers();
    stubFetch((_url, init) => {
      const signal = init!.signal!;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    });
    let result: string | undefined;
    void deleteManual("negotiating-with-geese").then((answer) => (result = answer));

    await vi.advanceTimersByTimeAsync(9_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe("failed");
  });

  it("fails when the server can't be reached", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await deleteManual("negotiating-with-geese")).toBe("failed");
  });
});
