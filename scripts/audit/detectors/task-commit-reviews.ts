import type { Event } from "../events.ts";
import type { Commit } from "../repo.ts";

export type ReviewAgent = { time: string; session: string; who: string; description: string };

export type TaskCommitReview = {
  hash: string;
  /** ISO 8601, UTC. */
  time: string;
  subject: string;
  tasks: string[];
  reviewed: boolean;
  /** The review agents started for the commit's tasks since the last commit for any of them. */
  reviews: ReviewAgent[];
};

const TASK_ID = String.raw`[A-Z][A-Z0-9]{1,2}(?:\.[A-Za-z0-9]+)+`;
const TASK_COMMIT = new RegExp(String.raw`^(${TASK_ID}(?:, ${TASK_ID})*): `);
const AGENT_TOOLS = new Set(["Agent", "Task"]);

/**
 * Each task commit (its subject starts `<ID>: `) and the review agents started for its tasks
 * before it: agents whose description says "review" and names the task. A review counts only
 * since the previous commit for any of the same tasks, so an id used again later doesn't inherit
 * an old review. Commit times are compared as instants, whatever their time zone.
 */
export function taskCommitReviews(events: Event[], commits: Commit[]): TaskCommitReview[] {
  const reviewAgents = startedAgents(events).filter((agent) => /\breview/i.test(agent.description));
  const taskCommits = commits
    .flatMap((commit) => {
      const tasks = TASK_COMMIT.exec(commit.subject)?.[1].split(", ");
      return tasks ? [{ ...commit, time: new Date(commit.time).toISOString(), tasks }] : [];
    })
    .sort((a, b) => a.time.localeCompare(b.time));

  return taskCommits.map((commit, index) => {
    const since = taskCommits
      .slice(0, index)
      .findLast((earlier) => earlier.tasks.some((task) => commit.tasks.includes(task)))?.time;
    const reviews = reviewAgents.filter(
      (agent) =>
        agent.time < commit.time &&
        (since === undefined || agent.time > since) &&
        commit.tasks.some((task) => namesTask(agent.description, task)),
    );
    return { hash: commit.hash, time: commit.time, subject: commit.subject, tasks: commit.tasks, reviewed: reviews.length > 0, reviews };
  });
}

/** Whether `text` names `task` itself, not a longer id that starts with it (OH.1 in OH.11, BE.4 in BE.4b). */
export function namesTask(text: string, task: string): boolean {
  const escaped = task.replaceAll(".", String.raw`\.`);
  return new RegExp(String.raw`(?<![\w.])${escaped}(?![\w]|\.\w)`).test(text);
}

function startedAgents(events: Event[]): ReviewAgent[] {
  return events.flatMap((event) => {
    const description = event.input?.description;
    if (event.kind !== "tool" || !AGENT_TOOLS.has(event.tool ?? "") || typeof description !== "string") return [];
    return [{ time: event.time, session: event.session, who: event.who, description }];
  });
}
