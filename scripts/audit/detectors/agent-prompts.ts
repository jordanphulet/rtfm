import type { Event } from "../events.ts";
import { TASK_ID } from "../task-ids.ts";
import { candidate, type Candidate } from "./candidate.ts";

const TASK_AGENT_DESCRIPTION = new RegExp(String.raw`^${TASK_ID}\b`);
const AGENT_TOOLS = new Set(["Agent", "Task"]);

/** What every task agent's prompt carries (`PROCESS.md` › Rules), and how to tell it does. */
const STANDING_RULES: { rule: string; pattern: RegExp }[] = [
  { rule: "the task's Files", pattern: /\bFiles\b/ },
  { rule: "the task's Done when", pattern: /\bDone when\b/i },
  { rule: "CLAUDE.md", pattern: /CLAUDE\.md/ },
  { rule: "the design doc", pattern: /DESIGN\.md|design doc/i },
  { rule: "src/manual/README.md", pattern: /src\/manual\/README\.md/ },
  { rule: "report back with anything unresolved", pattern: /unresolved/i },
  { rule: "docs describe what exists", pattern: /describes? what exists/i },
];

/**
 * Task agents (an Agent or Task call whose description starts with a task id) started after
 * `since`, when `PROCESS.md` brought in these rules, with a prompt that leaves out any of them,
 * each with the rules it leaves out. None without the rules.
 */
export function agentPromptsMissingRules(events: Event[], since: string | undefined): Candidate[] {
  if (since === undefined) return [];
  return events.flatMap((event) => {
    const { description, prompt } = event.input ?? {};
    if (event.kind !== "tool" || !AGENT_TOOLS.has(event.tool ?? "") || event.time <= since) return [];
    if (typeof description !== "string" || typeof prompt !== "string") return [];
    if (!TASK_AGENT_DESCRIPTION.test(description)) return [];
    const missing = STANDING_RULES.filter(({ pattern }) => !pattern.test(prompt)).map(({ rule }) => rule);
    return missing.length > 0 ? [candidate(event, description, `missing: ${missing.join(", ")}`)] : [];
  });
}
