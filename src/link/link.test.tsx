// @vitest-environment happy-dom
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, render } from "../testing";

type Answer = (url: string, init?: RequestInit) => Promise<Response>;

const SECRET = "Qk3vX9_tLmN2pRs7Yw-AbC";
const MANUAL_PATH = "/read/the-haunt-that-listens";

/** Loading the app takes about 20 ms on an idle machine and up to a second when test runs share it. */
const APP_LOAD_TIMEOUT_MS = 10_000;

let answer: Answer;
let router: ReturnType<typeof createMemoryRouter> | undefined;

const emptyLibrary: Answer = async (url) =>
  url === "/api/manuals" ? Response.json([]) : Response.json({ error: "Not found" }, { status: 404 });

const linkClosed = () => Response.json({ error: "Link closed" }, { status: 401 });

beforeEach(() => {
  vi.resetModules();
  answer = emptyLibrary;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => answer(url, init)));
});

afterEach(() => {
  router?.dispose();
  router = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Loads the whole app fresh, as a new page load does, at the last of `entries`. */
async function openApp(...entries: string[]) {
  const { default: App } = await import("../App");
  const appRouter = createMemoryRouter([{ path: "*", element: <App /> }], {
    initialEntries: entries,
    initialIndex: entries.length - 1,
  });
  router = appRouter;
  await act(async () => render(<RouterProvider router={appRouter} />));
}

async function waitFor(check: () => void) {
  await vi.waitFor(async () => {
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    check();
  }, APP_LOAD_TIMEOUT_MS);
}

function requests(): string[] {
  return vi.mocked(fetch).mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
}

function address(): string {
  const { pathname, search, hash } = router!.state.location;
  return pathname + search + hash;
}

function linkPosts() {
  return vi.mocked(fetch).mock.calls.filter(([url, init]) => url === "/api/link" && init?.method === "POST");
}

describe("opening a library's link", { timeout: 3 * APP_LOAD_TIMEOUT_MS }, () => {
  it("posts the secret with no button and opens the library at /", async () => {
    answer = async (url, init) => (url === "/api/link" ? new Response(null, { status: 204 }) : emptyLibrary(url, init));
    await openApp(`/l#${SECRET}`);

    await waitFor(() => expect(document.querySelector(".ui.home")).not.toBeNull());
    expect(linkPosts()).toEqual([
      ["/api/link", expect.objectContaining({ method: "POST", body: JSON.stringify({ secret: SECRET }) })],
    ]);
    expect(requests().indexOf("GET /api/manuals")).toBeGreaterThan(requests().indexOf("POST /api/link"));
    expect(address()).toBe("/");
  });

  it("keeps the secret in neither the address nor the back history, and sends it nowhere else", async () => {
    let accept: (response: Response) => void = () => {};
    answer = (url, init) => (url === "/api/link" ? new Promise((resolve) => (accept = resolve)) : emptyLibrary(url, init));
    await openApp(MANUAL_PATH, `/l#${SECRET}`);

    await waitFor(() => expect(address()).toBe("/l"));
    expect(document.querySelector("[role=status]")?.textContent).toBe("Opening your library…");
    expect(document.querySelector(".ui.passcode")).toBeNull();

    await act(async () => accept(new Response(null, { status: 204 })));
    await waitFor(() => expect(address()).toBe("/"));
    expect(router!.state.historyAction).toBe("REPLACE");
    await act(() => router!.navigate(-1));
    expect(address()).toBe(MANUAL_PATH);

    const sent = vi.mocked(fetch).mock.calls.filter((call) => linkPosts()[0] !== call);
    for (const [url, init] of sent) expect(`${url} ${String(init?.body ?? "")}`).not.toContain(SECRET);
  });

  it("shows the passcode screen saying the link is closed when the server refuses it", async () => {
    answer = async (url, init) => (url === "/api/link" ? linkClosed() : emptyLibrary(url, init));
    await openApp(`/l#${SECRET}`);

    await waitFor(() => expect(document.querySelector(".ui.passcode")).not.toBeNull());
    expect(document.querySelector(".passcode-closed")?.textContent).toBe("This link is closed.");
    expect(document.querySelector("h1")?.textContent).toBe("This library is private");
    expect(address()).toBe("/");
    expect(requests()).not.toContain("GET /api/manuals");
  });

  it("says the library didn’t open when the server fails, and tries the same secret again", async () => {
    answer = async (url, init) =>
      url === "/api/link" ? Response.json({ error: "Internal error" }, { status: 500 }) : emptyLibrary(url, init);
    await openApp(`/l#${SECRET}`);

    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Couldn’t open your library"));
    expect(document.body.textContent).not.toContain("This link is closed.");
    expect(address()).toBe("/l");

    answer = async (url, init) => (url === "/api/link" ? new Response(null, { status: 204 }) : emptyLibrary(url, init));
    click(document.querySelector(".link-retry")!);
    await waitFor(() => expect(address()).toBe("/"));
    expect(linkPosts().map(([, init]) => init?.body)).toEqual([
      JSON.stringify({ secret: SECRET }),
      JSON.stringify({ secret: SECRET }),
    ]);
  });
});

describe("/admin", { timeout: 3 * APP_LOAD_TIMEOUT_MS }, () => {
  it("leaves the library, then opens /", async () => {
    answer = async (url, init) =>
      url === "/api/link" && init?.method === "DELETE" ? new Response(null, { status: 204 }) : emptyLibrary(url, init);
    await openApp("/admin");

    await waitFor(() => expect(document.querySelector(".ui.home")).not.toBeNull());
    expect(requests().slice(0, 2)).toEqual(["DELETE /api/link", "GET /api/manuals"]);
    expect(address()).toBe("/");
  });
});
