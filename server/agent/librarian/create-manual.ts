import { z } from "zod";
import type { PageAction } from "../../api/types.ts";
import type { Gateway } from "../../gateway/gateway.ts";
import { sectionsInReadingOrder } from "../../storage/manual.ts";
import type { ManualStore } from "../../storage/types.ts";
import { planManual } from "../planner/plan.ts";
import { defineTool, type AgentTool } from "../tool.ts";

const CREATE_STATUS = "Planning a manual…";
export const ONE_PER_REPLY = "Only one manual per reply; nothing was created.";

/**
 * Hands the user's request to the planner, which has Claude plan the manual and saves it. A saved
 * manual is announced to the page at once, so the library shows it. The tools are built for each
 * reply, so a reply plans at most one manual: a second call is refused without a model call.
 */
export function createManualTool({ gateway, store, onStatus, onAction }: {
  gateway: Gateway;
  store: ManualStore;
  onStatus: (text: string) => void;
  onAction: (action: PageAction) => void;
}): AgentTool {
  let attempted = false;
  return defineTool({
    name: "create_manual",
    description:
      "Creates a new manual from the user's request: a planner writes its title, author's voice and table of contents, and saves it in the library with no sections written yet. It takes about half a minute. Use it when the user asks for a new manual, at most once per reply, passing what they asked for in their own words, with anything they said about it earlier. If they haven't said what it should be about, ask first. Once it is saved, give its title and offer to open it, but don't open it in the same reply. If it fails, say so plainly.",
    input: { request: z.string().min(1).describe("What the new manual should be about, in the user's words.") },
    status: CREATE_STATUS,
    async run({ request }, signal) {
      if (attempted) throw new Error(ONE_PER_REPLY);
      attempted = true;
      const result = await planManual({ gateway, store, request, signal, onStatus });
      if ("problems" in result) {
        return JSON.stringify({
          result:
            "Nothing was created: the plan failed its checks twice. Tell the user plainly that the manual couldn't be created, and that they can ask again.",
        });
      }
      const { manual } = result;
      onAction({ type: "created", manualId: manual.id });
      return JSON.stringify({
        manual: {
          id: manual.id,
          title: manual.title,
          subtitle: manual.subtitle,
          chapters: manual.chapters.length + manual.appendices.length,
          sections: sectionsInReadingOrder(manual).length,
        },
        result:
          "The manual is saved, and the library beside you now shows it. Give its title in a sentence and offer to open it. Don't open it unless the user asks.",
      });
    },
  });
}
