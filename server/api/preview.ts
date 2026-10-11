import { chunkEnds, fakeBody } from "../writer/fake.ts";
import type { EventSink, EventStream } from "./route.ts";

export type Preview = { freeze: number } | { fail: "budget" | "error" };

export function previewFrom(query: URLSearchParams): Preview | undefined {
  const fail = query.get("fail");
  if (fail !== null) return { fail: fail === "budget" ? "budget" : "error" };
  const freeze = query.get("freeze");
  if (freeze !== null) return { freeze: Number(freeze) };
  return undefined;
}

export function previewStream(preview: Preview, manualId: string, sectionId: string): EventStream {
  return async (sink) => {
    if ("fail" in preview) sink.send("failed", { reason: preview.fail });
    else sendFrozen(sink, await fakeBody(manualId, sectionId), preview.freeze);
  };
}

function sendFrozen(sink: EventSink, body: string, fraction: number) {
  const cut = chunkEnds(body).findLast((end) => end <= fraction * body.length) ?? 0;
  if (cut > 0) sink.send("append", { at: 0, text: body.slice(0, cut), progress: cut / body.length });
  sink.send("frozen", {});
}
