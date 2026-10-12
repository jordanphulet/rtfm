import { z } from "zod";
import { librarySummaries } from "../../api/library.ts";
import type { PageAction } from "../../api/types.ts";
import type { Gateway } from "../../gateway/gateway.ts";
import type { ManualStore, StoredManual } from "../../storage/types.ts";
import { defineTool, type AgentTool } from "../tool.ts";
import { createManualTool } from "./create-manual.ts";
import { findManuals } from "./find.ts";

const TOOL_STATUS = {
  list: "Checking the shelves…",
  find: "Searching the shelves…",
  open: "Opening the manual…",
  delete: "Preparing the delete…",
};

/**
 * The librarian's tools. Opening and deleting only hand an action to the page; creating has the
 * planner save a new manual, reporting its progress through `onStatus`.
 */
export function librarianTools({ gateway, store, onStatus, onAction }: {
  gateway: Gateway;
  store: ManualStore;
  onStatus: (text: string) => void;
  onAction: (action: PageAction) => void;
}): AgentTool[] {
  async function manualById(manualId: string): Promise<StoredManual> {
    const manual = await store.getManual(manualId);
    if (!manual) throw new Error(`No manual has the id "${manualId}". Use list_manuals or find_manuals for its id.`);
    return manual;
  }

  return [
    defineTool({
      name: "list_manuals",
      description:
        "Lists every manual in the library, in title order: its id, title, subtitle, and how many of its sections are written out of how many there are. Use it when the user asks what they have, or before choosing a manual when find_manuals isn't enough.",
      input: {},
      status: TOOL_STATUS.list,
      async run() {
        const summaries = await librarySummaries(store);
        if (summaries.length === 0) return "The library is empty.";
        return JSON.stringify(
          summaries.map(({ id, title, subtitle, sectionCount, writtenCount }) => ({
            id,
            title,
            subtitle,
            sections_written: writtenCount,
            sections: sectionCount,
          })),
        );
      },
    }),
    defineTool({
      name: "find_manuals",
      description:
        "Finds the manuals about a topic, best match first, by the words of their titles, subtitles and tables of contents. Returns each match's id, title and subtitle, and up to three of its sections that mention the topic. Use it to work out which manual the user means, or which manual covers a subject. Pass the topic in a few plain words (\"haunted houses\", \"servo motors\"), not the user's whole sentence.",
      input: { topic: z.string().min(1).describe("A few words naming the subject, such as \"birthday parties\".") },
      status: TOOL_STATUS.find,
      async run({ topic }) {
        const matches = findManuals(await store.listManuals(), topic);
        if (matches.length === 0) return `No manual matches "${topic}".`;
        return JSON.stringify(
          matches.map(({ id, title, subtitle, matchingSections }) => ({
            id,
            title,
            subtitle,
            matching_sections: matchingSections,
          })),
        );
      },
    }),
    defineTool({
      name: "open_manual",
      description:
        "Opens a manual in the reader: the page goes to it when your reply has finished. Use it when the user asks to open, read or go to a manual. Get the id from list_manuals or find_manuals first, and write nothing before calling it.",
      input: { manual_id: z.string().min(1).describe("The manual's id, such as \"negotiating-with-geese\".") },
      status: TOOL_STATUS.open,
      async run({ manual_id }) {
        const manual = await manualById(manual_id);
        onAction({ type: "open", manualId: manual.id });
        return JSON.stringify({
          manual: { id: manual.id, title: manual.title },
          result: "The reader opens this manual when your reply has finished. Say so in a few words.",
        });
      },
    }),
    defineTool({
      name: "propose_delete",
      description:
        "Asks the user to confirm deleting one manual. It deletes nothing: when your reply has finished, the page opens its delete confirmation for that manual, and only the user's choice there deletes it or keeps it. Use it only when the user asks to delete a manual, for one manual per reply. Get the id from list_manuals or find_manuals first, and write nothing before calling it.",
      input: { manual_id: z.string().min(1).describe("The manual's id, such as \"negotiating-with-geese\".") },
      status: TOOL_STATUS.delete,
      async run({ manual_id }) {
        const manual = await manualById(manual_id);
        onAction({ type: "propose-delete", manualId: manual.id });
        return JSON.stringify({
          manual: { id: manual.id, title: manual.title },
          result:
            "Nothing is deleted yet. When your reply has finished, the page asks the user to confirm deleting this manual, and only their choice there deletes it. Tell them to confirm or keep it there, and never say it has been deleted.",
        });
      },
    }),
    createManualTool({ gateway, store, onStatus, onAction }),
  ];
}
