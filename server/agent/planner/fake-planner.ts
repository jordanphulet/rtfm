import type { ModelEvent, PromptMessage } from "../../gateway/types.ts";
import type { StoredManual } from "../../storage/types.ts";
import { SAVE_MANUAL_TOOL } from "./prompt.ts";

const LONGEST_TOPIC = 60;
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "for", "in", "of", "on", "or", "the", "to", "with"]);

/**
 * The scripted fake model's planning turn: it saves `fakePlan` for the request in the prompt, so
 * the library can be tried without Claude.
 */
export function fakePlannerTurn(messages: PromptMessage[]): ModelEvent[] {
  const content = messages[0]!.content as string;
  const request = content.match(/<request>\n([\s\S]*)\n<\/request>/)![1]!.replaceAll("&lt;", "<");
  const plan = fakePlan(request);
  return [
    { type: "tool-input", json: JSON.stringify(plan) },
    { type: "tool-use", id: "fake-plan", name: SAVE_MANUAL_TOOL.name, input: plan },
    { type: "stop", reason: "tool_use" },
  ];
}

/** The same small manual for any request, titled after what the request is "about". */
export function fakePlan(request: string): StoredManual {
  const title = titleCase(topicOf(request)) || "A New Manual";
  const subject = title.toLowerCase();
  return {
    id: slugOf(title),
    title,
    subtitle: "Planned by the fake model, to try the library without Claude",
    voice: `A patient practitioner who has spent twenty years on ${subject} and still keeps a notebook of every mistake. Writes in short, plain sentences, addresses the reader as “you”, and gives a number wherever one helps: minutes, measures, costs. Fond of a checklist, wary of shortcuts, and quietly funny about the things that always go wrong on the first attempt. Never casual about safety: stop, check and ask before anything that could hurt someone.`,
    chapters: [
      chapter("before-you-begin", "1", "Before You Begin", [
        ["what-you-will-need", "What You Will Need", `The tools, materials, time and budget that ${subject} asks for.`],
        ["planning-the-work", "Planning the Work", "The order of the work, the risks to plan around and what done looks like."],
      ]),
      chapter("doing-the-work", "2", "Doing the Work", [
        ["first-steps", "First Steps", "The first day’s work, step by step, with the checks that show it went right."],
        ["the-main-event", "The Main Event", `The heart of ${subject}, with the figures and judgement calls that matter most.`],
        ["when-things-go-wrong", "When Things Go Wrong", "The usual failures, how to spot each one early and how to recover."],
      ]),
      chapter("afterwards", "3", "Afterwards", [
        ["looking-after-it", "Looking After It", "The routine care that keeps the result in good shape, season by season."],
        ["where-to-go-next", "Where to Go Next", "Bigger projects, better tools and the people worth learning from next."],
      ]),
    ],
    appendices: [
      chapter("reference", "A", "Reference", [
        ["the-checklist", "The Checklist", `Every step of ${subject} on one page, to tick off as you go.`],
        ["glossary", "Glossary", "The terms this manual uses, each defined in a sentence."],
      ]),
    ],
  };
}

function chapter(id: string, label: string, title: string, sections: [string, string, string][]) {
  return {
    id,
    label,
    title,
    sections: sections.map(([id, title, summary], index) => ({ id, label: `${label}.${index + 1}`, title, summary })),
  };
}

function topicOf(request: string): string {
  const topic = request.match(/\babout\b(.*)$/is)?.[1] ?? request;
  return topic.trim().replace(/[.!?…]+$/, "").slice(0, LONGEST_TOPIC).trim();
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function slugOf(title: string): string {
  return title.toLowerCase().replaceAll(/['’]/g, "").replaceAll(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "a-new-manual";
}
