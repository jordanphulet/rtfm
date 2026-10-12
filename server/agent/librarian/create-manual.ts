import { z } from "zod";
import { defineTool, type AgentTool } from "../tool.ts";

const CREATE_STATUS = "Planning a manual…";

/** Creating manuals isn't available: the tool says so, and the librarian tells the user. */
export function createManualTool(): AgentTool {
  return defineTool({
    name: "create_manual",
    description:
      "Creates a new manual from the user's request: its title, voice and table of contents. Use it when the user asks for a new manual, passing what they asked for.",
    input: { request: z.string().min(1).describe("What the new manual should be about, in the user's words.") },
    status: CREATE_STATUS,
    async run() {
      return "Creating manuals isn't available yet, so nothing was created. Tell the user plainly that you can't create new manuals yet, and offer what you can do instead.";
    },
  });
}
