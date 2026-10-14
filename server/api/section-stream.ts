import type { StoredManual } from "../storage/types.ts";
import type { Runs } from "../writer/runs.ts";
import { manualWithSection } from "./lookup.ts";
import { badRequest, notFound, type EventSink, type Route } from "./route.ts";
import { previewFrom, previewStream } from "./preview.ts";

export const sectionStreamRoute: Route = {
  method: "GET",
  pattern: "/api/manuals/:manualId/sections/:sectionId/stream",
  async handle({ params: { manualId, sectionId }, query, signal, library: { store, runs } }) {
    const manual = await manualWithSection(store, manualId, sectionId);
    if (!manual) return notFound;

    const preview = previewFrom(query);
    if (preview === "invalid") return badRequest;
    if (preview && (await runs.statusOf(manualId, sectionId)) !== "written") {
      return previewStream(preview, manualId, sectionId);
    }
    return (sink) => followRun(runs, manual, sectionId, signal, sink);
  },
};

async function followRun(runs: Runs, manual: StoredManual, sectionId: string, signal: AbortSignal, sink: EventSink) {
  let finish = () => {};
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const leave = await runs.join(manual, sectionId, (event) => {
    sink.send(event.event, event.data);
    if (event.event !== "append") finish();
  });
  signal.addEventListener("abort", finish);
  if (signal.aborted) finish();
  await finished;
  signal.removeEventListener("abort", finish);
  leave();
}
