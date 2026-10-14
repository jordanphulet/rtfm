import { z } from "zod";
import type { Logger } from "../logging/logger.ts";
import { LIBRARY_SECRET_PATTERN, librarySecretDigest, type LibraryLink } from "../storage/library-links.ts";
import { checkedRecipientLibraryId } from "../storage/library.ts";
import { clearedCookie, LIBRARY_COOKIE, libraryCookie } from "./cookies.ts";
import { PASSCODE_COOKIE } from "./passcode.ts";
import { badRequest, noContent, type JsonResponse, type Library, type UngatedRoute } from "./route.ts";

const LINK_PATH = "/api/link";
/** How long a link found is trusted, so a revoked one is refused within about a minute. */
export const FOUND_LINK_MAX_AGE_MS = 60_000;

export const linkClosed: JsonResponse = { status: 401, body: { error: "Link closed" } };

const bodySchema = z.strictObject({ secret: z.string() });

/** The link a secret opens, or undefined if none does. Throws when it can't be read. */
export type FindLink = (secret: string) => Promise<LibraryLink | undefined>;

/**
 * Finds a link by its secret's digest, keeping each link found, open or revoked, for `maxAgeMs` by
 * `now`. A miss is never kept, so a new link opens at once and made-up secrets can't fill the cache.
 */
export function cachedLinks(
  findByDigest: (digest: string) => Promise<LibraryLink | undefined>,
  now: () => number,
  maxAgeMs = FOUND_LINK_MAX_AGE_MS,
): FindLink {
  const found = new Map<string, { link: LibraryLink; readAt: number }>();
  return async (secret) => {
    if (!LIBRARY_SECRET_PATTERN.test(secret)) return undefined;
    const digest = librarySecretDigest(secret);
    const cached = found.get(digest);
    if (cached && now() - cached.readAt < maxAgeMs) return cached.link;
    const readAt = now();
    const link = await lookUp(findByDigest, digest);
    if (link) found.set(digest, { link, readAt });
    return link;
  };
}

/**
 * The link with this digest, which must name a recipient's library, never the admin's. Any failure,
 * a bad item included, throws an error naming no key, since a store's own error may hold the digest.
 */
async function lookUp(findByDigest: (digest: string) => Promise<LibraryLink | undefined>, digest: string) {
  try {
    const link = await findByDigest(digest);
    if (link) checkedRecipientLibraryId(link.libraryId);
    return link;
  } catch (error) {
    throw new Error(`Couldn't look up a library link (${errorKind(error)})`);
  }
}

function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : error.name;
}

/** What opening a link needs: the link a secret opens, and a library's own and its starters. */
export interface LinkOpening {
  findLink: FindLink;
  libraryFor(libraryId: string): Library;
  /** Seeds the library's starters, giving the ids it seeded. */
  seedStarters(libraryId: string): Promise<string[]>;
}

/**
 * POST /api/link: opens the library of an open link, after seeding its starters if it has none and
 * counting the open, with its cookie set and the passcode's cleared. A library seeds one at a time.
 */
export function openLinkRoute({ findLink, libraryFor, seedStarters }: LinkOpening, logger: Logger): UngatedRoute {
  const seeding = new Map<string, Promise<void>>();

  async function seed(libraryId: string) {
    const seeded = await seedStarters(libraryId);
    if (seeded.length === 0) return;
    logger.info("library.seeded", `Seeded ${libraryId}'s starters`, { libraryId, manualIds: seeded.join(",") });
  }

  /** Seeds the library, or waits for the seeding already running in it. */
  function seedOnce(libraryId: string): Promise<void> {
    const running = seeding.get(libraryId);
    if (running) return running;
    const started = seed(libraryId).finally(() => seeding.delete(libraryId));
    seeding.set(libraryId, started);
    return started;
  }

  return {
    method: "POST",
    pattern: LINK_PATH,
    async handle({ body }) {
      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) return badRequest;
      const { secret } = parsed.data;
      const link = await findLink(secret);
      if (!link) {
        logger.warn("link.refused", "A link that opens no library was given", { reason: "unknown" });
        return linkClosed;
      }
      const { libraryId } = link;
      if (link.revokedAt !== undefined) {
        logger.warn("link.refused", `A revoked link to ${libraryId} was given`, { reason: "revoked", libraryId });
        return linkClosed;
      }
      await seedOnce(libraryId);
      const { activity } = libraryFor(libraryId);
      await activity.opened();
      activity.used();
      logger.info("link.accepted", `A browser opened ${libraryId}`, { libraryId });
      return { ...noContent, cookies: [libraryCookie(secret), clearedCookie(PASSCODE_COOKIE)] };
    },
  };
}

/** DELETE /api/link: clears the library cookie, so the browser leaves the library. */
export const leaveLibraryRoute: UngatedRoute = {
  method: "DELETE",
  pattern: LINK_PATH,
  async handle() {
    return { ...noContent, cookies: [clearedCookie(LIBRARY_COOKIE)] };
  },
};
