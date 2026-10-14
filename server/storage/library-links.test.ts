import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LIBRARY_SECRET_PATTERN, LINK_DIGEST_PATTERN, librarySecretDigest, makeLibrarySecret } from "./library-links.ts";

describe("a library link's secret", () => {
  it("is 128 random bits as base64url: 22 characters, never the same twice", () => {
    const secrets = Array.from({ length: 100 }, makeLibrarySecret);
    for (const secret of secrets) {
      expect(secret).toMatch(LIBRARY_SECRET_PATTERN);
      expect(Buffer.from(secret, "base64url")).toHaveLength(16);
    }
    expect(new Set(secrets).size).toBe(100);
  });

  it("is kept as its SHA-256 digest in lowercase hex", () => {
    const secret = makeLibrarySecret();
    const digest = librarySecretDigest(secret);
    expect(digest).toMatch(LINK_DIGEST_PATTERN);
    expect(digest).toBe(createHash("sha256").update(secret).digest("hex"));
  });

  it("has no digest unless it has the secret's form", () => {
    for (const notASecret of ["", "short", `${makeLibrarySecret()}x`, "a+b/c=d+e/f=g+h/i=j+k/"]) {
      expect(() => librarySecretDigest(notASecret)).toThrow("Not a library link's secret");
    }
  });
});
