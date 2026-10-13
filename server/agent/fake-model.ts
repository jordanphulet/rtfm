import { setTimeout as sleep } from "node:timers/promises";
import type { Gateway } from "../gateway/gateway.ts";
import { FAKE_MODEL, type ContentBlock, type Job, type ModelClient, type ModelEvent, type PromptMessage } from "../gateway/types.ts";
import { chunkEnds } from "../writer/fake.ts";
import { fakePlannerTurn } from "./planner/fake-planner.ts";

export interface FakeModelPace {
  /** Before a section's first chunk. */
  sectionDelayMs: number;
  /** Before each librarian turn and each plan. */
  turnDelayMs: number;
  chunkIntervalMs: number;
  /** Between a plan's streamed input and its `save_manual` call. */
  planDelayMs: number;
}

const PACE: FakeModelPace = { sectionDelayMs: 1200, turnDelayMs: 600, chunkIntervalMs: 85, planDelayMs: 2400 };
export const INSTANT_PACE: FakeModelPace = { sectionDelayMs: 0, turnDelayMs: 0, chunkIntervalMs: 0, planDelayMs: 0 };

/** The fake model uses no tokens and reports that, so a complete call of its is never marked estimated. */
const NO_TOKENS: ModelEvent = { type: "usage", inputTokens: 0, outputTokens: 0 };

type Intent = "delete" | "create" | "open" | "list" | "find" | "help" | "fallback";
type Step = { text: string } | { tool: string; input: Record<string, string> };
type ToolResult = Extract<ContentBlock, { type: "tool_result" }>;
type ToolUse = Extract<ContentBlock, { type: "tool_use" }>;
type Found = { id: string; title: string; sections_written?: number; sections?: number }[];
type Created = { manual?: { title: string; chapters: number; sections: number } };

const INTENT_KEYWORDS: [Intent, string[]][] = [
  ["delete", ["delete", "remove"]],
  ["create", ["create", "new", "start"]],
  ["open", ["open", "read"]],
  ["list", ["list", "library", "manuals", "what do i have"]],
  ["find", ["find", "anything", "which"]],
  ["help", ["help"]],
];

const WHAT_I_CAN_DO = `- **list** the manuals you have;
- **find** the one about a topic;
- **open** a manual in the reader;
- **start** a new manual from your description;
- **delete** a manual, once you confirm.`;

export const FAKE_REPLIES = {
  help: `I look after your library. I can:\n\n${WHAT_I_CAN_DO}`,
  fallback: "I can’t do that, I’m afraid. I can list, find, open, start and delete your manuals; ask me for help any time.",
  created: ({ title, chapters, sections }: { title: string; chapters: number; sections: number }) =>
    `*${title}* is on your shelf: ${chapters} chapters and ${sections} sections, with nothing written yet. Each section is written the first time you open it.\n\nShall I open it?`,
  createFailed: "I couldn’t plan that manual, I’m afraid, so nothing was created. Ask me again, perhaps in a few more words.",
  notFound: "I couldn’t find a manual about that. Ask me what you have, and I’ll list them.",
  whichToOpen: "Which manual would you like to open? Ask me what you have, and I’ll list them.",
  whichToDelete: "Tell me which manual to delete, and I’ll ask you to confirm before it goes.",
  emptyLibrary: "Your library is empty.",
};

/**
 * A scripted stand-in for Claude, for development, tests and screenshots, called through the
 * gateway as Bedrock is. It answers each job from its request alone: a section by repeating the
 * user's message (the fake writer sends the sample text), a librarian turn by reading the user's
 * latest message for a keyword and calling the tools a model would, and a plan with `fakePlan`.
 */
export function fakeModel(pace: FakeModelPace = PACE): ModelClient {
  return {
    async *stream({ job, prompt: { messages }, signal }) {
      for await (const event of turn(job, messages, pace, signal)) {
        yield event;
        signal.throwIfAborted();
      }
    },
  };
}

/**
 * The fake model called directly, as a `Gateway` with no caps, kill switch or ledger: for previews,
 * which cost nothing and record nothing, and for tests of what sits above the gateway.
 */
export function unrecordedFakeModel(pace: FakeModelPace): Gateway {
  const model = fakeModel(pace);
  return { stream: (job, prompt, signal) => model.stream({ job, model: FAKE_MODEL, maxTokens: 0, prompt, signal }) };
}

async function* turn(job: Job, messages: PromptMessage[], pace: FakeModelPace, signal: AbortSignal): AsyncGenerator<ModelEvent> {
  const stopReason = yield* content(job, messages, pace, signal);
  yield NO_TOKENS;
  yield { type: "stop", reason: stopReason };
}

/** The turn's text or tool calls, returning its stop reason. */
function content(job: Job, messages: PromptMessage[], pace: FakeModelPace, signal: AbortSignal): AsyncGenerator<ModelEvent, string> {
  switch (job) {
    case "write-section":
      return sectionTurn(messages, pace, signal);
    case "librarian":
      return librarianTurn(messages, pace, signal);
    case "plan-manual":
      return plannerTurn(messages, pace, signal);
  }
}

async function* sectionTurn(messages: PromptMessage[], pace: FakeModelPace, signal: AbortSignal): AsyncGenerator<ModelEvent, string> {
  await sleep(pace.sectionDelayMs, undefined, { signal });
  yield* textInChunks(messages.at(-1)!.content as string, pace, signal);
  return "end_turn";
}

