import { manualWithSection } from "./lookup.ts";
import { notFound, type Route } from "./route.ts";
import type { SectionState } from "./types.ts";

export const sectionRoute: Route = {
  method: "GET",
  pattern: "/api/manuals/:manualId/sections/:sectionId",
  async handle({ params: { manualId, sectionId }, library: { store, runs, activity } }) {
    if (!(await manualWithSection(store, manualId, sectionId))) return notFound;

    const status = await runs.statusOf(manualId, sectionId);
    const state: SectionState =
      status === "written" ? { status, body: await store.getBody(manualId, sectionId) } : { status };
    activity.count("sectionsRead");
    return { status: 200, body: state };
  },
};
