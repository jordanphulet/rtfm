import type { ContentBlock, Transcript, TranscriptEntry } from "./transcripts.ts";

/**
 * - `human`: a message the user typed.
 * - `prompt`: a message to a subagent from the session that started it.
 * - `text`: an assistant's text.
 * - `tool`: a tool call with its result.
 */
export type EventKind = "human" | "prompt" | "text" | "tool";

export type Event = {
  id: string;
  /** ISO 8601, UTC. */
  time: string;
  session: string;
  /** The subagent's id, for a subagent's event. */
  agent?: string;
  /** The session's title (or id), or the subagent's description. */
  who: string;
  cwd?: string;
  kind: EventKind;
  text?: string;
  tool?: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  /** When the tool call's result came back, ISO 8601, UTC. */
  resultTime?: string;
};

type ToolResult = { result: string; isError: boolean; resultTime: string };

const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

/** The events of every transcript, oldest first. */
export function toEvents(transcripts: Transcript[]): Event[] {
  const results = toolResults(transcripts);
  const events = transcripts.flatMap((transcript) =>
    transcript.entries.flatMap((entry) => entryEvents(entry, transcript, results)),
  );
  return events.sort((a, b) => a.time.localeCompare(b.time));
}

function whoOf(transcript: Transcript): string {
  if (transcript.subagent) return `subagent: ${transcript.subagent.description}`;
  return `session: ${transcript.title ?? transcript.session.slice(0, 8)}`;
}

type EventBase = Pick<Event, "time" | "session" | "agent" | "who" | "cwd">;

function entryEvents(entry: TranscriptEntry, transcript: Transcript, results: Map<string, ToolResult>): Event[] {
  if (!entry.uuid || !entry.timestamp) return [];
  const base: EventBase = {
    time: new Date(entry.timestamp).toISOString(),
    session: transcript.session,
    agent: transcript.subagent?.id,
    who: whoOf(transcript),
    cwd: entry.cwd,
  };
  if (entry.type === "assistant") return assistantEvents(entry, base, results);
  const message = userMessage(entry, transcript);
  return message && message.text !== "" ? [{ id: entry.uuid, ...base, ...message }] : [];
}

function assistantEvents(entry: TranscriptEntry, base: EventBase, results: Map<string, ToolResult>): Event[] {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block, index): Event[] => {
    const id = `${entry.uuid}:${index}`;
    if (block.type === "text") return block.text.trim() ? [{ id, ...base, kind: "text", text: block.text }] : [];
    if (block.type !== "tool_use") return [];
    const { result, isError, resultTime } = results.get(block.id) ?? {};
    return [{ id, ...base, kind: "tool", tool: block.name, input: block.input, result, isError, resultTime }];
  });
}

function userMessage(entry: TranscriptEntry, transcript: Transcript): { kind: EventKind; text: string } | undefined {
  if (isQueuedHumanMessage(entry)) return { kind: "human", text: withoutReminders(String(entry.attachment?.prompt ?? "")) };
  if (entry.type !== "user" || !entry.message) return undefined;
  const kind = userMessageKind(entry, transcript);
  return kind && { kind, text: messageText(entry.message.content) };
}

// Harness messages (task notifications, hand-backs, reminders, skill bodies, summaries of a
// compacted conversation) have an origin other than a human or the coordinator, or are marked
// meta.
function userMessageKind(entry: TranscriptEntry, transcript: Transcript): EventKind | undefined {
  if (typeof entry.message?.content !== "string" && entry.message?.content.some((block) => block.type === "tool_result")) {
    return undefined;
  }
  if (entry.origin?.kind === "human") return "human";
  if (!transcript.subagent) return undefined;
  if (entry.origin?.kind === "coordinator" || (!entry.origin && !entry.isMeta)) return "prompt";
}

function isQueuedHumanMessage(entry: TranscriptEntry): boolean {
  return entry.attachment?.type === "queued_command" && entry.attachment.origin?.kind === "human";
}

function messageText(content: string | ContentBlock[]): string {
  const text = typeof content === "string" ? content : content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
  return withoutReminders(text);
}

function withoutReminders(text: string): string {
  return text.replace(SYSTEM_REMINDER, "").trim();
}

function toolResults(transcripts: Transcript[]): Map<string, ToolResult> {
  const results = new Map<string, ToolResult>();
  for (const { entries } of transcripts) {
    for (const entry of entries) {
      if (entry.type !== "user" || !Array.isArray(entry.message?.content)) continue;
      for (const block of entry.message.content) {
        if (block.type !== "tool_result") continue;
        results.set(block.tool_use_id, {
          result: resultText(block.content),
          isError: block.is_error === true,
          resultTime: new Date(entry.timestamp ?? 0).toISOString(),
        });
      }
    }
  }
  return results;
}

function resultText(content: string | ContentBlock[] | undefined): string {
  if (typeof content === "string") return content;
  return (content ?? []).map((block) => (block.type === "text" ? block.text : `[${block.type}]`)).join("\n");
}
