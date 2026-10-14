import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTANT_PACE, unrecordedFakeModel } from "../agent/fake-model.ts";
import { fakePlan } from "../agent/planner/fake-planner.ts";
import { scriptedClient, textTurn, toolUseTurn } from "../agent/scripted-client.ts";
import { startServer, type Replaced, type RunningServer } from "../app.ts";
import { config } from "../config.ts";
import type { Gateway } from "../gateway/gateway.ts";
import type { ModelEvent } from "../gateway/types.ts";
import { createFileLinkStore } from "../storage/file-link-store.ts";
import { makeLibrarySecret } from "../storage/library-links.ts";
import { ADMIN_LIBRARY_ID } from "../storage/library.ts";
import {
  capturingLogger, collect, cookiesSet, createTestLink, fastFakeWriter, readEvents, SAMPLE_ID, tempDataDir, TEST_MODEL, UNWRITTEN_ID,
  waitUntil, WRITTEN_ID,
} from "../testing.ts";
import type { SectionWriter } from "../writer/types.ts";
import type { LibrarianEvent, Manual, ManualSummary, SectionEvent, SectionState } from "./types.ts";

vi.setConfig({ testTimeout: 20_000 });

const ACME = "acme";
const GLOBEX = "globex";
const TREEHOUSE_REQUEST = "Let’s start a new manual about building a treehouse";
const TREEHOUSE = fakePlan(TREEHOUSE_REQUEST);
const SECTION_PATH = `/manuals/${SAMPLE_ID}/sections/${UNWRITTEN_ID}`;

const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/**
 * A server on loopback with no passcode, and two recipients' libraries opened by their links, as
 * their pages open them; a request with no cookie is the admin's.
 */
async function start(replaced: Replaced = {}) {
  const dataDir = await tempDataDir();
  const links = createFileLinkStore(dataDir);
  const secrets = { acme: await createTestLink(links, ACME), globex: await createTestLink(links, GLOBEX) };
  const { logger, entries } = capturingLogger();
  const server = await startServer(
    { ...config, port: 0, dataDir, models: "fake", passcode: undefined },
    { writer: fastFakeWriter(), librarian: unrecordedFakeModel(INSTANT_PACE), logger, ...replaced },
  );
  servers.push(server);
  const base = `http://127.0.0.1:${server.port}/api`;
  return {
    base,
    admin: inLibrary(base),
    acme: inLibrary(base, await openLink(base, secrets.acme)),
    globex: inLibrary(base, await openLink(base, secrets.globex)),
    secrets,
    entries,
  };
}

