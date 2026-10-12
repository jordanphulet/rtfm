import { fakeLibrarianModel, INSTANT_PACE } from "../agent/librarian/fake-model.ts";
import { sendReply } from "../agent/librarian/reply.ts";
import type { ManualStore } from "../storage/types.ts";
import { chunkEnds, fakeBody } from "../writer/fake.ts";
import type { EventSink, EventStream } from "./route.ts";
import type { LibrarianEvent, LibrarianMessage } from "./types.ts";

export type Preview = { freeze: number } | { fail: "budget" | "error" };

export function previewFrom(query: URLSearchParams): Preview | undefined {
  const fail = query.get("fail");
  if (fail !== null) return { fail: fail === "budget" ? "budget" : "error" };
  const freeze = query.get("freeze");
  if (freeze !== null) return { freeze: Number(freeze) };
  return undefined;
}

export function wantsEmptyLibrary(query: URLSearchParams): boolean {
  return query.get("library") === "empty";
}

export function previewStream(preview: Preview, manualId: string, sectionId: string): EventStream {
  return async (sink) => {
    if ("fail" in preview) sink.send("failed", { reason: preview.fail });
    else sendFrozen(sink, await fakeBody(manualId, sectionId), preview.freeze);
  };
}

/** The last chunk end at or before that fraction of the text. */
function cutAt(text: string, fraction: number): number {
  return chunkEnds(text).findLast((end) => end <= fraction * text.length) ?? 0;
}

function sendFrozen(sink: EventSink, body: string, fraction: number) {
  const cut = cutAt(body, fraction);
  if (cut > 0) sink.send("append", { at: 0, text: body.slice(0, cut), progress: cut / body.length });
  sink.send("frozen", {});
}

/** `?freeze=<0–1>` as a number; NaN when it is there but isn't a number from 0 to 1. */
export function previewFraction(query: URLSearchParams): number | undefined {
  const freeze = query.get("freeze");
  if (freeze === null) return undefined;
  const fraction = freeze.trim() === "" ? NaN : Number(freeze);
  return fraction >= 0 && fraction <= 1 ? fraction : NaN;
}

/**
 * The scripted fake model's reply to the conversation, whatever model is configured, played at
 * once and cut at the last chunk end at or before the fraction: the statuses and text up to the
 * cut, then `frozen`, or `done` when nothing was cut. Page actions are never sent.
 */
export function librarianPreview(store: ManualStore, conversation: LibrarianMessage[], fraction: number): EventStream {
  return async (sink) => {
    const events: LibrarianEvent[] = [];
    await sendReply({
      gateway: fakeLibrarianModel(INSTANT_PACE),
      store,
      conversation,
      signal: new AbortController().signal,
      send: (event) => events.push(event),
    });
    sendCutReply(sink, events, fraction);
  };
}

function sendCutReply(sink: EventSink, events: LibrarianEvent[], fraction: number) {
  const text = events.map((event) => (event.event === "text" ? event.data.text : "")).join("");
  const cut = cutAt(text, fraction);
  let position = 0;
  for (const event of events) {
    if (event.event === "status" && position <= cut) sink.send(event.event, event.data);
    if (event.event !== "text") continue;
    const shown = event.data.text.slice(0, Math.max(0, cut - position));
    if (shown !== "") sink.send("text", { text: shown });
    position += event.data.text.length;
  }
  sink.send(cut === text.length ? "done" : "frozen", {});
}
