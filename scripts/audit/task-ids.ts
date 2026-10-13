/** A task id: two or three capitals or digits and dotted parts (`OH.1`, `BE.4b`, `P1.A.spec`). */
export const TASK_ID = String.raw`[A-Z][A-Z0-9]{1,2}(?:\.[A-Za-z0-9]+)+`;

const TASK_AGENT = new RegExp(String.raw`^subagent: (${TASK_ID})\b`);
const NAMED_TASK = new RegExp(String.raw`(?<![\w.])${TASK_ID}(?![\w]|\.\w)`, "g");

/** The task id a task agent's description starts with, from its `who`; undefined for any other session or agent. */
export function taskAgentId(who: string): string | undefined {
  return TASK_AGENT.exec(who)?.[1];
}

/** Every task id `text` names, each whole: `OH.11` names `OH.11`, not `OH.1`. */
export function namedTasks(text: string): string[] {
  return [...text.matchAll(NAMED_TASK)].map((match) => match[0]);
}
