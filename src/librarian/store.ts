import { useEffect, useRef, useSyncExternalStore } from "react";
import { repairPartialMarkdown } from "../manual/repair";
import { streamReply } from "./api";
import {
  LIBRARIAN_LIMITS,
  type ConversationMessage,
  type DeleteOutcome,
  type LibrarianAction,
  type LibrarianMessage,
  type LibrarianStatus,
} from "./types";

const THINKING = "Thinking…";
const DEMO_MESSAGES = [
  "What do I have?",
  "Open the one about haunted houses",
  "Can you translate the sourdough manual into Klingon?",
];
const FROZEN_MESSAGE = "Let’s start a new manual about building a treehouse";
const WHOLE_REPLY = 1;

interface ConversationState {
  messages: ConversationMessage[];
  status: LibrarianStatus;
  activity: string;
}

export interface UseLibrarianResult extends ConversationState {
  send: (text: string) => void;
  reportDeleteOutcome: (outcome: DeleteOutcome) => void;
}

type ActionHandler = (action: LibrarianAction) => void;

let messageCount = 0;
let state: ConversationState = { messages: [], status: "idle", activity: THINKING };
let actionHandler: ActionHandler | null = null;
let proposedDeleteReplyId: string | null = null;
const listeners = new Set<() => void>();

void startFromUrl(new URLSearchParams(window.location.search));

/** The URL options: replies played by the server's scripted fake model, so they cost nothing. */
async function startFromUrl(params: URLSearchParams) {
  if (params.get("conversation") === "demo") {
    for (const text of DEMO_MESSAGES) await reply(text, WHOLE_REPLY);
  }
  const freeze = params.get("librarianFreeze");
  if (freeze === "thinking") {
    setState({ messages: [...state.messages, newMessage("user", FROZEN_MESSAGE)], status: "thinking" });
    return;
  }
  const fraction = Number(freeze);
  if (freeze && fraction >= 0 && fraction <= 1) await reply(FROZEN_MESSAGE, fraction);
}

function newMessage(role: ConversationMessage["role"], text: string): ConversationMessage {
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

function setState(changes: Partial<ConversationState>) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}

function send(text: string) {
  const message = text.trim();
  if (message === "" || state.status !== "idle") return;
  void reply(message);
}

/** Notes how the confirmation for the latest proposed delete ended, on the reply that proposed it. */
function reportDeleteOutcome(deleteOutcome: DeleteOutcome) {
  const replyId = proposedDeleteReplyId;
  proposedDeleteReplyId = null;
  if (!replyId) return;
  setState({ messages: state.messages.map((message) => (message.id === replyId ? { ...message, deleteOutcome } : message)) });
}

/**
 * Sends the finished exchanges and the new message, and shows the reply as it streams. Withdrawn
 * text stays on screen until the text that follows it replaces it, and a reply with no text shows
 * no message. A page action is handed to the page once the reply is done, except `created`, which
 * reports a manual already saved and is handed over as it arrives. `freeze` asks for the scripted
 * reply, cut at that fraction, which then stays as it is.
 */
async function reply(text: string, freeze?: number) {
  const conversation: LibrarianMessage[] = [...recentExchanges(state.messages), { role: "user", text }];
  setState({ messages: [...state.messages, newMessage("user", text)], status: "thinking", activity: THINKING });

  const replyId = newMessageId();
  let raw = "";
  let action: LibrarianAction | null = null;

  function showReply(changes: Partial<ConversationMessage>, status: LibrarianStatus) {
    const others = state.messages.filter((message) => message.id !== replyId);
    const message: ConversationMessage = { id: replyId, role: "agent", text: repairPartialMarkdown(raw), ...changes };
    const shown = message.text === "" && !message.failure ? others : [...others, message];
    setState({ messages: shown, status });
  }

  try {
    for await (const event of streamReply(conversation, freeze)) {
      switch (event.event) {
        case "status":
          setState({ status: "thinking", activity: event.data.text });
          break;
        case "text":
          raw += event.data.text;
          showReply({}, "streaming");
          break;
        case "withdraw":
          raw = "";
          break;
        case "action":
          if (event.data.type === "created") actionHandler?.(event.data);
          else action = event.data;
          break;
        case "done":
          showReply({ text: raw }, "idle");
          if (action) handOver(action, replyId);
          return;
        case "frozen":
          return;
        case "failed":
          showReply({ failure: event.data.reason }, "idle");
          return;
      }
    }
    showReply({ failure: "error" }, "idle");
  } catch {
    showReply({ failure: "error" }, "idle");
  }
}

/** Hands a finished reply's action to the page, remembering the reply that proposed a delete. */
function handOver(action: LibrarianAction, replyId: string) {
  if (!actionHandler) return;
  if (action.type === "propose-delete") proposedDeleteReplyId = replyId;
  actionHandler(action);
}

/**
 * The latest exchanges whose reply finished, so the model sees no half-answered turn, within the
 * route's limits: an exchange with a message too long to send is left out.
 */
function recentExchanges(messages: ConversationMessage[]): LibrarianMessage[] {
  const sendable = (text: string) => text.trim() !== "" && text.length <= LIBRARIAN_LIMITS.messageCharacters;
  const exchanges: LibrarianMessage[][] = [];
  messages.forEach((question, index) => {
    const answer = messages[index + 1];
    if (question.role !== "user" || answer?.role !== "agent" || answer.failure) return;
    if (!sendable(question.text) || !sendable(answer.text)) return;
    exchanges.push([
      { role: "user", text: question.text },
      { role: "agent", text: answer.text, deleteOutcome: answer.deleteOutcome },
    ]);
  });
  return exchanges.slice(-LIBRARIAN_LIMITS.earlierExchanges).flat();
}

export function useLibrarian(): UseLibrarianResult {
  const { messages, status, activity } = useSyncExternalStore(subscribe, getState, getState);
  return { messages, status, activity, send, reportDeleteOutcome };
}

/**
 * Hands each page action to `handler` once its reply is done (`created` as soon as it arrives),
 * while the calling component is mounted. An action that arrives while no component is listening
 * is dropped.
 */
export function useLibrarianActions(handler: ActionHandler) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => handleActions((action) => latest.current(action)), []);
}

/** Makes `handler` the one that receives page actions, until the returned function is called. */
export function handleActions(handler: ActionHandler): () => void {
  actionHandler = handler;
  return () => {
    if (actionHandler === handler) actionHandler = null;
  };
}
