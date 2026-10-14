// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientErrorReport } from "../server/api/types";

type Module = typeof import("./reportErrors");

const REPORT_URL = "/api/client-errors";

let fetch: ReturnType<typeof stubFetch>;

function stubFetch(answer: (url: string) => Promise<Response>) {
  const stub = vi.fn((url: string, _init?: RequestInit) => answer(url));
  vi.stubGlobal("fetch", stub);
  return stub;
}

/** The reports sent so far, as the server would receive them. */
function reports(): ClientErrorReport[] {
  return fetch.mock.calls
    .filter(([url]) => url === REPORT_URL)
    .map(([, init]) => {
      expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" }, keepalive: true });
      return JSON.parse(String(init!.body)) as ClientErrorReport;
    });
}

/** A fresh copy of the module, so each test starts with reporting off and a full allowance. */
async function freshModule(): Promise<Module> {
  vi.resetModules();
  return import("./reportErrors");
}

beforeEach(() => {
  window.history.pushState({}, "", "/read/the-haunt-that-listens?freeze=0.5");
  fetch = stubFetch(async () => new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reporting errors", () => {
  it("sends nothing until reporting starts", async () => {
    const { apiFetch } = await freshModule();
    fetch = stubFetch(async () => new Response(null, { status: 502 }));

    await apiFetch("/api/manuals");
    expect(reports()).toEqual([]);
  });

  it("reports uncaught errors and unhandled rejections, with the page's path but not its query", async () => {
    const { startReportingErrors } = await freshModule();
    startReportingErrors();
    const error = new TypeError("Cannot read properties of undefined");

    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "a plain reason" }));

    expect(reports()).toEqual([
      { kind: "error", page: "/read/the-haunt-that-listens", name: "TypeError", message: error.message, stack: error.stack },
      { kind: "rejection", page: "/read/the-haunt-that-listens", message: "a plain reason" },
    ]);
  });

  it("reports an API request that gets no answer or a server error, and passes every answer on", async () => {
    const { apiFetch, startReportingErrors } = await freshModule();
    startReportingErrors();
    const answers: Record<string, () => Promise<Response>> = {
      "/api/manuals": async () => new Response(null, { status: 502 }),
      "/api/manuals/gone": async () => new Response(null, { status: 404 }),
      "/api/librarian": () => Promise.reject(new TypeError("Failed to fetch")),
    };
    fetch = stubFetch((url) => answers[url]?.() ?? Promise.resolve(new Response(null, { status: 204 })));

    expect((await apiFetch("/api/manuals")).status).toBe(502);
    expect((await apiFetch("/api/manuals/gone", { method: "DELETE" })).status).toBe(404);
    await expect(apiFetch("/api/librarian", { method: "POST" })).rejects.toThrow("Failed to fetch");

    expect(reports()).toEqual([
      { kind: "request", page: "/read/the-haunt-that-listens", method: "GET", path: "/api/manuals", status: 502 },
      { kind: "request", page: "/read/the-haunt-that-listens", method: "POST", path: "/api/librarian" },
    ]);
  });

  it("sends at most 20 reports a page load", async () => {
    const { apiFetch, startReportingErrors } = await freshModule();
    startReportingErrors();
    fetch = stubFetch(async () => new Response(null, { status: 502 }));

    for (let count = 0; count < 25; count++) await apiFetch("/api/manuals");

    expect(reports()).toHaveLength(20);
    expect(fetch).toHaveBeenCalledTimes(25 + 20);
  });

  it("never reports a report that fails", async () => {
    const { apiFetch, startReportingErrors } = await freshModule();
    startReportingErrors();
    fetch = stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(apiFetch("/api/manuals")).rejects.toThrow("Failed to fetch");
    await new Promise((resolve) => setTimeout(resolve));

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/manuals", REPORT_URL]);
  });

  it("answers a 401 by asking for the passcode, never settling and never reporting it", async () => {
    const { apiFetch, startReportingErrors } = await freshModule();
    const passcode = await import("./passcode/required");
    startReportingErrors();
    fetch = stubFetch(async () => Response.json({ error: "Passcode required" }, { status: 401 }));
    const required = vi.spyOn(passcode, "requirePasscode");

    const settled = vi.fn();
    void apiFetch("/api/manuals").then(settled, settled);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(required).toHaveBeenCalledWith("passcode-required");
    expect(required).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    expect(reports()).toEqual([]);
  });

  it("answers a 401 for a closed link by saying the link is closed", async () => {
    const { apiFetch, startReportingErrors } = await freshModule();
    const passcode = await import("./passcode/required");
    startReportingErrors();
    fetch = stubFetch(async () => Response.json({ error: "Link closed" }, { status: 401 }));
    const required = vi.spyOn(passcode, "requirePasscode");

    void apiFetch("/api/manuals");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(required).toHaveBeenCalledWith("link-closed");
    expect(reports()).toEqual([]);
  });

  it("never reports a link's secret from the page's address", async () => {
    const secret = "Qk3vX9_tLmN2pRs7Yw-AbC";
    window.history.replaceState({}, "", `/l#${secret}`);
    const { apiFetch, startReportingErrors } = await freshModule();
    startReportingErrors();
    fetch = stubFetch(async () => new Response(null, { status: 502 }));

    await apiFetch("/api/manuals");

    expect(reports()).toEqual([{ kind: "request", page: "/l", method: "GET", path: "/api/manuals", status: 502 }]);
  });
});
