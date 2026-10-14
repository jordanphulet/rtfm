import { afterEach, describe, expect, it, vi } from "vitest";
import { INSTANT_PACE, unrecordedFakeModel } from "../agent/fake-model.ts";
import { fakePlan } from "../agent/planner/fake-planner.ts";
import { scriptedClient, textTurn, toolUseTurn } from "../agent/scripted-client.ts";
import { startServer, type Replaced, type RunningServer } from "../app.ts";
import { config } from "../config.ts";
import type { Gateway } from "../gateway/gateway.ts";
import type { ModelEvent } from "../gateway/types.ts";
import { silentLogger } from "../logging/logger.ts";
import { createFileManualStore } from "../storage/file-manual-store.ts";
import { ADMIN_LIBRARY_ID } from "../storage/library.ts";
import { seedStore } from "../storage/seed.ts";
import {
  capturingLogger, collect, fastFakeWriter, readEvents, SAMPLE_ID, tempDataDir, TEST_MODEL, UNWRITTEN_ID, waitUntil, WRITTEN_ID,
} from "../testing.ts";
import type { SectionWriter } from "../writer/types.ts";
import type { LibrarianEvent, Manual, ManualSummary, SectionEvent, SectionState } from "./types.ts";

vi.setConfig({ testTimeout: 20_000 });

const RECIPIENT_ID = "acme";
/** The header these tests' gate reads a request's library from, in place of the gate that gives every request the admin's. */
const LIBRARY_HEADER = "x-test-library";
const TREEHOUSE_REQUEST = "Let’s start a new manual about building a treehouse";
const TREEHOUSE = fakePlan(TREEHOUSE_REQUEST);
const SECTION_PATH = `/manuals/${SAMPLE_ID}/sections/${UNWRITTEN_ID}`;

const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/**
 * A server whose admin's library and a recipient's are seeded alike on one data folder, with each
 * request put in the library its header names.
 */
async function start(replaced: Replaced = {}) {
  const dataDir = await tempDataDir();
  await seedStore(createFileManualStore(dataDir, silentLogger, RECIPIENT_ID));
  const { logger, entries } = capturingLogger();
  const server = await startServer(
    { ...config, port: 0, dataDir, models: "fake", passcode: undefined },
    {
      writer: fastFakeWriter(),
      librarian: unrecordedFakeModel(INSTANT_PACE),
      logger,
      libraryIdOf: (request) => String(request.headers[LIBRARY_HEADER]),
      ...replaced,
    },
  );
  servers.push(server);
  const base = `http://127.0.0.1:${server.port}/api`;
  return { admin: inLibrary(base, ADMIN_LIBRARY_ID), recipient: inLibrary(base, RECIPIENT_ID), entries };
}

