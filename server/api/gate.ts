import type { IncomingMessage } from "node:http";
import { ADMIN_LIBRARY_ID } from "../storage/library.ts";
import { cookieValue, LIBRARY_COOKIE, libraryCookie } from "./cookies.ts";
import { linkClosed, type FindLink } from "./link.ts";
import { hasDigestForm, isDigest, PASSCODE_COOKIE, passcodeRequired, type CurrentDigest } from "./passcode.ts";
import type { Cookie, JsonResponse, Library, UngatedRoute } from "./route.ts";

/** A request let in, with its library and, when the library cookie let it in, that cookie renewed; or refused. */
export type Admission = { library: Library; renewal?: Cookie } | { refusal: JsonResponse };

/**
 * What lets a request in: its `routes`, which every request reaches, and `admit`, which gives any
 * other request its library or refuses it. `admit` throws when it can't tell, which answers 500.
 */
export interface Gate {
  routes: UngatedRoute[];
  admit(request: IncomingMessage): Promise<Admission>;
}

/**
 * Gives a request its library, by its cookies alone (`server/api/README.md` › The gate): an open
 * link's library from the library cookie, then the admin's from the passcode cookie, then, without
 * a passcode gate, the admin's. A browser holding both cookies gets the library's reach.
 */
export function admitByCookies({ findLink, currentDigest, libraryFor }: {
  findLink: FindLink;
  /** Undefined when there is no passcode gate. */
  currentDigest: CurrentDigest | undefined;
  libraryFor(libraryId: string): Library;
}): Gate["admit"] {
  return async (request) => {
    const secret = cookieValue(request.headers.cookie, LIBRARY_COOKIE);
    if (secret !== undefined) {
      const link = await findLink(secret);
      if (link?.revokedAt !== undefined) return { refusal: linkClosed };
      if (link) {
        const library = libraryFor(link.libraryId);
        library.activity.used();
        return { library, renewal: libraryCookie(secret) };
      }
    }
    if (currentDigest && !(await holdsPasscode(request, currentDigest))) return { refusal: passcodeRequired };
    return { library: libraryFor(ADMIN_LIBRARY_ID) };
  };
}

/** Whether the passcode cookie holds the current digest; while none is set, none does. */
async function holdsPasscode(request: IncomingMessage, currentDigest: CurrentDigest): Promise<boolean> {
  const given = cookieValue(request.headers.cookie, PASSCODE_COOKIE);
  if (given === undefined || !hasDigestForm(given)) return false;
  const digest = await currentDigest();
  return digest !== undefined && isDigest(given, digest);
}
