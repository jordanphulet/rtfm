/** The licenses a package that isn't dev-only may have (`OPERATING.md` › License). */
export const ALLOWED_LICENSES = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "OFL-1.1",
  "Unlicense",
  "CC0-1.0",
  "BlueOak-1.0.0",
]);

type LegacyLicense = string | { type?: string };

/** The license fields of a `package.json`, or of a package's entry in `package-lock.json`. */
export interface LicenseFields {
  license?: LegacyLicense;
  licenses?: LegacyLicense[];
}

export interface LockfileEntry extends LicenseFields {
  name?: string;
  version?: string;
  dev?: boolean;
}

export interface Lockfile {
  packages: Record<string, LockfileEntry>;
}

export interface RefusedPackage {
  name: string;
  version: string;
  license: string | undefined;
}

/**
 * A package's license as one SPDX expression. The legacy forms, `{ "type": "MIT" }` and a
 * `licenses` array of them, become their types, an array's joined with `OR`.
 */
export function licenseExpression(fields: LicenseFields): string | undefined {
  const legacyType = (license: LegacyLicense) => (typeof license === "string" ? license : license.type);
  if (fields.license !== undefined) return legacyType(fields.license);
  const types = (fields.licenses ?? []).map(legacyType).filter((type) => type !== undefined);
  return types.length > 0 ? types.join(" OR ") : undefined;
}

/**
 * Whether an SPDX expression is allowed: an identifier on the list, an `OR` when either side is,
 * an `AND` when both are. Anything else, an exception (`WITH`) or a form it can't read included,
 * is refused.
 */
export function isAllowedLicense(expression: string): boolean {
  const tokens = expression.match(/[()]|[^\s()]+/g) ?? [];
  let next = 0;

  function either(): boolean {
    let allowed = both();
    while (tokens[next] === "OR") {
      next += 1;
      allowed = both() || allowed;
    }
    return allowed;
  }
  function both(): boolean {
    let allowed = single();
    while (tokens[next] === "AND") {
      next += 1;
      allowed = single() && allowed;
    }
    return allowed;
  }
  function single(): boolean {
    const token = tokens[next++];
    if (token === "(") {
      const allowed = either();
      return tokens[next++] === ")" && allowed;
    }
    return token !== undefined && ALLOWED_LICENSES.has(token) && tokens[next] !== "WITH";
  }

  const allowed = either();
  return allowed && next === tokens.length;
}

/** Each package in the lockfile that isn't dev-only and has no license, or one that isn't allowed. */
export function refusedPackages(lockfile: Lockfile): RefusedPackage[] {
  return Object.entries(lockfile.packages)
    .filter(([location, entry]) => location !== "" && !entry.dev)
    .map(([location, entry]) => ({
      name: entry.name ?? location.slice(location.lastIndexOf("node_modules/") + "node_modules/".length),
      version: entry.version ?? "unknown",
      license: licenseExpression(entry),
    }))
    .filter(({ license }) => license === undefined || !isAllowedLicense(license));
}
