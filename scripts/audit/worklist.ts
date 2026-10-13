import { findTask, type FilePatterns } from "../commit-task.ts";
import type { WorklistVersion } from "./repo.ts";

/** **Files** given in words, as "the server folder named in `ARCHITECTURE.md`", which can't be matched. */
export const PROSE_FILES = "prose";

/**
 * Task `id`'s **Files** (as `commit-task.ts` reads them) in the version of `WORKLIST.md` committed
 * last before `time`, together with the next version's, which may have widened them. A **Files**
 * item that says "anything" allows every file, and "root config" every file at the root; one that
 * names a folder "named in" another doc is `PROSE_FILES`. Undefined when neither version has the
 * task.
 */
export function taskFilesAt(
  versions: WorklistVersion[],
  id: string,
  time: string,
): FilePatterns | typeof PROSE_FILES | undefined {
  const next = versions.findIndex((version) => version.time > time);
  const around = next === -1 ? versions.slice(-1) : versions.slice(Math.max(0, next - 1), next + 1);
  const tasks = around.flatMap(({ text }) => {
    const task = findTask(text, id);
    return task ? [{ files: task.files, text: filesText(text, id) }] : [];
  });
  if (tasks.length === 0) return undefined;
  if (tasks.some(({ text }) => /\bnamed in\b/.test(text))) return PROSE_FILES;
  const found = tasks.map(({ files, text }) => widened(files, text));
  return {
    include: [...new Set(found.flatMap((files) => files.include))],
    exclude: [...new Set(found.flatMap((files) => files.exclude))],
  };
}

function widened(files: FilePatterns, text: string): FilePatterns {
  if (/\banything\b/.test(text)) return { include: ["**"], exclude: files.exclude };
  if (/\broot config\b/.test(text)) return { include: [...files.include, "*"], exclude: files.exclude };
  return files;
}

// The task's **Files** item, with its continuation lines joined.
function filesText(worklist: string, id: string): string {
  const lines = worklist.split("\n");
  const heading = lines.findIndex((line) => line.startsWith(`### ${id} — `));
  const end = lines.findIndex((line, index) => index > heading && line.startsWith("#"));
  const block = lines.slice(heading, end === -1 ? undefined : end);
  const start = block.findIndex((line) => line.startsWith("- **Files:**"));
  if (start === -1) return "";
  const rest = block.slice(start + 1);
  const continued = rest.findIndex((line) => !/^\s+\S/.test(line));
  return [block[start], ...rest.slice(0, continued === -1 ? undefined : continued)].join(" ");
}
