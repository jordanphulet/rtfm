import type { Cookie } from "./route.ts";

export const LIBRARY_COOKIE = "rtfm_library";
const A_YEAR_IN_SECONDS = 31_536_000;

/** A library's cookie: its link's secret, kept for a year from its latest use. */
export function libraryCookie(secret: string): Cookie {
  return { name: LIBRARY_COOKIE, value: secret, maxAgeSeconds: A_YEAR_IN_SECONDS };
}

export function clearedCookie(name: string): Cookie {
  return { name, value: "", maxAgeSeconds: 0 };
}

/** The value of the first cookie with this name in a `Cookie` header, decoded. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const pair of header?.split(";") ?? []) {
    const [key, ...value] = pair.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return undefined;
    }
  }
  return undefined;
}
