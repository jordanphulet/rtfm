import type { ManualStore } from "../../server/storage/types.ts";
import type { ToolDefinition } from "./gateway/types.ts";

export const LIST_MANUALS: ToolDefinition = {
  name: "list_manuals",
  description: "Lists every manual in the library with its id, title and subtitle.",
  input_schema: { type: "object", properties: {} },
};

export const LIST_MANUALS_STATUS = "Looking through the library…";

export async function listManuals(store: ManualStore): Promise<string> {
  const manuals = await store.listManuals();
  return JSON.stringify(manuals.map(({ id, title, subtitle }) => ({ id, title, subtitle })));
}
