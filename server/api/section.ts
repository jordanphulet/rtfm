import type { ManualStore } from "../storage/types.ts";
import type { Runs } from "../writer/runs.ts";
import { manualWithSection } from "./lookup.ts";
import { notFound, type Route } from "./route.ts";
import type { SectionState } from "./types.ts";

export function sectionRoute(store: ManualStore, runs: Runs): Route {
  return {
    method: "GET",
    pattern: "/api/manuals/:manualId/sections/:sectionId",
    async handle({ params: { manualId, sectionId } }) {
      if (!(await manualWithSection(store, manualId, sectionId))) return notFound;

      const status = await runs.statusOf(manualId, sectionId);
      const state: SectionState =
        status === "written" ? { status, body: await store.getBody(manualId, sectionId) } : { status };
      return { status: 200, body: state };
    },
  };
}
