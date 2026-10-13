import type { Event } from "../events.ts";
import { isGitWrite } from "../git-commands.ts";
import { bashCommands, joinCommands, scriptCandidate, type Candidate } from "./candidate.ts";

/** Git commands run by subagents that change the repository, its index or its worktrees. */
export function subagentGitWrites(events: Event[]): Candidate[] {
  return events
    .filter((event) => event.agent !== undefined)
    .flatMap((event) => {
      const writes = bashCommands(event).filter(isGitWrite);
      if (writes.length === 0) return [];
      return [scriptCandidate(event, joinCommands(writes))];
    });
}
