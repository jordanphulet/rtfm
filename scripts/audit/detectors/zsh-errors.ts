import type { Event } from "../events.ts";
import { scriptCandidate, type Candidate } from "./candidate.ts";

/**
 * - `equalsExpansion`: a word starting with `=` read as a command lookup
 *   (`(eval):1: ===== not found`), which the zsh rule in `CLAUDE.md` is about;
 * - `noMatches`: a glob that matched nothing (`no matches found: …`), which no rule names.
 */
export type ZshErrors = { equalsExpansion: Candidate[]; noMatches: Candidate[] };

const EQUALS_EXPANSION = /^(?:\(eval\)|zsh):(?:\d+:)? =\S* not found$/m;
const NO_MATCHES = /^(?:\(eval\)|zsh):(?:\d+:)? no matches found: .*$/m;

/** Shell commands that failed on these zsh errors after `since`, when the zsh rule was added. None without a rule. */
export function zshErrors(events: Event[], since: string | undefined): ZshErrors {
  const found: ZshErrors = { equalsExpansion: [], noMatches: [] };
  if (since === undefined) return found;
  for (const event of events) {
    if (event.kind !== "tool" || event.tool !== "Bash" || event.time <= since) continue;
    const equals = EQUALS_EXPANSION.exec(event.result ?? "")?.[0];
    const noMatches = NO_MATCHES.exec(event.result ?? "")?.[0];
    if (equals) found.equalsExpansion.push(scriptCandidate(event, equals));
    if (noMatches) found.noMatches.push(scriptCandidate(event, noMatches));
  }
  return found;
}
