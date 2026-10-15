import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { licenseExpression, type LicenseFields } from "./licenses.ts";

export const NOTICES_FILE = "THIRD-PARTY-NOTICES.txt";
const NODE_MODULES = `${path.sep}node_modules${path.sep}`;
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;
const RULE = "-".repeat(80);

interface PackageJson extends LicenseFields {
  name: string;
  version: string;
  author?: string | { name?: string };
}

interface PackageNotice {
  name: string;
  version: string;
  license: string;
  text: string;
}

/**
 * A Vite or Rolldown plugin that writes `THIRD-PARTY-NOTICES.txt` beside the bundle: each package
 * from `node_modules` that the bundle holds a module of, with its version, its license and the
 * text of its license and notice files, since minifying drops the notices in its code.
 */
export function thirdPartyNotices(): Plugin {
  return {
    name: "rtfm-third-party-notices",
    generateBundle(_options, bundle) {
      const moduleIds = Object.values(bundle).flatMap((output) => (output.type === "chunk" ? output.moduleIds : []));
      this.emitFile({ type: "asset", fileName: NOTICES_FILE, source: noticesFor(moduleIds) });
    },
  };
}

/**
 * The notices of the packages the modules belong to, sorted by name and version, each once however
 * many copies of it `node_modules` holds: the copy whose folder sorts first.
 */
export function noticesFor(moduleIds: string[]): string {
  const packageDirs = [...new Set(moduleIds.map(packageDirOf).filter((dir) => dir !== undefined))].sort();
  const byId = new Map<string, PackageNotice>();
  for (const notice of packageDirs.map(readPackage)) {
    const id = `${notice.name}@${notice.version}`;
    if (!byId.has(id)) byId.set(id, notice);
  }
  const packages = [...byId.values()].sort(byNameThenVersion);
  const intro = "The packages below are bundled into this build, each under its own license.";
  const sections = packages.map(({ name, version, license, text }) => `${RULE}\n${name}@${version} (${license})\n\n${text}`);
  return [intro, ...sections].join("\n\n") + "\n";
}

/** The folder of the package in `node_modules` that holds a module, if one does. */
export function packageDirOf(moduleId: string): string | undefined {
  const file = moduleId.replace(/^\0/, "").replace(/\?.*$/, "");
  const at = file.lastIndexOf(NODE_MODULES);
  if (at === -1) return undefined;
  const start = at + NODE_MODULES.length;
  const segments = file.slice(start).split(path.sep);
  const nameLength = segments[0].startsWith("@") ? 2 : 1;
  return file.slice(0, start) + segments.slice(0, nameLength).join(path.sep);
}

function readPackage(dir: string): PackageNotice {
  const packageJson = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as PackageJson;
  const license = licenseExpression(packageJson) ?? "no license given";
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const texts = files.map((name) => readFileSync(path.join(dir, name), "utf8").trim());
  const author = typeof packageJson.author === "string" ? packageJson.author : packageJson.author?.name;
  const missing = `The package has no license or notice file. Its package.json gives the license as ${license}${author ? `, by ${author}` : ""}.`;
  return { name: packageJson.name, version: packageJson.version, license, text: texts.length > 0 ? texts.join("\n\n") : missing };
}

function byNameThenVersion(a: PackageNotice, b: PackageNotice): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
}
