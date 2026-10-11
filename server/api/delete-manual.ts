import type { ManualStore } from "../storage/types.ts";
import type { Runs } from "../writer/runs.ts";
import { noContent, notFound, type Route } from "./route.ts";

export function deleteManualRoute(store: ManualStore, runs: Runs): Route {
  return {
    method: "DELETE",
    pattern: "/api/manuals/:manualId",
    async handle({ params: { manualId } }) {
      if (!(await store.getManual(manualId))) return notFound;
      if (runs.isWriting(manualId)) {
        return { status: 409, body: { error: "A section of this manual is being written" } };
      }
      await store.deleteManual(manualId);
      return noContent;
    },
  };
}
