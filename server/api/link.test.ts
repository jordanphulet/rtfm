import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTANT_PACE, unrecordedFakeModel } from "../agent/fake-model.ts";
import { startServer, type Replaced, type RunningServer } from "../app.ts";
import { config, fixedPasscode, type PasscodeSource } from "../config.ts";
import { createFileLinkStore } from "../storage/file-link-store.ts";
import { librarySecretDigest, makeLibrarySecret } from "../storage/library-links.ts";
import {
  capturingLogger, collect, cookiesSet, createTestLink, fastFakeWriter, readEvents, SAMPLE_ID, tempDataDir, UNWRITTEN_ID, WRITTEN_ID,
} from "../testing.ts";
import { LAST_USE_EVERY_MS } from "./activity.ts";
import { FOUND_LINK_MAX_AGE_MS } from "./link.ts";
import { setCookieHeader } from "./node-adapter.ts";
import { passcodeDigest } from "./passcode.ts";
import type { ManualSummary } from "./types.ts";

vi.setConfig({ testTimeout: 20_000 });

const ACME = "acme";
const STARTERS = ["negotiating-with-geese", "the-haunt-that-listens"];
const PASSCODE = "brass kettle mossy heron";
const PASSCODE_COOKIE = `rtfm_passcode=${passcodeDigest(PASSCODE)}`;
const STARTED_AT = Date.parse("2026-10-14T12:00:00.000Z");
const TREEHOUSE_REQUEST = "Let’s start a new manual about building a treehouse";
const SECTION_PATH = `/api/manuals/${SAMPLE_ID}/sections/${UNWRITTEN_ID}`;
const A_YEAR = "Max-Age=31536000";
/** How long a test waits for an activity write it doesn't await. */
const WAIT = { timeout: 10_000 };

const servers: RunningServer[] = [];

const conversation = (text: string) => ({ messages: [{ role: "user", text }] });

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

interface Settings {
  passcode?: PasscodeSource;
  replaced?: Replaced;
}

