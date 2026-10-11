import { readdir, readFile } from "node:fs/promises";

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

export function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}
