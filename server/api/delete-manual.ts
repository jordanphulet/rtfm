import type { ManualStore } from "../storage/types.ts";
import type { Runs } from "../writer/runs.ts";
import { noContent, notFound, type JsonResponse, type Route } from "./route.ts";

const beingWritten: JsonResponse = { status: 409, body: { error: "A section of this manual is being written" } };

export function deleteManualRoute(store: ManualStore, runs: Runs): Route {
  return {
    method: "DELETE",
    pattern: "/api/manuals/:manualId",
    async handle({ params: { manualId } }) {
      if (!(await store.getManual(manualId))) return notFound;
      if (await runs.isWriting(manualId)) return beingWritten;
      if ((await store.deleteManual(manualId)) === "writing") return beingWritten;
      return noContent;
    },
  };
}
