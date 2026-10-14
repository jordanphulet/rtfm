import { z } from "zod";
import type { Logger } from "../logging/logger.ts";
import { badRequest, noContent, type JsonResponse, type Route } from "./route.ts";
import type { ClientErrorReport } from "./types.ts";

/** Reports logged per UTC hour, so a page that fails in a loop can't fill the disk. */
export const CLIENT_ERRORS_PER_HOUR = 60;

/** An API path as the page requests it: printable ASCII, since the page encodes ids. */
const API_PATH = /^\/api\/[!-~]*$/;

const tooMany: JsonResponse = { status: 429, body: { error: "Too many reports" } };

/** A string from the browser, cut to at most `max` characters rather than refused. */
const text = (max: number) => z.string().transform((value) => value.slice(0, max));

const reportSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.enum(["error", "rejection"]),
    page: text(300),
    name: text(100).optional(),
    message: text(1000),
    stack: text(4000).optional(),
  }),
  z.strictObject({
    kind: z.literal("request"),
    page: text(300),
    method: z.enum(["GET", "POST", "DELETE"]),
    path: z.string().regex(API_PATH).transform((value) => value.slice(0, 300)),
    status: z.number().int().min(100).max(599).optional(),
  }),
]);

class BrowserError extends Error {
  constructor(name: string, message: string, stack: string | undefined) {
    super(message);
    this.name = name;
    this.stack = stack;
  }
}

/** POST /api/client-errors: logs what the browser reports, up to `CLIENT_ERRORS_PER_HOUR`. */
export function clientErrorsRoute(logger: Logger, now = () => new Date()): Route {
  let hour = "";
  let reportsThisHour = 0;

  return {
    method: "POST",
    pattern: "/api/client-errors",
    async handle({ body, library: { libraryId } }) {
      const parsed = reportSchema.safeParse(body);
      if (!parsed.success) return badRequest;

      const thisHour = now().toISOString().slice(0, "2026-10-12T18".length);
      if (thisHour !== hour) {
        hour = thisHour;
        reportsThisHour = 0;
      }
      reportsThisHour++;
      if (reportsThisHour === CLIENT_ERRORS_PER_HOUR + 1) {
        const message = `More than ${CLIENT_ERRORS_PER_HOUR} browser reports this hour; the rest are dropped`;
        logger.warn("client.limited", message, { libraryId });
      }
      if (reportsThisHour > CLIENT_ERRORS_PER_HOUR) return tooMany;

      logReport(logger, libraryId, parsed.data);
      return noContent;
    },
  };
}

function logReport(logger: Logger, libraryId: string, report: ClientErrorReport) {
  if (report.kind === "request") {
    const { kind, page, method, status } = report;
    const path = report.path.split("?")[0];
    const answer = status === undefined ? "got no answer" : `answered ${status}`;
    const fields = { libraryId, kind, page, method, path, status };
    logger.warn("client.error", `${method} ${path} ${answer} in the browser`, fields);
    return;
  }
  const { kind, page, name = "Error", message, stack } = report;
  const what = kind === "error" ? "An uncaught error" : "An unhandled rejection";
  logger.error("client.error", `${what} in the browser`, { libraryId, kind, page }, new BrowserError(name, message, stack));
}
