import { z } from "zod";
import { sendReply } from "../agent/librarian/reply.ts";
import type { Logger, LogMethod } from "../logging/logger.ts";
import { librarianPreview, previewFraction } from "./preview.ts";
import { badRequest, type Route } from "./route.ts";
import { LIBRARIAN_LIMITS, type LibrarianEvent, type LibrarianMessage } from "./types.ts";

const messageText = z.string().trim().min(1).max(LIBRARIAN_LIMITS.messageCharacters);

const requestSchema = z.object({
  messages: z
    .array(
      z.discriminatedUnion("role", [
        z.strictObject({ role: z.literal("user"), text: messageText }),
        z.strictObject({ role: z.literal("agent"), text: messageText, deleteOutcome: z.enum(["kept", "deleted"]).optional() }),
      ]),
    )
    .min(1)
    .max(LIBRARIAN_LIMITS.earlierExchanges * 2 + 1),
});

/**
 * POST /api/librarian: the conversation so far, ending with the user's message; the reply streams
 * back, from the librarian and planner acting on the request's library alone. Each reply counts
 * one message from the library's reader; a preview counts none.
 */
export function librarianRoute(logger: Logger): Route {
  return {
    method: "POST",
    pattern: "/api/librarian",
    async handle({ body, query, signal, library }) {
      const conversation = conversationFrom(body);
      if (!conversation) return badRequest;
      const freeze = previewFraction(query);
      if (Number.isNaN(freeze)) return badRequest;
      if (freeze !== undefined) return librarianPreview(library.store, conversation, freeze);
      library.activity.count("librarianMessages");
      return (sink) =>
        sendReply({
          gateway: library.gateway,
          store: library.store,
          conversation,
          signal,
          send: ({ event, data }: LibrarianEvent) => sink.send(event, data),
          logger: withLibraryId(logger, library.libraryId),
        });
    },
  };
}

/** The logger with the library's id on every line, so the reply's and its tools' lines say which library. */
function withLibraryId(logger: Logger, libraryId: string): Logger {
  const withId =
    (log: LogMethod): LogMethod =>
    (event, message, fields, error) =>
      log(event, message, { libraryId, ...fields }, error);
  return { info: withId(logger.info), warn: withId(logger.warn), error: withId(logger.error) };
}

/** The messages, if they alternate from the user's and end with the user's. */
function conversationFrom(body: unknown): LibrarianMessage[] | undefined {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const { messages } = parsed.data;
  const alternates = messages.every(({ role }, index) => role === (index % 2 === 0 ? "user" : "agent"));
  return alternates && messages.length % 2 === 1 ? messages : undefined;
}
