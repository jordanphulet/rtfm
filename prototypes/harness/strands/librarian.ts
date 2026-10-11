import { Agent, tool, type AgentStreamEvent } from "@strands-agents/sdk";
import type { ManualStore } from "../../../server/storage/types.ts";
import type { Gateway } from "../gateway/gateway.ts";
import { LIST_MANUALS, LIST_MANUALS_STATUS, listManuals } from "../library-tool.ts";
import { GatewayModel } from "./gateway-model.ts";

export type LibrarianEvent = { type: "status"; text: string } | { type: "text"; text: string };

const STATUS_BY_TOOL: Record<string, string> = { [LIST_MANUALS.name]: LIST_MANUALS_STATUS };

export function createLibrarian({ gateway, store, system }: { gateway: Gateway; store: ManualStore; system: string }) {
  return new Agent({
    model: new GatewayModel(gateway, "librarian"),
    systemPrompt: system,
    tools: [
      tool({
        name: LIST_MANUALS.name,
        description: LIST_MANUALS.description,
        inputSchema: { type: "object", properties: {} },
        callback: () => listManuals(store),
      }),
    ],
    printer: false,
    retryStrategy: null,
    sandbox: false,
  });
}

export function librarianEvent(event: AgentStreamEvent): LibrarianEvent | undefined {
  if (event.type === "beforeToolCallEvent") {
    const status = STATUS_BY_TOOL[event.toolUse.name];
    return status ? { type: "status", text: status } : undefined;
  }
  if (event.type === "modelStreamUpdateEvent" && event.event.type === "modelContentBlockDeltaEvent") {
    const { delta } = event.event;
    return delta.type === "textDelta" ? { type: "text", text: delta.text } : undefined;
  }
  return undefined;
}
