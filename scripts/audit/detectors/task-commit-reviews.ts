import type { Event } from "../events.ts";
import type { Commit } from "../repo.ts";
import { namedTasks, TASK_ID } from "../task-ids.ts";

export type ReviewAgent = { time: string; session: string; who: string; description: string };

/**
 * - `task`: a commit whose subject starts with task ids.
 * - `own`: any other commit with Claude's co-author line that changes more than `WORKLIST.md`:
 *   the orchestrator's own work.
 */
export type CommitKind = "task" | "own";

export type TaskCommitReview = {
  hash: string;
  /** ISO 8601, UTC. */
  time: string;
  subject: string;
  kind: CommitKind;
  tasks: string[];
  changedLines: number;
  /** More changed lines than `npm run commit-task -- --no-review` allows. */
  needsReview: boolean;
  reviewed: boolean;
  /** The review agents started for the commit before it was made. */
  reviews: ReviewAgent[];
};

type StartedReview = ReviewAgent & { prompt: string };
type ListedCommit = Omit<TaskCommitReview, "needsReview" | "reviewed" | "reviews">;

const TASK_COMMIT = new RegExp(String.raw`^(${TASK_ID}(?:, ${TASK_ID})*): `);
const AGENT_TOOLS = new Set(["Agent", "Task"]);
const WORKLIST = "WORKLIST.md";
// `design A`, `variant C`, or a possessive `B's` after the first word.
const DESIGN_LETTER = /\b(?:design|variant) ([A-Z])(?![\w.])|(?<=\S.*)(?<![\w.])([A-Z])['’]s\b/g;
const SHARED_TITLE_WORDS = 2;
const NO_REVIEW_LINE_LIMIT = 40;
const WORD_MATCH_HOURS = 3;
// Words that say nothing about which commit a review is for.
const FILLER_WORDS = "a an and the of for to in on with by at from as into it its is this that".split(" ");
const REVIEW_WORDS = ["review", "reviewer", "code", "independent", "round", "diff", "change"];
const SMALL_WORDS = new Set([...FILLER_WORDS, ...REVIEW_WORDS]);

/**
 * Each task commit on main and each of the orchestrator's own commits, with the review agents
 * started for it (Agent calls whose description says "review", not "preview"). A review agent
 * counts for:
 *
 * - each task its description names: the first commit of that task after it;
 * - else the one task its prompt names, if it names exactly one, the same way;
 * - else the first commit within three hours after it that it matches, and the commits that
 *   directly follow that one and match too. It matches a commit when its description names a
 *   design letter (`design A`, `variant A`, or `A's` after the first word) that is a part of the
 *   commit's task id (`P1.A.build`), or, naming none, shares two words or one file name with the
 *   commit's title.
 *
 * Commit times are compared as instants, whatever their time zone.
 */
export function taskCommitReviews(events: Event[], commits: Commit[]): TaskCommitReview[] {
  const listed = commits
    .flatMap((commit): ListedCommit[] => {
      const tasks = TASK_COMMIT.exec(commit.subject)?.[1].split(", ");
      const isOwn = commit.byClaude && commit.files.some((file) => file !== WORKLIST);
      if (!tasks && !isOwn) return [];
      const { hash, subject, changedLines } = commit;
      return [
        {
          hash,
          time: new Date(commit.time).toISOString(),
          subject,
          kind: tasks ? "task" : "own",
          tasks: tasks ?? [],
          changedLines,
        },
      ];
    })
    .sort((a, b) => a.time.localeCompare(b.time));

  const reviews = listed.map((): ReviewAgent[] => []);
  for (const review of startedReviews(events)) {
    for (const index of reviewedCommits(review, listed)) reviews[index].push(withoutPrompt(review));
  }
  return listed.map((commit, index) => ({
    ...commit,
    needsReview: commit.changedLines > NO_REVIEW_LINE_LIMIT,
    reviewed: reviews[index].length > 0,
    reviews: reviews[index],
  }));
}

/** The indexes in `commits` of the commits `review` counts for. */
function reviewedCommits(review: StartedReview, commits: ListedCommit[]): number[] {
  const after = commits.findIndex((commit) => commit.time > review.time);
  if (after === -1) return [];
  const firstCommits = (tasks: string[]) => {
    const first = tasks.map((task) => commits.findIndex((commit, index) => index >= after && commit.tasks.includes(task)));
    return [...new Set(first.filter((index) => index !== -1))];
  };
  const inDescription = namedTasks(review.description);
  if (inDescription.length > 0) return firstCommits(inDescription);
  const inPrompt = [...new Set(namedTasks(review.prompt))];
  const byPrompt = inPrompt.length === 1 ? firstCommits(inPrompt) : [];
  if (byPrompt.length > 0) return byPrompt;
  const until = new Date(Date.parse(review.time) + WORD_MATCH_HOURS * 3600_000).toISOString();
  const matches = (commit: ListedCommit) => commit.time < until && matchesWords(review.description, commit);
  const start = commits.findIndex((commit, index) => index >= after && matches(commit));
  if (start === -1) return [];
  let end = start + 1;
  while (end < commits.length && matches(commits[end])) end++;
  return Array.from({ length: end - start }, (_, offset) => start + offset);
}

function matchesWords(description: string, commit: ListedCommit): boolean {
  const letters = [...description.matchAll(DESIGN_LETTER)].map((match) => match[1] ?? match[2]);
  if (letters.length > 0) return commit.tasks.some((task) => task.split(".").some((part) => letters.includes(part)));
  const title = new Set(words(commit.subject.replace(TASK_COMMIT, "")));
  const shared = new Set(words(description).filter((word) => title.has(word)));
  return shared.size >= SHARED_TITLE_WORDS || [...shared].some(isFileName);
}

// Lowercase words without small words, possessives or a plural `s`, so "specs" meets "spec". A
// file name such as `ARCHITECTURE.md` stays one word.
function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/['’]s\b/g, "")
      .match(/[a-z0-9]+(?:\.[a-z0-9]+)*/g) ?? []
  )
    .filter((word) => !SMALL_WORDS.has(word))
    .map((word) => (isFileName(word) ? word : word.replace(/s$/, "")));
}

function isFileName(word: string): boolean {
  return word.includes(".");
}

function startedReviews(events: Event[]): StartedReview[] {
  return events.flatMap((event) => {
    const description = event.input?.description;
    if (event.kind !== "tool" || !AGENT_TOOLS.has(event.tool ?? "") || typeof description !== "string") return [];
    if (!/\breview/i.test(description)) return [];
    const prompt = typeof event.input?.prompt === "string" ? event.input.prompt : "";
    return [{ time: event.time, session: event.session, who: event.who, description, prompt }];
  });
}

function withoutPrompt({ time, session, who, description }: StartedReview): ReviewAgent {
  return { time, session, who, description };
}
