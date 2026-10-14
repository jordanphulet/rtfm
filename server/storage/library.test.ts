import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_LIBRARY_ID,
  checkedRecipientLibraryId,
  isRecipientLibraryId,
  libraryFolder,
  libraryPartition,
} from "./library.ts";

describe("a library's keys and folder", () => {
  it("gives the admin's library the unprefixed keys and the data folder itself", () => {
    expect(libraryPartition(ADMIN_LIBRARY_ID, "LIBRARY")).toBe("LIBRARY");
    expect(libraryPartition(ADMIN_LIBRARY_ID, "MANUAL#a-manual")).toBe("MANUAL#a-manual");
    expect(libraryFolder("/data", ADMIN_LIBRARY_ID)).toBe("/data");
  });

  it("puts a recipient's library under L#<libraryId># and libraries/<libraryId>/", () => {
    expect(libraryPartition("acme", "LIBRARY")).toBe("L#acme#LIBRARY");
    expect(libraryPartition("acme", "MANUAL#a-manual")).toBe("L#acme#MANUAL#a-manual");
    expect(libraryFolder("/data", "acme")).toBe(path.join("/data", "libraries", "acme"));
  });

  it("refuses a library id that isn't a slug, so no key or folder can reach another's", () => {
    for (const libraryId of ["acme#LIBRARY", "../outside", "Acme", ""]) {
      expect(() => libraryPartition(libraryId, "LIBRARY")).toThrow(`Not a valid library id: "${libraryId}"`);
      expect(() => libraryFolder("/data", libraryId)).toThrow(`Not a valid library id: "${libraryId}"`);
    }
  });

  it("lets no recipient's library take the admin's id", () => {
    expect(isRecipientLibraryId("acme")).toBe(true);
    expect(isRecipientLibraryId("acme-2026")).toBe(true);
    expect(isRecipientLibraryId(ADMIN_LIBRARY_ID)).toBe(false);
    expect(isRecipientLibraryId("acme#x")).toBe(false);
    expect(isRecipientLibraryId("")).toBe(false);
  });

  it("checks a recipient's library id: a slug of at most 63 characters, never the admin's, never repeated in the error", () => {
    expect(checkedRecipientLibraryId("acme-2026")).toBe("acme-2026");
    expect(checkedRecipientLibraryId("a".repeat(63))).toBe("a".repeat(63));
    for (const libraryId of [ADMIN_LIBRARY_ID, "a".repeat(64), "acme#x", "../outside", "Acme", ""]) {
      expect(() => checkedRecipientLibraryId(libraryId), libraryId).toThrow("Not a recipient library's id");
    }
    const secret = "Zm9vYmFyYmF6cXV4cXV1eA";
    expect(() => checkedRecipientLibraryId(secret)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