async function* plannerTurn(messages: PromptMessage[], pace: FakeModelPace, signal: AbortSignal): AsyncGenerator<ModelEvent, string> {
  await sleep(pace.turnDelayMs, undefined, { signal });
  for (const event of fakePlannerTurn(messages)) {
    yield event;
    if (event.type === "tool-input") await sleep(pace.planDelayMs, undefined, { signal });
  }
  return "tool_use";
}

async function* librarianTurn(messages: PromptMessage[], pace: FakeModelPace, signal: AbortSignal): AsyncGenerator<ModelEvent, string> {
  const step = nextStep(messages);
  await sleep(pace.turnDelayMs, undefined, { signal });
  if ("tool" in step) {
    yield { type: "tool-use", id: `fake-call-${messages.length}`, name: step.tool, input: step.input };
    return "tool_use";
  }
  yield* textInChunks(step.text, pace, signal);
  return "end_turn";
}

/** The text in the fake writer's chunks (`chunkEnds`), one every `chunkIntervalMs`. */
async function* textInChunks(text: string, pace: FakeModelPace, signal: AbortSignal): AsyncGenerator<ModelEvent> {
  let start = 0;
  for (const end of chunkEnds(text)) {
    if (start > 0) await sleep(pace.chunkIntervalMs, undefined, { signal });
    yield { type: "text", text: text.slice(start, end) };
    start = end;
  }
}

function nextStep(messages: PromptMessage[]): Step {
  const question = userWords(messages.findLast((message) => typeof message.content === "string")?.content as string);
  const intent = intentOf(question);
  const last = messages.at(-1)!;
  if (typeof last.content === "string") return firstStep(intent, question);

  const result = last.content.find((block): block is ToolResult => block.type === "tool_result")!;
  const call = toolUses(messages).find((block) => block.id === result.tool_use_id)!;
  return stepAfter(call, result, intent, messages);
}

/** The user's message without the page's note at its start. */
function userWords(message: string): string {
  return message.replace(/^<page_note>[\s\S]*?<\/page_note>\s*/, "");
}

function firstStep(intent: Intent, question: string): Step {
  switch (intent) {
    case "list":
      return { tool: "list_manuals", input: {} };
    case "find":
    case "open":
    case "delete":
      return { tool: "find_manuals", input: { topic: question } };
    case "create":
      return { tool: "create_manual", input: { request: question } };
    case "help":
      return { text: FAKE_REPLIES.help };
    case "fallback":
      return { text: FAKE_REPLIES.fallback };
  }
}

function stepAfter(call: ToolUse, result: ToolResult, intent: Intent, messages: PromptMessage[]): Step {
  const found = result.is_error ? [] : parseFound(result.content);
  switch (call.name) {
    case "list_manuals":
      return { text: listReply(found) };
    case "find_manuals":
      return afterFind(intent, found);
    case "open_manual":
      return { text: `Opening *${titleOf(messages, call)}*.` };
    case "propose_delete":
      return {
        text: `I’ve found *${titleOf(messages, call)}*. It stays unless you confirm: choose **Delete manual** to delete it, or **Keep it**.`,
      };
    case "create_manual":
      return { text: createdReply(result.content) };
    default:
      throw new Error(`The fake librarian never calls "${call.name}"`);
  }
}

function afterFind(intent: Intent, found: Found): Step {
  const best = found[0];
  if (intent === "open") return best ? { tool: "open_manual", input: { manual_id: best.id } } : { text: FAKE_REPLIES.whichToOpen };
  if (intent === "delete") {
    return best ? { tool: "propose_delete", input: { manual_id: best.id } } : { text: FAKE_REPLIES.whichToDelete };
  }
  if (!best) return { text: FAKE_REPLIES.notFound };
  if (found.length === 1) return { text: `*${best.title}* looks like the one.` };
  return { text: `These look closest:\n\n${found.map(({ title }) => `- *${title}*`).join("\n")}` };
}

function createdReply(content: string): string {
  const { manual } = JSON.parse(content) as Created;
  return manual ? FAKE_REPLIES.created(manual) : FAKE_REPLIES.createFailed;
}

function listReply(found: Found): string {
  if (found.length === 0) return FAKE_REPLIES.emptyLibrary;
  const lines = found.map(({ title, sections_written, sections }) => `- *${title}*: ${sections_written} of ${sections} sections written`);
  const count = found.length === 1 ? "one manual" : `${found.length} manuals`;
  return `You have ${count}:\n\n${lines.join("\n")}`;
}

function intentOf(message: string): Intent {
  const typed = message.toLowerCase().replaceAll("’", "'");
  const words = ` ${typed.match(/[\p{L}\p{N}']+/gu)?.join(" ") ?? ""} `;
  const match = INTENT_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => words.includes(` ${keyword} `)));
  return match?.[0] ?? "fallback";
}

function toolUses(messages: PromptMessage[]): ToolUse[] {
  return messages.flatMap((message) =>
    typeof message.content === "string" ? [] : message.content.filter((block): block is ToolUse => block.type === "tool_use"),
  );
}

function titleOf(messages: PromptMessage[], call: ToolUse): string {
  const manualId = (call.input as { manual_id: string }).manual_id;
  const results = messages.flatMap((message) =>
    typeof message.content === "string" ? [] : message.content.filter((block): block is ToolResult => block.type === "tool_result"),
  );
  const manual = results.flatMap((block) => parseFound(block.content)).find(({ id }) => id === manualId);
  return manual?.title ?? manualId;
}

function parseFound(content: string): Found {
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as Found) : [];
  } catch {
    return [];
  }
}
