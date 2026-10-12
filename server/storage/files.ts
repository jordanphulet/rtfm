import { randomUUID } from "node:crypto";
import { link, readdir, readFile, rm, writeFile } from "node:fs/promises";

export async function readIfExists(path: string | URL): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

export async function namesInFolder(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return [];
    throw error;
  }
}

/**
 * Creates the file with this content, or returns false if it already exists. It writes a temp file
 * and `link`s it into place: `link` fails if the file exists, so of two creators only one wins, and
 * the file is never seen half-written.
 */
export async function createExclusively(file: string, content: string): Promise<boolean> {
  const tempFile = tempPathFor(file);
  await writeFile(tempFile, content);
  try {
    await link(tempFile, file);
    return true;
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) return false;
    throw error;
  } finally {
    await rm(tempFile, { force: true });
  }
}

export function tempPathFor(file: string): string {
  return `${file}.${randomUUID()}.tmp`;
}

export function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}
