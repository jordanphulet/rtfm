// @vitest-environment happy-dom
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { render } from "../testing";

type Answer = (url: string, init?: RequestInit) => Promise<Response>;

let answer: Answer;
let router: ReturnType<typeof createMemoryRouter> | undefined;
let reload: MockInstance<() => void>;

const refuseEverything: Answer = async () => Response.json({ error: "Passcode required" }, { status: 401 });

beforeEach(() => {
  vi.resetModules();
  answer = refuseEverything;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => answer(url, init)));
  reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
});

afterEach(() => {
  router?.dispose();
  router = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Loads the whole app fresh at `path`, as a new page load does, and waits for the passcode screen. */
async function openApp(path: string) {
  const { default: App } = await import("../App");
  const appRouter = createMemoryRouter([{ path: "*", element: <App /> }], { initialEntries: [path] });
  router = appRouter;
  await act(async () => render(<RouterProvider router={appRouter} />));
  await vi.waitFor(async () => {
    await settle();
    expect(document.querySelector(".ui.passcode")).not.toBeNull();
  });
}

async function settle() {
  for (let tick = 0; tick < 10; tick++) await act(() => new Promise((resolve) => setTimeout(resolve)));
}

function field(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#passcode-field")!;
}

function openButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(".passcode-open")!;
}

function status(): string {
  return document.querySelector("[role=status]")!.textContent ?? "";
}

async function type(text: string) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(field(), text);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    field().form!.requestSubmit();
  });
  await settle();
}

function passcodeRequests() {
  return vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/passcode");
}

describe("the passcode screen", () => {
  it("takes the landing page's place when the library answers 401", async () => {
    await openApp("/");

    expect(document.querySelector("h1")?.textContent).toBe("This library is private");
    expect(document.querySelector(".ui.passcode")).not.toBeNull();
    expect(document.querySelector(".home")).toBeNull();
    expect(document.body.textContent).not.toContain("Couldn’t open your library");
  });

  it("takes the reader's place when the manual answers 401", async () => {
    await openApp("/read/the-haunt-that-listens/the-room-controller");

    expect(document.querySelector("h1")?.textContent).toBe("This library is private");
    expect(document.querySelector(".reader")).toBeNull();
    expect(document.body.textContent).not.toContain("Couldn’t open this manual");
  });

  it("opens nothing while the field is empty", async () => {
    await openApp("/");

    expect(openButton().getAttribute("aria-disabled")).toBe("true");
    await submit();
    expect(passcodeRequests()).toEqual([]);
  });

  it("sends the passcode and reloads where the reader was once it is accepted", async () => {
    await openApp("/");
    answer = async (url) => (url === "/api/passcode" ? new Response(null, { status: 204 }) : refuseEverything(url));

    await type("copper lantern tidal owl");
    expect(openButton().getAttribute("aria-disabled")).toBeNull();
    await submit();

    expect(passcodeRequests()).toEqual([
      ["/api/passcode", expect.objectContaining({ method: "POST", body: JSON.stringify({ passcode: "copper lantern tidal owl" }) })],
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads when the server answers 404, since it no longer has a passcode", async () => {
    await openApp("/");
    const notFound = () => Response.json({ error: "Not found" }, { status: 404 });
    answer = async (url) => (url === "/api/passcode" ? notFound() : refuseEverything(url));

    await type("copper lantern tidal owl");
    await submit();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("says so when the passcode is wrong, and selects it to be typed again", async () => {
    await openApp("/");

    await type("copper lantern");
    await submit();

    expect(status()).toBe("Wrong passcode. Check it and try again.");
    expect(document.activeElement).toBe(field());
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, "copper lantern".length]);
    expect(openButton().textContent).toBe("Open");
    expect(reload).not.toHaveBeenCalled();
  });

  it("says so when the server doesn't answer", async () => {
    await openApp("/");
    answer = async (url) => (url === "/api/passcode" ? Promise.reject(new TypeError("Failed to fetch")) : refuseEverything(url));

    await type("copper lantern tidal owl");
    await submit();

    expect(status()).toBe("Couldn’t check the passcode. The server didn’t answer. Try again in a moment.");
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows Checking… and ignores another Open until the server answers", async () => {
    await openApp("/");
    let accept: (response: Response) => void = () => {};
    answer = (url) => (url === "/api/passcode" ? new Promise((resolve) => (accept = resolve)) : refuseEverything(url));

    await type("copper lantern tidal owl");
    await submit();
    expect(openButton().textContent).toBe("Checking…");
    expect(openButton().getAttribute("aria-disabled")).toBe("true");
    await submit();
    expect(passcodeRequests()).toHaveLength(1);

    await act(async () => accept(new Response(null, { status: 204 })));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
