import { readFile } from "node:fs/promises";
import path from "node:path";
import { isErrorCode } from "../storage/files.ts";

export interface AppFile {
  body: Buffer;
  contentType: string;
  cacheControl: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const ASSETS_PATH = "/assets/";
/** Vite names every file under `assets/` by its content, so a browser may keep it for good. */
const ASSET_CACHING = "public, max-age=31536000, immutable";
const PAGE_CACHING = "no-cache";

/**
 * The built app's file for a path: the file itself, or `index.html` for any other page route, so
 * the browser's router takes over. Undefined for a path outside the folder or a missing asset.
 */
export async function readAppFile(appDir: string, pathname: string): Promise<AppFile | undefined> {
  const file = fileInFolder(appDir, pathname);
  if (file === undefined) return undefined;
  const found = await readFileIfExists(file);
  if (found) return { body: found, contentType: contentTypeOf(file), cacheControl: cachingOf(pathname) };
  if (pathname.startsWith(ASSETS_PATH)) return undefined;
  const page = await readFile(path.join(appDir, "index.html"));
  return { body: page, contentType: CONTENT_TYPES[".html"], cacheControl: PAGE_CACHING };
}

function fileInFolder(appDir: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) return undefined;
  const file = path.join(appDir, decoded);
  const relative = path.relative(appDir, file);
  return relative.startsWith("..") || path.isAbsolute(relative) ? undefined : file;
}

/** The file's contents, or undefined when there is no such file (a folder, such as `/`, has none). */
async function readFileIfExists(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if (isErrorCode(error, "ENOENT") || isErrorCode(error, "EISDIR")) return undefined;
    throw error;
  }
}

function contentTypeOf(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

function cachingOf(pathname: string): string {
  return pathname.startsWith(ASSETS_PATH) ? ASSET_CACHING : PAGE_CACHING;
}
