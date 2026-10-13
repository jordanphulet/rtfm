import { describe, expect, it } from "vitest";
import { toEvents } from "./events.ts";
import type { ContentBlock, Transcript, TranscriptEntry } from "./transcripts.ts";

const at = (second: number) => `2030-01-01T10:00:${String(second).padStart(2, "0")}.000Z`;

function userEntry(second: number, content: string | ContentBlock[], extra: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return { type: "user", uuid: `u${second}`, timestamp: at(second), message: { role: "user", content }, ...extra };
}

const session = (entries: TranscriptEntry[]): Transcript => ({ session: "s1", entries });
const subagent = (entries: TranscriptEntry[]): Transcript => ({
  session: "s1",
  subagent: { id: "a1", description: "ZZ.2 example task" },
  entries,
});

describe("toEvents", () => {
  it("keeps what the user typed, queued messages included, without system reminders", () => {
    const events = toEvents([
      session([
        userEntry(1, "<system-reminder>Context</system-reminder>Fix the example header", { origin: { kind: "human" } }),
        { type: "attachment", uuid: "q1", timestamp: at(2), attachment: { type: "queued_command", prompt: "And the footer", origin: { kind: "human" } } },
      ]),
    ]);
    expect(events.map(({ kind, text }) => [kind, text])).toEqual([
      ["human", "Fix the example header"],
      ["human", "And the footer"],
    ]);
  });

  it("drops harness messages: task notifications, hand-backs, reminders and meta messages", () => {
    const events = toEvents([
      session([
        userEntry(1, "<task-notification>done</task-notification>", { origin: { kind: "task-notification" } }),
        userEntry(2, "[Subagent hand-back] report", { origin: { kind: "peer" }, isMeta: true }),
        userEntry(3, "This session is being continued from a previous conversation"),
        userEntry(4, [{ type: "text", text: "Base directory for this skill: /x" }], { isMeta: true }),
        { type: "attachment", uuid: "q1", timestamp: at(5), attachment: { type: "queued_command", prompt: "<task-notification/>", origin: { kind: "task-notification" } } },
      ]),
      subagent([userEntry(6, "<system-reminder>Read the rules</system-reminder>", { isMeta: true })]),
    ]);
    expect(events).toEqual([]);
  });

  it("keeps a subagent's prompt and the messages its session sends it", () => {
    const events = toEvents([
      subagent([userEntry(1, "Do ZZ.2"), userEntry(2, "One more note", { origin: { kind: "coordinator" }, isMeta: true })]),
    ]);
    expect(events.map(({ kind, text, who }) => [kind, text, who])).toEqual([
      ["prompt", "Do ZZ.2", "subagent: ZZ.2 example task"],
      ["prompt", "One more note", "subagent: ZZ.2 example task"],
    ]);
  });

  it("joins each tool call with its result, and keeps assistant text", () => {
    const events = toEvents([
      session([
        {
          type: "assistant",
          uuid: "a1",
          timestamp: at(1),
          message: {
            role: "assistant",
            content: [
              { type: "thinking" },
              { type: "text", text: "Checking the tree." },
              { type: "tool_use", id: "t1", name: "Bash", input: { command: "git status" } },
            ],
          },
        },
        userEntry(2, [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "Exit code 1\nfatal" }], is_error: true }]),
      ]),
    ]);
    expect(events.map(({ kind, text, tool, result, isError }) => ({ kind, text, tool, result, isError }))).toEqual([
      { kind: "text", text: "Checking the tree.", tool: undefined, result: undefined, isError: undefined },
      { kind: "tool", text: undefined, tool: "Bash", result: "Exit code 1\nfatal", isError: true },
    ]);
    expect(events[1].time).toBe(at(1));
  });
});
