import type { Gateway } from "../../gateway/gateway.ts";
import type { ModelEvent, ModelPrompt } from "../../gateway/types.ts";
import { readSeedManual } from "../../storage/seed.ts";
import type { ManualStore } from "../../storage/types.ts";
import { checkPlan, takenIdProblem, type PlanResult } from "./check.ts";
import { planRequest, plannerSystemPrompt, SAVE_MANUAL_TOOL } from "./prompt.ts";

/** The seed manual the planner is shown as an example of a plan. */
const EXAMPLE_MANUAL_ID = "moving-house-without-losing-the-cat";

/** One plan, and one retry when it has problems: each attempt is a paid model call. */
const ATTEMPTS = 2;

/** The manual's own title, once the streamed plan has it: `{"id": "…", "title": "…"`. */
const PLAN_TITLE = /^\{[^{[]*?"title"\s*:\s*("(?:[^"\\]|\\.)*")/;
/** Past the plan's opening brace, an array or object: any "title" after it isn't the manual's. */
const NESTED = /[{[]/;

export const REVISING_STATUS = "Revising the plan…";

function titledStatus(title: string, attempt: number): string {
  return `${attempt === 1 ? "Planning" : "Revising"} “${title}”…`;
}

/**
 * Has the model plan a manual for the request and saves it, if the plan passes its checks within
 * two attempts. The retry is told what was wrong with the first plan. Model calls go through the
 * gateway under the `plan-manual` job, and its errors (a cap, a stall) are thrown as they are.
 */
export async function planManual({ gateway, store, request, signal, onStatus }: {
  gateway: Gateway;
  store: ManualStore;
  request: string;
  signal: AbortSignal;
  onStatus: (text: string) => void;
}): Promise<PlanResult> {
  const system = plannerSystemPrompt(await readSeedManual(EXAMPLE_MANUAL_ID));
  let problems: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) onStatus(REVISING_STATUS);
    const takenIds = (await store.listManuals()).map(({ id }) => id);
    const prompt: ModelPrompt = {
      system,
      tools: [SAVE_MANUAL_TOOL],
      messages: [{ role: "user", content: planRequest({ request, takenIds, problems }) }],
    };
    const events = gateway.stream("plan-manual", prompt, signal);
    const plan = await planFrom(events, (title) => onStatus(titledStatus(title, attempt)));
    const checked = "problem" in plan ? { problems: [plan.problem] } : checkPlan(plan.input, takenIds);
    if ("problems" in checked) {
      problems = checked.problems;
      continue;
    }
    if ((await store.createManual(checked.manual)) === "created") return checked;
    problems = [takenIdProblem(checked.manual.id)];
  }
  return { problems };
}

/** The plan's input, or why there is none; `onTitle` hears the title as soon as it streams in. */
async function planFrom(
  events: AsyncIterable<ModelEvent>,
  onTitle: (title: string) => void,
): Promise<{ input: unknown } | { problem: string }> {
  let input: unknown;
  let stopReason = "";
  let streamed = "";
  let seekingTitle = true;
  for await (const event of events) {
    if (event.type === "tool-input" && seekingTitle) {
      streamed += event.json;
      const title = streamed.match(PLAN_TITLE)?.[1];
      if (title !== undefined) onTitle(JSON.parse(title) as string);
      seekingTitle = title === undefined && !NESTED.test(streamed.slice(1));
    }
    if (event.type === "tool-use" && event.name === SAVE_MANUAL_TOOL.name) input ??= event.input;
    if (event.type === "stop") stopReason = event.reason;
  }
  if (input !== undefined) return { input };
  if (stopReason === "max_tokens") return { problem: "The plan was cut off before it was complete: keep it within the size limits." };
  return { problem: "No plan arrived: call save_manual once, with the whole plan." };
}
