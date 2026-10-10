import { useSyncExternalStore } from "react";
import { repairPartialMarkdown } from "../manual/repair";
import { frozenLength, streamChunks } from "../manual/streamer";
import { replyTo } from "./replies";
import type { AgentMessage, AgentStatus } from "./types";

const THINKING_MS = 600;
const DEMO_MESSAGES = [
  "What do I have?",
  "Open the one about haunted houses",
  "Can you translate the sourdough manual into Klingon?",
];
const FROZEN_MESSAGE = "Let’s start a new manual about building a treehouse";

interface AgentState {
  messages: AgentMessage[];
  status: AgentStatus;
}

export interface UseAgentResult extends AgentState {
  send: (text: string) => void;
}

let messageCount = 0;
let state = startingState(new URLSearchParams(window.location.search));
const listeners = new Set<() => void>();

function startingState(params: URLSearchParams): AgentState {
  const demo = params.get("conversation") === "demo" ? DEMO_MESSAGES : [];
  const messages = demo.flatMap((text) => [
    newMessage("user", text),
    newMessage("agent", replyTo(text)),
  ]);

  const freeze = params.get("agentFreeze");
  if (freeze === "thinking") {
    return { messages: [...messages, newMessage("user", FROZEN_MESSAGE)], status: "thinking" };
  }
  const fraction = Number(freeze);
  if (freeze && fraction >= 0 && fraction <= 1) {
    const reply = replyTo(FROZEN_MESSAGE);
    const shown = repairPartialMarkdown(reply.slice(0, frozenLength(reply, fraction)));
    return {
      messages: [...messages, newMessage("user", FROZEN_MESSAGE), newMessage("agent", shown)],
      status: "streaming",
    };
  }
  return { messages, status: "idle" };
}

function newMessage(role: AgentMessage["role"], text: string): AgentMessage {
  return { id: newMessageId(), role, text };
}

function newMessageId(): string {
  messageCount += 1;
  return `message-${messageCount}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState() {
  return state;
}

function setState(changes: Partial<AgentState>) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}

function send(text: string) {
  const message = text.trim();
  if (message === "" || state.status !== "idle") return;

  setState({ messages: [...state.messages, newMessage("user", message)], status: "thinking" });
  setTimeout(() => streamReply(replyTo(message)), THINKING_MS);
}

function streamReply(reply: string) {
  const id = newMessageId();
  const showReply = (text: string, status: AgentStatus) => {
    const others = state.messages.filter((message) => message.id !== id);
    setState({ messages: [...others, { id, role: "agent", text }], status });
  };

  streamChunks(
    reply,
    (shownLength) => showReply(repairPartialMarkdown(reply.slice(0, shownLength)), "streaming"),
    () => showReply(reply, "idle"),
  );
}

export function useAgent(): UseAgentResult {
  const { messages, status } = useSyncExternalStore(subscribe, getState, getState);
  return { messages, status, send };
}