/** The API as a page in the library sees it. */
function inLibrary(base: string, libraryId: string) {
  const api = (path: string, { headers, ...init }: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
    fetch(`${base}${path}`, { ...init, headers: { ...headers, [LIBRARY_HEADER]: libraryId } });
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

describe("two libraries on one server", () => {
  it("keep their manuals apart: one the librarian plans in a library is in no list, URL or librarian of the other", async () => {
    const { admin, recipient } = await start();

    const events = await recipient.ask(TREEHOUSE_REQUEST);

    expect(events).toContainEqual({ event: "action", data: { type: "created", manualId: TREEHOUSE.id } });
    expect(idsOf(await recipient.summaries())).toContain(TREEHOUSE.id);
    expect(idsOf(await admin.summaries())).not.toContain(TREEHOUSE.id);
    expect((await recipient.api(`/manuals/${TREEHOUSE.id}`)).status).toBe(200);
    expect((await admin.api(`/manuals/${TREEHOUSE.id}`)).status).toBe(404);
    expect(replyText(await recipient.ask("What do I have?"))).toMatch(/^You have 8 manuals/);
    expect(replyText(await admin.ask("What do I have?"))).toMatch(/^You have 7 manuals/);
  });

  it("delete a manual from one library alone", async () => {
    const { admin, recipient } = await start();

    expect((await recipient.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(204);

    expect((await recipient.api(`/manuals/${SAMPLE_ID}`)).status).toBe(404);
    expect((await recipient.api(`/manuals/${SAMPLE_ID}/sections/${WRITTEN_ID}`)).status).toBe(404);
    expect(idsOf(await admin.summaries())).toContain(SAMPLE_ID);
    expect((await admin.api(`/manuals/${SAMPLE_ID}/sections/${WRITTEN_ID}`)).status).toBe(200);
  });

  it("write a section in one library alone, saved there and nowhere else", async () => {
    const { admin, recipient } = await start();

    const events = await collect(await recipient.stream());

    expect(events.at(-1)).toEqual({ event: "written", data: {} });
    expect(await recipient.sectionStatus()).toBe("written");
    expect(await admin.sectionStatus()).toBe("unwritten");
    const writtenCount = async (library: typeof admin) =>
      (await library.summaries()).find(({ id }) => id === SAMPLE_ID)?.writtenCount;
    expect({ recipient: await writtenCount(recipient), admin: await writtenCount(admin) }).toEqual({ recipient: 8, admin: 7 });
  });

  it("show a section being written as writing in its own library alone, whose deletes it holds up and no other's", async () => {
    const held = heldWriter();
    const { admin, recipient } = await start({ writer: held.writer });

    const recipientEvents = collect(await recipient.stream());
    await waitUntil(() => held.started() === 1, 10_000);

    expect({ ofSection: await recipient.sectionStatus(), inManual: await recipient.statusInManual() }).toEqual({
      ofSection: "writing",
      inManual: "writing",
    });
    expect({ ofSection: await admin.sectionStatus(), inManual: await admin.statusInManual() }).toEqual({
      ofSection: "unwritten",
      inManual: "unwritten",
    });
    expect((await recipient.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(409);
    expect((await admin.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(204);

    held.finish();
    expect((await recipientEvents).at(-1)).toEqual({ event: "written", data: {} });
    expect(await recipient.sectionStatus()).toBe("written");
    expect(held.started()).toBe(1);
  });

  it("each give the librarian its own manuals alone, so it can't open the other's", async () => {
    const openTheSample = () => [
      toolUseTurn([{ id: "call-1", name: "open_manual", input: { manual_id: SAMPLE_ID } }]),
      textTurn("Done."),
    ];
    const { admin, recipient, entries } = await start({ librarian: scriptedLibrarian([...openTheSample(), ...openTheSample()]) });
    expect((await admin.api(`/manuals/${SAMPLE_ID}`, { method: "DELETE" })).status).toBe(204);

    const inAdmin = await admin.ask("Open the haunted house manual");
    const inRecipient = await recipient.ask("Open the haunted house manual");

    expect(inAdmin.filter(({ event }) => event === "action")).toEqual([]);
    expect(inRecipient).toContainEqual({ event: "action", data: { type: "open", manualId: SAMPLE_ID } });
    expect(entries.filter(({ event }) => event === "agent.tool-failed")).toEqual([
      expect.objectContaining({ tool: "open_manual", libraryId: ADMIN_LIBRARY_ID }),
    ]);
    expect(entries.filter(({ event }) => event === "librarian.reply").map(({ libraryId }) => libraryId)).toEqual([
      ADMIN_LIBRARY_ID,
      RECIPIENT_ID,
    ]);
  });

  it("are out of reach of the test header without the test's libraryIdOf: the gate puts it in the admin's", async () => {
    const { recipient, entries } = await start({ libraryIdOf: undefined });

    await recipient.summaries();
    await waitUntil(() => entries.some(({ event }) => event === "request"), 10_000);

    expect(entries.find(({ event }) => event === "request")).toMatchObject({ libraryId: ADMIN_LIBRARY_ID });
  });

  it("log each request, run, reply and browser report with its library's id", async () => {
    const { admin, recipient, entries } = await start();

    await recipient.summaries();
    await collect(await recipient.stream());
    await recipient.ask("What do I have?");
    expect((await recipient.reportError()).status).toBe(204);
    await admin.summaries();
    await waitUntil(() => entries.filter(({ event }) => event === "request").length === 5, 10_000);

    const libraryIdsOf = (event: string) => entries.filter((entry) => entry.event === event).map(({ libraryId }) => libraryId);
    expect(libraryIdsOf("request").toSorted()).toEqual([...Array(4).fill(RECIPIENT_ID), ADMIN_LIBRARY_ID].toSorted());
    expect(libraryIdsOf("section.started")).toEqual([RECIPIENT_ID]);
    expect(libraryIdsOf("section.finished")).toEqual([RECIPIENT_ID]);
    expect(libraryIdsOf("librarian.reply")).toEqual([RECIPIENT_ID]);
    expect(libraryIdsOf("client.error")).toEqual([RECIPIENT_ID]);
  });
});
