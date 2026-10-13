import type { Event } from "../events.ts";
import { editedFile, writtenFiles } from "../file-writes.ts";
import { taskAgentId } from "../task-ids.ts";
import { candidate, scriptCandidate, type Candidate } from "./candidate.ts";

const OPENING = 300;

/**
 * A reviewer or auditor writing files in the repo or a worktree, by a tool or a shell command
 * (writing outside the repo, as to a scratchpad, is allowed). A reviewer or auditor is a session
 * or subagent whose title or description says "review" or "audit" and doesn't start with a task
 * id, or a subagent whose first prompt says "read-only" near its start.
 */
export function readOnlyWrites(events: Event[], repoDir: string): Candidate[] {
  const readOnly = readOnlyAgents(events);
  return events.flatMap((event) => {
    if (!isReviewerOrAuditor(event.who) && !readOnly.has(agentKey(event))) return [];
    const written = writtenFiles(event, repoDir).filter(({ inCheckout }) => inCheckout !== undefined);
    if (written.length === 0) return [];
    const file = editedFile(event);
    return [
      file === undefined
        ? scriptCandidate(event, written.map(({ file }) => file).join(", "))
        : candidate(event, `${event.tool} ${file}`),
    ];
  });
}

function isReviewerOrAuditor(who: string): boolean {
  return /\b(?:review|audit)/i.test(who) && taskAgentId(who) === undefined;
}

function readOnlyAgents(events: Event[]): Set<string> {
  const firstPrompts = new Map<string, string>();
  for (const event of events) {
    if (event.kind === "prompt" && !firstPrompts.has(agentKey(event))) firstPrompts.set(agentKey(event), event.text ?? "");
  }
  return new Set([...firstPrompts].filter(([, prompt]) => /read-only/i.test(prompt.slice(0, OPENING))).map(([key]) => key));
}

function agentKey(event: Event): string {
  return `${event.session}/${event.agent ?? ""}`;
}