/** A server on loopback, with a link to `acme`'s library and a clock the test moves. */
async function start({ passcode, replaced }: Settings = {}) {
  const dataDir = await tempDataDir();
  const links = createFileLinkStore(dataDir);
  const secret = await createTestLink(links, ACME);
  const { logger, entries } = capturingLogger();
  let nowMs = STARTED_AT;
  const server = await startServer(
    { ...config, port: 0, dataDir, models: "fake", passcode },
    { writer: fastFakeWriter(), librarian: unrecordedFakeModel(INSTANT_PACE), logger, now: () => nowMs, ...replaced },
  );
  servers.push(server);
  const base = `http://127.0.0.1:${server.port}`;

  const send = (method: string, path: string, { cookie, body }: { cookie?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = cookie ? { cookie } : {};
    if (body !== undefined) headers["content-type"] = "application/json";
    return fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const open = (given: unknown = secret) => send("POST", "/api/link", { body: { secret: given } });
  const manualIds = async (cookie?: string) => {
    const response = await send("GET", "/api/manuals", { cookie });
    expect(response.status).toBe(200);
    return ((await response.json()) as ManualSummary[]).map(({ id }) => id).toSorted();
  };
  const opened = async () => {
    const response = await open();
    expect(response.status).toBe(204);
    return cookiesSet(response).rtfm_library!;
  };

  return {
    server, dataDir, links, secret, entries, base, send, open, opened, manualIds,
    wait: (ms: number) => (nowMs += ms),
    timeAfter: (ms: number) => new Date(STARTED_AT + ms).toISOString(),
    eventsNamed: (name: string) => entries.filter(({ event }) => event === name),
  };
}

describe("opening a library by its link", () => {
  it("starts a new library with the two starters, as tables of contents with no section written, seeded once", async () => {
    const { opened, open, send, eventsNamed } = await start();
    const cookie = await opened();

    const summaries = (await (await send("GET", "/api/manuals", { cookie })).json()) as ManualSummary[];
    expect(summaries.map(({ id }) => id).toSorted()).toEqual(STARTERS);
    expect(summaries.map(({ writtenCount }) => writtenCount)).toEqual([0, 0]);
    expect((await (await send("GET", `/api/manuals/${SAMPLE_ID}/sections/${WRITTEN_ID}`, { cookie })).json())).toEqual({
      status: "unwritten",
    });

    expect((await open()).status).toBe(204);
    expect(eventsNamed("library.seeded")).toEqual([
      expect.objectContaining({ level: "INFO", libraryId: ACME, manualIds: "the-haunt-that-listens,negotiating-with-geese" }),
    ]);
    expect(eventsNamed("link.accepted")).toEqual([
      expect.objectContaining({ libraryId: ACME }),
      expect.objectContaining({ libraryId: ACME }),
    ]);
  });

  it("seeds a library once when two browsers open it at once", async () => {
    const { open, opened, manualIds, eventsNamed } = await start();

    const answers = await Promise.all([open(), open()]);

    expect(answers.map(({ status }) => status)).toEqual([204, 204]);
    expect(eventsNamed("library.seeded")).toHaveLength(1);
    expect(await manualIds(await opened())).toEqual(STARTERS);
  });

  it("sets the library's cookie for a year and clears the passcode's, as two Set-Cookie headers", async () => {
    const { open, secret } = await start();

    const response = await open();

    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toEqual([
      `rtfm_library=${secret}; HttpOnly; SameSite=Strict; Path=/api; ${A_YEAR}`,
      "rtfm_passcode=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0",
    ]);
  });

  it("renews the cookie on every response to a request it opened, an event stream's and a 404's included", async () => {
    const { opened, send, secret } = await start();
    const cookie = await opened();
    const renewal = `rtfm_library=${secret}; HttpOnly; SameSite=Strict; Path=/api; ${A_YEAR}`;

    const responses = [
      await send("GET", "/api/manuals", { cookie }),
      await send("GET", "/api/nowhere", { cookie }),
      await send("POST", "/api/client-errors", { cookie, body: { kind: "error", page: "/", message: "Broke" } }),
      await send("GET", `${SECTION_PATH}/stream`, { cookie }),
    ];

    expect(responses.map(({ status }) => status)).toEqual([200, 404, 204, 200]);
    for (const response of responses) expect(response.headers.getSetCookie()).toEqual([renewal]);
    await collect(readEvents(responses[3]!));
    expect((await send("GET", "/api/manuals")).headers.getSetCookie()).toEqual([]);
  });

  it("refuses a secret that opens no library, or none at all, setting nothing", async () => {
    const { open, eventsNamed } = await start();

    for (const given of [makeLibrarySecret(), "not-a-secret", librarySecretDigest(makeLibrarySecret())]) {
      const response = await open(given);
      expect(response.status, given).toBe(401);
      expect(await response.json()).toEqual({ error: "Link closed" });
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect((await open(42)).status).toBe(400);
    expect(eventsNamed("link.refused")).toEqual(Array(3).fill(expect.objectContaining({ level: "WARN", reason: "unknown" })));
  });

  it("opens a link made after the server started at once, since a miss is never kept", async () => {
    const { open, links } = await start();
    const later = makeLibrarySecret();

    expect((await open(later)).status).toBe(401);
    await links.createLink({ digest: librarySecretDigest(later), libraryId: "globex", createdAt: new Date().toISOString() });

    expect((await open(later)).status).toBe(204);
  });

  it("keeps the adapter's Host, Origin and content-type checks", async () => {
    const { base, secret } = await start();
    const post = (headers: Record<string, string>, body: string) => fetch(`${base}/api/link`, { method: "POST", headers, body });

    const body = JSON.stringify({ secret });
    expect((await post({ "content-type": "application/json", origin: "https://evil.example" }, body)).status).toBe(403);
    expect((await post({ "content-type": "text/plain" }, body)).status).toBe(415);
  });
});

describe("a revoked link", () => {
  it("is refused within the minute, by its cookie and its secret, while another library stays open", async () => {
    const { opened, open, send, links, wait, eventsNamed } = await start();
    const cookie = await opened();
    const globex = await createTestLink(links, "globex");
    const globexCookie = cookiesSet(await open(globex)).rtfm_library!;

    expect(await links.revokeLink(ACME, new Date().toISOString())).toBe("revoked");
    wait(FOUND_LINK_MAX_AGE_MS - 1);
    expect((await send("GET", "/api/manuals", { cookie })).status).toBe(200);

    wait(1);
    const refused = await send("GET", "/api/manuals", { cookie });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: "Link closed" });
    expect(refused.headers.getSetCookie()).toEqual([]);
    const reopened = await open();
    expect(reopened.status).toBe(401);
    expect(reopened.headers.getSetCookie()).toEqual([]);
    expect((await send("GET", "/api/manuals", { cookie: globexCookie })).status).toBe(200);
    expect(eventsNamed("link.refused")).toEqual([expect.objectContaining({ reason: "revoked", libraryId: ACME })]);
    expect(eventsNamed("request.refused")).toEqual([expect.objectContaining({ status: 401, message: "Link closed" })]);
  });

  it("is refused even beside the passcode's cookie, which reaches the admin's library only without it", async () => {
    const { opened, send, links, wait, manualIds } = await start({ passcode: fixedPasscode(PASSCODE) });
    const cookie = await opened();

    await links.revokeLink(ACME, new Date().toISOString());
    wait(FOUND_LINK_MAX_AGE_MS);

    expect((await send("GET", "/api/manuals", { cookie: `${cookie}; ${PASSCODE_COOKIE}` })).status).toBe(401);
    expect(await manualIds(PASSCODE_COOKIE)).toHaveLength(7);
  });
});

describe("a link that can't be read", () => {
  it("answers 500, never the passcode screen or the admin's library, and logs neither the secret nor its digest", async () => {
    const { dataDir, secret, open, send, entries, eventsNamed } = await start();
    const linksDir = path.join(dataDir, "links");
    await chmod(linksDir, 0o000);
    try {
      const byCookie = await send("GET", "/api/manuals", { cookie: `rtfm_library=${secret}` });
      expect(byCookie.status).toBe(500);
      expect(await byCookie.json()).toEqual({ error: "Internal error" });
      expect((await open()).status).toBe(500);
    } finally {
      await chmod(linksDir, 0o755);
    }

    const failure = expect.objectContaining({ message: "Couldn't look up a library link (EACCES)" });
    expect(eventsNamed("request.failed")).toEqual(Array(2).fill(expect.objectContaining({ error: failure })));
    const logged = JSON.stringify(entries);
    for (const kept of [secret, librarySecretDigest(secret)]) expect(logged).not.toContain(kept);
  });

  it("answers 500 for a link that names the admin's library, which no link may open", async () => {
    const { dataDir, open, send, entries } = await start();
    const forged = makeLibrarySecret();
    const item = JSON.stringify({ libraryId: "admin", createdAt: new Date().toISOString() });
    await writeFile(path.join(dataDir, "links", `${librarySecretDigest(forged)}.json`), item);

    expect((await send("GET", "/api/manuals", { cookie: `rtfm_library=${forged}` })).status).toBe(500);
    expect((await open(forged)).status).toBe(500);
    expect(JSON.stringify(entries)).not.toContain(librarySecretDigest(forged));
  });
});

describe("leaving a library", () => {
  it("clears the library cookie with DELETE /api/link, back to the admin's library on loopback with no passcode", async () => {
    const { opened, send, manualIds } = await start();
    const cookie = await opened();
    expect(await manualIds(cookie)).toEqual(STARTERS);

    const left = await send("DELETE", "/api/link", { cookie });

    expect(left.status).toBe(204);
    expect(left.headers.getSetCookie()).toEqual(["rtfm_library=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0"]);
    expect(await manualIds()).toHaveLength(7);
    expect(await manualIds()).toContain("moving-house-without-losing-the-cat");
  });

  it("answers DELETE /api/link behind a passcode gate too, with or without a cookie", async () => {
    const { send } = await start({ passcode: fixedPasscode(PASSCODE) });

    expect((await send("DELETE", "/api/link")).status).toBe(204);
    expect((await send("DELETE", "/api/link", { cookie: "rtfm_library=whatever" })).status).toBe(204);
  });
});

describe("with a passcode gate", () => {
  it("opens a library by its link without the passcode, and only that library", async () => {
    const { opened, send, manualIds } = await start({ passcode: fixedPasscode(PASSCODE) });

    expect((await send("GET", "/api/manuals")).status).toBe(401);
    const cookie = await opened();

    expect(await manualIds(cookie)).toEqual(STARTERS);
    expect(await manualIds(`${PASSCODE_COOKIE}; ${cookie}`)).toEqual(STARTERS);
    expect(await manualIds(`${PASSCODE_COOKIE}; rtfm_library=${makeLibrarySecret()}`)).toHaveLength(7);
    expect((await send("GET", "/api/manuals", { cookie: `rtfm_library=${makeLibrarySecret()}` })).status).toBe(401);
  });
});

describe("a library's activity", () => {
  it("counts its opens, first and last use, sections read, librarian messages, manuals created and sections written", async () => {
    const { opened, open, send, links, wait, timeAfter } = await start();
    const activity = () => links.getActivity(ACME);
    const cookie = await opened();
    await vi.waitFor(async () => expect(await activity()).toMatchObject({ opens: 1, lastUsedAt: timeAfter(0) }), WAIT);
    expect(await activity()).toEqual({
      libraryId: ACME,
      firstUsedAt: timeAfter(0),
      lastUsedAt: timeAfter(0),
      opens: 1,
      sectionsRead: 0,
      librarianMessages: 0,
      manualsCreated: 0,
      sectionsWritten: 0,
    });

    expect((await send("GET", SECTION_PATH, { cookie })).status).toBe(200);
    expect((await send("GET", `${SECTION_PATH}-gone`, { cookie })).status).toBe(404);
    await collect(readEvents(await send("GET", `${SECTION_PATH}/stream`, { cookie })));
    expect((await send("GET", SECTION_PATH, { cookie })).status).toBe(200);
    await collect(readEvents(await send("POST", "/api/librarian", { cookie, body: conversation(TREEHOUSE_REQUEST) })));
    await collect(readEvents(await send("POST", "/api/librarian?freeze=0.5", { cookie, body: conversation("Hello") })));
    expect((await send("GET", "/api/manuals", { cookie })).status).toBe(200);

    await vi.waitFor(
      async () =>
        expect(await activity()).toMatchObject({ sectionsRead: 2, librarianMessages: 1, manualsCreated: 1, sectionsWritten: 1 }),
      WAIT,
    );
    expect(await activity()).toMatchObject({ opens: 1, lastUsedAt: timeAfter(0) });

    wait(LAST_USE_EVERY_MS);
    expect((await send("GET", "/api/manuals", { cookie })).status).toBe(200);
    await vi.waitFor(async () => expect((await activity()).lastUsedAt).toBe(timeAfter(LAST_USE_EVERY_MS)), WAIT);
    wait(1_000);
    expect((await open()).status).toBe(204);
    expect(await activity()).toMatchObject({ opens: 2, firstUsedAt: timeAfter(0) });

    expect((await links.listActivity()).map(({ libraryId }) => libraryId)).toEqual([ACME]);
  });

  it("records nothing of the admin's library", async () => {
    const { send, links } = await start();

    expect((await send("GET", SECTION_PATH)).status).toBe(200);
    await collect(readEvents(await send("POST", "/api/librarian", { body: conversation(TREEHOUSE_REQUEST) })));
    await collect(readEvents(await send("GET", `${SECTION_PATH}/stream`)));

    expect(await links.listActivity()).toEqual([]);
  });

  it("logs what it can't write, and answers the request all the same", async () => {
    const { opened, send, dataDir, eventsNamed } = await start();
    await mkdir(path.join(dataDir, "activity", `${ACME}.json`), { recursive: true });

    const cookie = await opened();
    expect((await send("GET", SECTION_PATH, { cookie })).status).toBe(200);

    await vi.waitFor(() => {
      const failed = eventsNamed("library.activity-failed").map(({ activity }) => activity);
      expect(failed.toSorted()).toEqual(["lastUsedAt", "opens", "sectionsRead"]);
    }, WAIT);
    expect(eventsNamed("library.activity-failed")[0]).toMatchObject({ level: "WARN", libraryId: ACME });
  });
});

describe("the link's secret", () => {
  it("is in no log line or file, and nor is its digest", async () => {
    const dataDir = await tempDataDir();
    const links = createFileLinkStore(dataDir);
    const secret = await createTestLink(links, ACME);
    const revoked = await createTestLink(links, "globex");
    await links.revokeLink("globex", new Date().toISOString());
    const server = await startServer({ ...config, port: 0, dataDir, models: "fake", passcode: undefined });
    const base = `http://127.0.0.1:${server.port}`;
    const post = (given: string) =>
      fetch(`${base}/api/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: given }),
      });

    expect((await post(secret)).status).toBe(204);
    expect((await post(revoked)).status).toBe(401);
    expect((await fetch(`${base}/api/manuals`, { headers: { cookie: `rtfm_library=${secret}` } })).status).toBe(200);
    expect((await fetch(`${base}/api/manuals`, { headers: { cookie: `rtfm_library=${revoked}` } })).status).toBe(401);
    expect((await fetch(`${base}${SECTION_PATH}`, { headers: { cookie: `rtfm_library=${secret}` } })).status).toBe(200);
    await server.close();

    const written = await Promise.all((await filesIn(dataDir)).map((file) => readFile(file, "utf8")));
    expect(written.some((text) => text.includes('"event":"link.accepted"'))).toBe(true);
    for (const text of written) {
      for (const kept of [secret, revoked, librarySecretDigest(secret), librarySecretDigest(revoked)]) {
        expect(text).not.toContain(kept);
      }
    }
  });
});

describe("the library cookie", () => {
  it("is Secure unless the request's host is this machine, like the passcode's", () => {
    const cookie = { name: "rtfm_library", value: "abc", maxAgeSeconds: 31_536_000 };
    expect(setCookieHeader(cookie, "127.0.0.1:8787")).toBe(`rtfm_library=abc; HttpOnly; SameSite=Strict; Path=/api; ${A_YEAR}`);
    expect(setCookieHeader(cookie, "rtfm.example.com")).toBe(
      `rtfm_library=abc; HttpOnly; SameSite=Strict; Path=/api; ${A_YEAR}; Secure`,
    );
  });
});

async function filesIn(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}
