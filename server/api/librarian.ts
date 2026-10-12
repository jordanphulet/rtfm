import { z } from "zod";
import { sendReply } from "../agent/librarian/reply.ts";
import type { Gateway } from "../gateway/gateway.ts";
import type { ManualStore } from "../storage/types.ts";
import { librarianPreview, previewFraction } from "./preview.ts";
import { badRequest, type Route } from "./route.ts";
import { LIBRARIAN_LIMITS, type LibrarianEvent, type LibrarianMessage } from "./types.ts";

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "agent"]),
        text: z.string().trim().min(1).max(LIBRARIAN_LIMITS.messageCharacters),
      }),
    )
    .min(1)
    .max(LIBRARIAN_LIMITS.earlierExchanges * 2 + 1),
});

/** POST /api/librarian: the conversation so far, ending with the user's message; the reply streams back. */
export function librarianRoute(store: ManualStore, gateway: Gateway): Route {
  return {
    method: "POST",
    pattern: "/api/librarian",
    async handle({ body, query, signal }) {
      const conversation = conversationFrom(body);
      if (!conversation) return badRequest;
      const freeze = previewFraction(query);
      if (Number.isNaN(freeze)) return badRequest;
      if (freeze !== undefined) return librarianPreview(store, conversation, freeze);
      return (sink) =>
        sendReply({
          gateway,
          store,
          conversation,
          signal,
          send: ({ event, data }: LibrarianEvent) => sink.send(event, data),
        });
    },
  };
}

/** The messages, if they alternate from the user's and end with the user's. */
function conversationFrom(body: unknown): LibrarianMessage[] | undefined {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const { messages } = parsed.data;
  const alternates = messages.every(({ role }, index) => role === (index % 2 === 0 ? "user" : "agent"));
  return alternates && messages.length % 2 === 1 ? messages : undefined;
}
