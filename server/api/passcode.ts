import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Logger } from "../logging/logger.ts";
import { PASSCODE_DIGEST_PATTERN } from "../storage/dynamodb-manual-store.ts";
import { clearedCookie, LIBRARY_COOKIE } from "./cookies.ts";
import { badRequest, noContent, type JsonResponse, type UngatedRoute } from "./route.ts";

export const PASSCODE_COOKIE = "rtfm_passcode";
export const PASSCODE_PATH = "/api/passcode";
/** How long a stored digest is trusted once read, so a new one locks out every browser within about a minute. */
export const STORED_DIGEST_MAX_AGE_MS = 60_000;

export const passcodeRequired: JsonResponse = { status: 401, body: { error: "Passcode required" } };
const wrongPasscode: JsonResponse = { status: 401, body: { error: "Wrong passcode" } };

const bodySchema = z.strictObject({ passcode: z.string() });

/** The digest every API request's cookie must hold, or undefined when no passcode is set, which refuses them all. */
export type CurrentDigest = () => Promise<string | undefined>;

/** The passcode's SHA-256 digest, in lowercase hex: what is stored, and what the cookie holds. */
export function passcodeDigest(passcode: string): string {
  return createHash("sha256").update(passcode).digest("hex");
}

/** Whether the text has a digest's form, 64 lowercase hex characters, judged by the text alone. */
export function hasDigestForm(text: string): boolean {
  return PASSCODE_DIGEST_PATTERN.test(text);
}

/** Compares the two digests' bytes, always 32 of each, so the time taken never depends on the digest. */
export function isDigest(given: string, digest: string): boolean {
  return hasDigestForm(given) && timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(digest, "hex"));
}

/** Reads the digest again only once the last read is `maxAgeMs` old by `now`; a failed read is never kept. */
export function cachedDigest(read: CurrentDigest, now: () => number, maxAgeMs = STORED_DIGEST_MAX_AGE_MS): CurrentDigest {
  let cached: { digest: string | undefined; readAt: number } | undefined;
  return async () => {
    if (cached && now() - cached.readAt < maxAgeMs) return cached.digest;
    const readAt = now();
    const digest = await read();
    cached = { digest, readAt };
    return digest;
  };
}

/**
 * POST /api/passcode: sets the cookie to the passcode's digest when it is the current one, and
 * clears the library cookie, so a browser holds one of the two.
 */
export function passcodeRoute(currentDigest: CurrentDigest, logger: Logger): UngatedRoute {
  return {
    method: "POST",
    pattern: PASSCODE_PATH,
    async handle({ body }) {
      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) return badRequest;
      const digest = await currentDigest();
      if (digest === undefined) {
        logger.warn("passcode.unset", "A passcode was entered, but none is set, so every one is refused");
        return wrongPasscode;
      }
      const given = passcodeDigest(parsed.data.passcode);
      if (!isDigest(given, digest)) {
        logger.warn("passcode.wrong", "A wrong passcode was entered");
        return wrongPasscode;
      }
      logger.info("passcode.accepted", "A browser entered the passcode");
      return { ...noContent, cookies: [{ name: PASSCODE_COOKIE, value: given }, clearedCookie(LIBRARY_COOKIE)] };
    },
  };
}
