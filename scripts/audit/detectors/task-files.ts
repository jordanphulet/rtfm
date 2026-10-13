import { matchesFiles } from "../../commit-task.ts";
import type { Event } from "../events.ts";
import { checkoutPath, editedFile } from "../file-writes.ts";
import type { WorklistVersion } from "../repo.ts";
import { taskAgentId } from "../task-ids.ts";
import { PROSE_FILES, taskFilesAt } from "../worklist.ts";
import { candidate, type Candidate } from "./candidate.ts";

export type TaskFileEdits = {
  /** In-repo edits by task agents whose task isn't in the work list around the edit. */
  skippedWithoutFiles: number;
  /** In-repo edits by task agents whose **Files** are given in words (`PROSE_FILES`). */
  skippedProseFiles: number;
  outside: Candidate[];
};

/**
 * A task agent's Edit, MultiEdit, Write or NotebookEdit of a file in the repo (or a worktree)
 * outside its task's **Files**, as `WORKLIST.md` had them when it made the edit (`worklist.ts`).
 * An edit whose task the work list doesn't have then, or whose **Files** are given in words, is
 * counted as skipped.
 */
export function editsOutsideTaskFiles(events: Event[], worklists: WorklistVersion[], repoDir: string): TaskFileEdits {
  const found: TaskFileEdits = { skippedWithoutFiles: 0, skippedProseFiles: 0, outside: [] };
  for (const event of events) {
    const task = taskAgentId(event.who);
    const file = editedFile(event);
    if (event.agent === undefined || task === undefined || file === undefined) continue;
    const inCheckout = checkoutPath(file, event.cwd ?? repoDir, repoDir);
    if (inCheckout === undefined) continue;
    const files = taskFilesAt(worklists, task, event.time);
    if (files === undefined) found.skippedWithoutFiles++;
    else if (files === PROSE_FILES) found.skippedProseFiles++;
    else if (!matchesFiles(inCheckout, files)) {
      found.outside.push(
        candidate(event, `${event.tool} ${file}`, `outside ${task}'s Files: ${files.include.join(", ") || "none"}`),
      );
    }
  }
  return found;
}