/** Opens the library a link's secret opens, as the link page does, giving the cookie it sets. */
async function openLink(base: string, secret: string): Promise<string> {
  const opened = await fetch(`${base}/link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  expect(opened.status).toBe(204);
  return cookiesSet(opened).rtfm_library!;
}

/** The API as a page in the library sees it: with the library's cookie, or none for the admin's. */
function inLibrary(base: string, cookie?: string) {
  const api = (path: string, { headers, ...init }: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
    fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(cookie ? { cookie } : {}) } });
  const json = async <T>(path: string): Promise<T> => {
    const response = await api(path);
    expect(response.status, path).toBe(200);
    return (await response.json()) as T;
  };
  const post = (path: string, body: unknown) =>
    api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return {
    api,
    summaries: () => json<ManualSummary[]>("/manuals"),
    sectionStatus: async () => (await json<SectionState>(SECTION_PATH)).status,
    statusInManual: async () => {
      const manual = await json<Manual>(`/manuals/${SAMPLE_ID}`);
      return manual.chapters.flatMap(({ sections }) => sections).find(({ id }) => id === UNWRITTEN_ID)?.status;
    },
    stream: async () => readEvents<SectionEvent>(await api(`${SECTION_PATH}/stream`)),
    ask: async (text: string) => collect(readEvents<LibrarianEvent>(await post("/librarian", { messages: [{ role: "user", text }] }))),
    reportError: () => post("/client-errors", { kind: "rejection", page: "/", message: "Failed to fetch" }),
  };
}

/** A writer that sends a first chunk, then holds every section until `finish` is called. */
function heldWriter() {
  let finish = () => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));
  let started = 0;
  const writer: SectionWriter = {
    async *write() {
      started++;
      yield { text: "One ", progress: 0.5 };
      await finished;
      yield { text: "two.", progress: 1 };
    },
  };
  return { writer, finish, started: () => started };
}

/** A librarian that plays these turns, one per model call, whichever library calls it. */
function scriptedLibrarian(turns: ModelEvent[][]): Gateway {
  const { client } = scriptedClient(turns);
  return { stream: (job, prompt, signal) => client.stream({ job, model: TEST_MODEL, maxTokens: 0, prompt, signal }) };
}

function replyText(events: LibrarianEvent[]): string {
  return events.map((event) => (event.event === "text" ? event.data.text : "")).join("");
}

const idsOf = (summaries: ManualSummary[]) => summaries.map(({ id }) => id);

describe("libraries opened by their links on one server", () => {
  it("keep their manuals apart: one the librarian plans in a library is in no list, URL or librarian of another", async () => {
    const { admin, acme, globex } = await start();

    const events = await acme.ask(TREEHOUSE_REQUEST);

    expect(events).toContainEqual({ event: "action", data: { type: "created", manualId: TREEHOUSE.id } });
    expect(idsOf(await acme.summaries())).toContain(TREEHOUSE.id);
    for (const other of [globex, admin]) {
      expect(idsOf(await other.summaries())).not.toContain(TREEHOUSE.id);
      expect((await other.api(`/manuals/${TREEHOUSE.id}`)).status).toBe(404);
    }
    expect((await acme.api(`/manuals/${TREEHOUSE.id}`)).status).toBe(200);
    expect(replyText(await acme.ask("What do I have?"))).toMatch(/^You have 3 manuals/);
    expect(replyText(await globex.ask("What do I have?"))).toMatch(/^You have 2 manuals/);
    expect(replyText(await admin.ask("What do I have?"))).toMatch(/^You have 7 manuals/);
  });

  it("delete a manual from one library alone", async () => {
    const { admin, acme, globex } = await start();

    expect((await acme.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(204);

    expect((await acme.api(`/manuals/${SAMPLE_ID}`)).status).toBe(404);
    expect((await acme.api(`/manuals/${SAMPLE_ID}/sections/${WRITTEN_ID}`)).status).toBe(404);
    expect(idsOf(await globex.summaries())).toContain(SAMPLE_ID);
    expect((await globex.api(`/manuals/${SAMPLE_ID}/sections/${WRITTEN_ID}`)).status).toBe(200);
    expect((await admin.api(`/manuals/${SAMPLE_ID}/sections/${WRITTEN_ID}`)).status).toBe(200);
  });

  it("write a section in one library alone, saved there and nowhere else", async () => {
    const { admin, acme, globex } = await start();

    const events = await collect(await acme.stream());

    expect(events.at(-1)).toEqual({ event: "written", data: {} });
    expect(await acme.sectionStatus()).toBe("written");
    expect(await globex.sectionStatus()).toBe("unwritten");
    expect(await admin.sectionStatus()).toBe("unwritten");
    const writtenCount = async (library: typeof admin) =>
      (await library.summaries()).find(({ id }) => id === SAMPLE_ID)?.writtenCount;
    expect({ acme: await writtenCount(acme), globex: await writtenCount(globex), admin: await writtenCount(admin) }).toEqual({
      acme: 1,
      globex: 0,
      admin: 7,
    });
  });

  it("show a section being written as writing in its own library alone, whose deletes it holds up and no other's", async () => {
    const held = heldWriter();
    const { acme, globex } = await start({ writer: held.writer });

    const acmeEvents = collect(await acme.stream());
    await waitUntil(() => held.started() === 1, 10_000);

    expect({ ofSection: await acme.sectionStatus(), inManual: await acme.statusInManual() }).toEqual({
      ofSection: "writing",
      inManual: "writing",
    });
    expect({ ofSection: await globex.sectionStatus(), inManual: await globex.statusInManual() }).toEqual({
      ofSection: "unwritten",
      inManual: "unwritten",
    });
    expect((await acme.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(409);
    expect((await globex.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(204);

    held.finish();
    expect((await acmeEvents).at(-1)).toEqual({ event: "written", data: {} });
    expect(await acme.sectionStatus()).toBe("written");
    expect(held.started()).toBe(1);
  });

  it("each give the librarian its own manuals alone, so it can't open another's", async () => {
    const openTheSample = () => [
      toolUseTurn([{ id: "call-1", name: "open_manual", input: { manual_id: SAMPLE_ID } }]),
      textTurn("Done."),
    ];
    const { admin, acme, entries } = await start({ librarian: scriptedLibrarian([...openTheSample(), ...openTheSample()]) });
    expect((await admin.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(204);

    const inAdmin = await admin.ask("Open the haunted house manual");
    const inAcme = await acme.ask("Open the haunted house manual");

    expect(inAdmin.filter(({ event }) => event === "action")).toEqual([]);
    expect(inAcme).toContainEqual({ event: "action", data: { type: "open", manualId: SAMPLE_ID } });
    expect(entries.filter(({ event }) => event === "agent.tool-failed")).toEqual([
      expect.objectContaining({ tool: "open_manual", libraryId: ADMIN_LIBRARY_ID }),
    ]);
    expect(entries.filter(({ event }) => event === "librarian.reply").map(({ libraryId }) => libraryId)).toEqual([
      ADMIN_LIBRARY_ID,
      ACME,
    ]);
  });

  it("are reached by no other cookie: one of another form, or a secret that opens no link, is no cookie", async () => {
    const { base, secrets } = await start();

    for (const cookie of [`rtfm_library=${makeLibrarySecret()}`, `rtfm_library=${ACME}`, `library=${secrets.acme}`]) {
      const ids = idsOf(await inLibrary(base, cookie).summaries());
      expect(ids, cookie).toHaveLength(7);
    }
  });

  it("log each request, run, reply and browser report with its library's id", async () => {
    const { admin, acme, entries } = await start();
    await waitUntil(() => entries.filter(({ event }) => event === "request").length === 2, 10_000);

    await acme.summaries();
    await collect(await acme.stream());
    await acme.ask("What do I have?");
    expect((await acme.reportError()).status).toBe(204);
    await admin.summaries();
    await waitUntil(() => entries.filter(({ event }) => event === "request").length === 7, 10_000);

    const libraryIdsOf = (event: string) => entries.filter((entry) => entry.event === event).map(({ libraryId }) => libraryId);
    expect(libraryIdsOf("request").slice(2).toSorted()).toEqual([...Array(4).fill(ACME), ADMIN_LIBRARY_ID].toSorted());
    expect(libraryIdsOf("section.started")).toEqual([ACME]);
    expect(libraryIdsOf("section.finished")).toEqual([ACME]);
    expect(libraryIdsOf("librarian.reply")).toEqual([ACME]);
    expect(libraryIdsOf("client.error")).toEqual([ACME]);
  });
});
