import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

/** A library link's secret: 16 random bytes as base64url, 22 characters, 128 bits. */
export const LIBRARY_SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/;
/** What a link is kept under: its secret's SHA-256 digest in lowercase hex. */
export const LINK_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function makeLibrarySecret(): string {
  return randomBytes(16).toString("base64url");
}

/** The secret's digest, which is all that is ever kept of it. */
export function librarySecretDigest(secret: string): string {
  if (!LIBRARY_SECRET_PATTERN.test(secret)) throw new Error("Not a library link's secret");
  return createHash("sha256").update(secret).digest("hex");
}

/** A recipient library's link, kept under its secret's digest. */
export interface LibraryLink {
  digest: string;
  libraryId: string;
  /** The user's note on whom the link is for. */
  label?: string;
  createdAt: string;
  revokedAt?: string;
}

export type NewLibraryLink = Omit<LibraryLink, "revokedAt">;

/** The counts a library's activity keeps besides its links opened. */
export type ActivityCounter = "sectionsRead" | "librarianMessages" | "manualsCreated" | "sectionsWritten";

export interface LibraryActivity extends Record<ActivityCounter, number> {
  libraryId: string;
  firstUsedAt?: string;
  lastUsedAt?: string;
  opens: number;
}

/** The recipient libraries' links and each one's activity. Every library here is a recipient's. */
export interface LinkStore {
  /**
   * Never replaces a link: "exists" if another link has its digest, and "created", changing
   * nothing, if this very link is already stored.
   */
  createLink(link: NewLibraryLink): Promise<"created" | "exists">;
  /** The link with this digest, or undefined if there is none. Throws when it can't be read. */
  findLink(digest: string): Promise<LibraryLink | undefined>;
  listLinks(): Promise<LibraryLink[]>;
  /** Sets `revokedAt` on the library's open links, keeping them. */
  revokeLink(libraryId: string, revokedAt: string): Promise<"revoked" | "already-revoked" | "no-link">;
  /** Counts a link opened, and keeps the first one's time. */
  recordOpen(libraryId: string, at: string): Promise<void>;
  /** Moves the last use's time forward to `at`, never back. */
  recordLastUse(libraryId: string, at: string): Promise<void>;
  count(libraryId: string, counter: ActivityCounter): Promise<void>;
  /** The library's activity; all zeros for a library never used. */
  getActivity(libraryId: string): Promise<LibraryActivity>;
  /** The activity of every library used at least once. */
  listActivity(): Promise<LibraryActivity[]>;
}

/** Whether the stored link is this new one, as a store keeps it (no undefined values), unrevoked. */
export function isSameLink(stored: LibraryLink | undefined, link: NewLibraryLink): boolean {
  return isDeepStrictEqual(stored, JSON.parse(JSON.stringify(link)));
}

export function noActivity(libraryId: string): LibraryActivity {
  return { libraryId, opens: 0, sectionsRead: 0, librarianMessages: 0, manualsCreated: 0, sectionsWritten: 0 };
}

export function checkedDigest(digest: string): string {
  if (!LINK_DIGEST_PATTERN.test(digest)) throw new Error("Not a link's digest: SHA-256 in lowercase hex");
  return digest;
}
