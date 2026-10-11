import { afterEach, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../app.ts";
import type { ServerConfig } from "../config.ts";
import { readSeedBody } from "../storage/seed.ts";
import { recordingWriter, SAMPLE_ID, tempDataDir, UNWRITTEN_ID, waitUntil, WRITTEN_ID } from "../testing.ts";
import type { SectionWriter } from "../writer/types.ts";
import type { Manual, SectionEvent, SectionState } from "./types.ts";

const servers: RunningServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start(writer: SectionWriter = recordingWriter(), dataDir?: string) {
  const config: ServerConfig = {
    port: 0,
    dataDir: dataDir ?? (await tempDataDir()),
    writer: "fake",
    maxConcurrentRuns: 3,
  };
  const server = await startServer(config, writer);
  servers.push(server);
  const base = `http://localhost:${server.port}/api/manuals/${SAMPLE_ID}`;
  return { server, config, base };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function* readEvents(response: Response): AsyncGenerator<SectionEvent> {
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  let buffer = "";
  for await (const chunk of response.body!.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const [, event] = block.match(/^event: (.*)$/m)!;
      const [, data] = block.match(/^data: (.*)$/m)!;
      yield { event, data: JSON.parse(data) } as SectionEvent;
    }
  }
}

async function streamAll(url: string): Promise<SectionEvent[]> {
  const events: SectionEvent[] = [];
  for await (const event of readEvents(await fetch(url))) events.push(event);
  return events;
}

function textOf(events: SectionEvent[]): string {
  let text = "";
  for (const event of events) {
    if (event.event === "append") text = text.slice(0, event.data.at) + event.data.text;
  }
  return text;
}

describe("the API", () => {
  it("serves the manual with live statuses and without voice or bodies", async () => {
    const { base } = await start();
    const manual = await getJson<Manual>(base);
    const sections = [...manual.chapters, ...manual.appendices].flatMap((chapter) => chapter.sections);

    expect(manual).not.toHaveProperty("voice");
    expect(sections).toHaveLength(18);
    expect(sections.filter((section) => section.status === "written")).toHaveLength(7);
    expect(sections.every((section) => !("body" in section))).toBe(true);
  });

  it("answers 404 for unknown manuals, sections and paths", async () => {
    const { server, base } = await start();
    const urls = [
      `http://localhost:${server.port}/api/manuals/no-such-manual`,
      `http://localhost:${server.port}/api/manuals/..%2F..`,
      `http://localhost:${server.port}/api/manuals/%E0%A4%A`,
      `${base}/sections/no-such-section`,
      `${base}/sections/no-such-section/stream`,
      `http://localhost:${server.port}/api/elsewhere`,
    ];
    for (const url of urls) expect((await fetch(url)).status, url).toBe(404);
  });

  it("gives a written section's body and an unwritten section's status", async () => {
    const { base } = await start();
    expect(await getJson<SectionState>(`${base}/sections/${WRITTEN_ID}`)).toEqual({
      status: "written",
      body: await readSeedBody(SAMPLE_ID, WRITTEN_ID),
    });
    expect(await getJson<SectionState>(`${base}/sections/${UNWRITTEN_ID}`)).toEqual({ status: "unwritten" });
  });

  it("streams an unwritten section, then serves it as written", async () => {
    const { base } = await start();
    const events = await streamAll(`${base}/sections/${UNWRITTEN_ID}/stream`);
    const body = await readSeedBody(SAMPLE_ID, UNWRITTEN_ID);

    expect(events.at(-1)).toEqual({ event: "written", data: {} });
    expect(events.filter((event) => event.event === "append").length).toBeGreaterThan(10);
    expect(textOf(events)).toBe(body);
    expect(await getJson<SectionState>(`${base}/sections/${UNWRITTEN_ID}`)).toEqual({ status: "written", body });
  });

  it("streams a written section as one append", async () => {
    const { base } = await start();
    const events = await streamAll(`${base}/sections/${WRITTEN_ID}/stream`);
    expect(events).toEqual([
      { event: "append", data: { at: 0, text: await readSeedBody(SAMPLE_ID, WRITTEN_ID), progress: 1 } },
      { event: "written", data: {} },
    ]);
  });

  it("starts one writer when two streams open a section at the same moment", async () => {
    const writer = recordingWriter();
    const { base } = await start(writer);
    const url = `${base}/sections/${UNWRITTEN_ID}/stream`;
    const [first, second] = await Promise.all([streamAll(url), streamAll(url)]);

    expect(writer.signals).toHaveLength(1);
    expect(textOf(first)).toBe(await readSeedBody(SAMPLE_ID, UNWRITTEN_ID));
    expect(textOf(second)).toBe(textOf(first));
  });

  it("lets a second stream join a section being written", async () => {
    const writer = recordingWriter();
    const { base } = await start(writer);
    const url = `${base}/sections/${UNWRITTEN_ID}/stream`;

    const firstEvents: SectionEvent[] = [];
    const firstDone = (async () => {
      for await (const event of readEvents(await fetch(url))) firstEvents.push(event);
    })();
    await waitUntil(() => firstEvents.length >= 3);
    const manual = await getJson<Manual>(base);
    const joinerEvents = await streamAll(url);
    await firstDone;

    const section = manual.chapters.flatMap((chapter) => chapter.sections).find((s) => s.id === UNWRITTEN_ID);
    expect(section?.status).toBe("writing");
    expect(writer.signals).toHaveLength(1);
    expect(joinerEvents[0]).toMatchObject({ event: "append", data: { at: 0 } });
    expect(joinerEvents[0].event === "append" && joinerEvents[0].data.text.length).toBeGreaterThan(20);
    expect(textOf(joinerEvents)).toBe(textOf(firstEvents));
  });

  it("stops writing and stores nothing when the only reader disconnects", async () => {
    const writer = recordingWriter();
    const { base } = await start(writer);
    const controller = new AbortController();
    const response = await fetch(`${base}/sections/${UNWRITTEN_ID}/stream`, { signal: controller.signal });

    let appends = 0;
    await expect(
      (async () => {
        for await (const event of readEvents(response)) {
          if (event.event === "append") appends += 1;
          if (appends === 2) controller.abort();
        }
      })(),
    ).rejects.toThrow(/abort/i);

    await waitUntil(() => writer.signals[0].aborted);
    expect(await getJson<SectionState>(`${base}/sections/${UNWRITTEN_ID}`)).toEqual({ status: "unwritten" });
  });

  it("keeps a written section after a restart", async () => {
    const dataDir = await tempDataDir();
    const first = await start(recordingWriter(), dataDir);
    await streamAll(`${first.base}/sections/${UNWRITTEN_ID}/stream`);
    await first.server.close();

    const writer = recordingWriter();
    const second = await start(writer, dataDir);
    expect(await getJson<SectionState>(`${second.base}/sections/${UNWRITTEN_ID}`)).toEqual({
      status: "written",
      body: await readSeedBody(SAMPLE_ID, UNWRITTEN_ID),
    });
    expect(writer.signals).toHaveLength(0);
  });

  describe("previews", () => {
    it("freezes an unwritten section part-way, without a writer", async () => {
      const writer = recordingWriter();
      const { base } = await start(writer);
      const events = await streamAll(`${base}/sections/${UNWRITTEN_ID}/stream?freeze=0.5`);
      const body = (await readSeedBody(SAMPLE_ID, UNWRITTEN_ID))!;

      expect(events.map((event) => event.event)).toEqual(["append", "frozen"]);
      const append = events[0] as Extract<SectionEvent, { event: "append" }>;
      expect(body.startsWith(append.data.text)).toBe(true);
      expect(append.data.text.length).toBeLessThanOrEqual(body.length / 2);
      expect(append.data.text.length).toBeGreaterThan(body.length / 2 - 40);
      expect(append.data.progress).toBe(append.data.text.length / body.length);
      expect(writer.signals).toHaveLength(0);
      expect(await getJson<SectionState>(`${base}/sections/${UNWRITTEN_ID}`)).toEqual({ status: "unwritten" });
    });

    it("freezes at 0 with no text", async () => {
      const { base } = await start();
      expect(await streamAll(`${base}/sections/${UNWRITTEN_ID}/stream?freeze=0`)).toEqual([
        { event: "frozen", data: {} },
      ]);
    });

    it("fails with the reason asked for", async () => {
      const { base } = await start();
      expect(await streamAll(`${base}/sections/${UNWRITTEN_ID}/stream?fail=budget`)).toEqual([
        { event: "failed", data: { reason: "budget" } },
      ]);
      expect(await streamAll(`${base}/sections/${UNWRITTEN_ID}/stream?fail=error`)).toEqual([
        { event: "failed", data: { reason: "error" } },
      ]);
    });

    it("leaves written sections alone", async () => {
      const { base } = await start();
      const events = await streamAll(`${base}/sections/${WRITTEN_ID}/stream?fail=budget`);
      expect(events.map((event) => event.event)).toEqual(["append", "written"]);
    });
  });
});
