import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedLicense, licenseExpression, refusedPackages, type Lockfile } from "./licenses.ts";

describe("the dependencies' licenses", () => {
  it("are all allowed for every package that isn't dev-only", () => {
    const lockfile = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")) as Lockfile;
    const refused = refusedPackages(lockfile).map(({ name, version, license }) => `${name}@${version}: ${license ?? "no license"}`);
    expect(refused, "Packages whose license isn't on the list in scripts/licenses.ts").toEqual([]);
  });
});

describe("refusedPackages", () => {
  const lockfile: Lockfile = {
    packages: {
      "": { name: "rtfm", version: "0.0.0", license: "MIT" },
      "node_modules/allowed": { version: "1.0.0", license: "MIT" },
      "node_modules/copyleft": { version: "2.0.0", license: "GPL-3.0" },
      "node_modules/unlicensed": { version: "3.0.0" },
      "node_modules/copyleft-tool": { version: "4.0.0", license: "GPL-3.0", dev: true },
      "node_modules/allowed/node_modules/@scope/nested": { version: "5.0.0", license: "AGPL-3.0-only" },
      "node_modules/legacy-array": { version: "6.0.0", licenses: [{ type: "MIT" }, { type: "GPL-2.0" }] },
      "node_modules/legacy-object": { version: "7.0.0", license: { type: "MPL-2.0" } },
    },
  };

  it("names each package that isn't dev-only, with its license, when it isn't allowed or has none", () => {
    expect(refusedPackages(lockfile)).toEqual([
      { name: "copyleft", version: "2.0.0", license: "GPL-3.0" },
      { name: "unlicensed", version: "3.0.0", license: undefined },
      { name: "@scope/nested", version: "5.0.0", license: "AGPL-3.0-only" },
      { name: "legacy-object", version: "7.0.0", license: "MPL-2.0" },
    ]);
  });
});

describe("licenseExpression", () => {
  it("reads a license, a legacy license object and a legacy array of them", () => {
    expect(licenseExpression({ license: "MIT" })).toBe("MIT");
    expect(licenseExpression({ license: { type: "ISC" } })).toBe("ISC");
    expect(licenseExpression({ licenses: [{ type: "MIT" }, "Apache-2.0"] })).toBe("MIT OR Apache-2.0");
    expect(licenseExpression({ licenses: [] })).toBeUndefined();
    expect(licenseExpression({})).toBeUndefined();
  });
});

describe("isAllowedLicense", () => {
  it("allows the listed licenses and refuses others", () => {
    const allowed = ["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Apache-2.0", "OFL-1.1", "Unlicense", "CC0-1.0", "BlueOak-1.0.0"];
    for (const license of allowed) expect(isAllowedLicense(license), license).toBe(true);
    const refused = ["GPL-3.0", "MPL-2.0", "mit", "MIT+", "SEE LICENSE IN LICENSE.txt", "UNLICENSED", ""];
    for (const license of refused) expect(isAllowedLicense(license), license).toBe(false);
  });

  it("allows an OR when either side is allowed, and an AND only when both are", () => {
    expect(isAllowedLicense("(MIT OR GPL-3.0-or-later)")).toBe(true);
    expect(isAllowedLicense("GPL-3.0 OR Apache-2.0")).toBe(true);
    expect(isAllowedLicense("GPL-3.0 OR MPL-2.0")).toBe(false);
    expect(isAllowedLicense("MIT AND ISC")).toBe(true);
    expect(isAllowedLicense("MIT AND GPL-3.0")).toBe(false);
    expect(isAllowedLicense("(MIT AND GPL-3.0) OR ISC")).toBe(true);
    expect(isAllowedLicense("MIT AND (GPL-3.0 OR ISC)")).toBe(true);
  });

  it("refuses an exception and an expression it can't read", () => {
    expect(isAllowedLicense("Apache-2.0 WITH LLVM-exception")).toBe(false);
    expect(isAllowedLicense("(MIT OR ISC")).toBe(false);
    expect(isAllowedLicense("MIT OR")).toBe(false);
    expect(isAllowedLicense("MIT ISC")).toBe(false);
  });
});
