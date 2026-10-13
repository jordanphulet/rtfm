import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Logger } from "../logging/logger.ts";
import { badRequest, type JsonResponse, type Route } from "./route.ts";

export const PASSCODE_COOKIE = "rtfm_passcode";
export const PASSCODE_PATH = "/api/passcode";

export const passcodeRequired: JsonResponse = { status: 401, body: { error: "Passcode required" } };
const wrongPasscode: JsonResponse = { status: 401, body: { error: "Wrong passcode" } };

const bodySchema = z.strictObject({ passcode: z.string() });

/** Compares SHA-256 digests, which are always the same length, so the time taken never depends on the text. */
export function isPasscode(given: string, passcode: string): boolean {
  return timingSafeEqual(digest(given), digest(passcode));
}

function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

/** POST /api/passcode: sets the passcode cookie when the passcode given is the server's. */
export function passcodeRoute(passcode: string, logger: Logger): Route {
  return {
    method: "POST",
    pattern: PASSCODE_PATH,
    async handle({ body }) {
      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) return badRequest;
      if (!isPasscode(parsed.data.passcode, passcode)) {
        logger.warn("passcode.wrong", "A wrong passcode was entered");
        return wrongPasscode;
      }
      logger.info("passcode.accepted", "A browser entered the passcode");
      return { status: 204, body: undefined, cookie: { name: PASSCODE_COOKIE, value: passcode } };
    },
  };
}
