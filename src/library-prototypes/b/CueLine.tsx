import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
  type RefObject,
} from "react";
import { useAgent, type AgentStatus } from "../../agent";
import { StatusRing } from "../../ui";
import { Conversation } from "./Conversation";
import { hasModifier } from "./keys";
import { Readout } from "./Readout";
import { Suggestions } from "./Suggestions";
import { useDismissOutside } from "./useDismissOutside";
import { useMediaQuery } from "./useMediaQuery";
import { useSlashKey } from "./useSlashKey";
import "./cue-line.css";

const STARTER_PROMPT = "Let’s start a new manual about ";
const PHONE = "(max-width: 767px)";
const AUTOFOCUS = "(min-width: 1024px) and (pointer: fine)";

export interface CueLineHandle {
  startNewManual: () => void;
}

interface CueLineProps {
  libraryIsEmpty: boolean;
  ref: Ref<CueLineHandle>;
}

export function CueLine({ libraryIsEmpty, ref }: CueLineProps) {
  const { messages, status, send } = useAgent();
  const [draft, setDraft] = useState("");
  const [recalled, setRecalled] = useState<number | null>(null);
  const [open, setOpen] = useState(messages.length > 0);
  const [caretRequest, setCaretRequest] = useState(0);
  const unread = useUnreadReply(status, open);
  const inputRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stuck = useIsStuck(sentinelRef);
  const isPhone = useMediaQuery(PHONE);
  const inputId = useId();

  const hasConversation = messages.length > 0;
  const asks = messages.filter((message) => message.role === "user").map((message) => message.text);

  const fold = useCallback(() => setOpen(false), []);
  useDismissOutside(open, unitRef, fold);
  useSlashKey(inputRef);

  useEffect(() => {
    if (window.matchMedia(AUTOFOCUS).matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (caretRequest === 0 || !input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [caretRequest]);

  function startNewManual() {
    if (draft.trim() === "") setDraft(STARTER_PROMPT);
    setCaretRequest((request) => request + 1);
  }

  useImperativeHandle(ref, () => ({ startNewManual }));

  function openIfConversation() {
    if (hasConversation) setOpen(true);
  }

  function foldToBar() {
    inputRef.current?.focus();
    setOpen(false);
  }

  function fillDraft(text: string) {
    setDraft(text);
    setRecalled(null);
    setCaretRequest((request) => request + 1);
  }

  function showConversation() {
    setOpen(true);
    inputRef.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    inputRef.current?.focus();
    if (status !== "idle" || draft.trim() === "") return;
    send(draft);
    setDraft("");
    setRecalled(null);
    setOpen(true);
  }

  function recall(index: number | null) {
    setRecalled(index);
    setDraft(index === null ? "" : asks[index]);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (hasModifier(event)) return;
    if (event.key === "ArrowUp" && asks.length > 0 && (draft === "" || recalled !== null)) {
      event.preventDefault();
      recall(Math.max(0, (recalled ?? asks.length) - 1));
    } else if (event.key === "ArrowDown" && recalled !== null) {
      event.preventDefault();
      recall(recalled + 1 < asks.length ? recalled + 1 : null);
    }
  }

  function onUnitKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      foldToBar();
    }
  }

  return (
    <>
      <div ref={sentinelRef} className="cue-sentinel" />
      <div className="cue-band" data-stuck={stuck || undefined}>
        <div ref={unitRef} className="cue-unit" data-open={open || undefined} onKeyDown={onUnitKeyDown}>
          <form
            className="cue-bar"
            aria-label="Ask the librarian"
            data-empty={draft === "" || undefined}
            onSubmit={submit}
          >
            <span className="cue-mark" aria-hidden="true">
              ›
            </span>
            <label className="visually-hidden" htmlFor={inputId}>
              Message the librarian
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="cue-input"
              data-shot="agent-input"
              type="text"
              autoComplete="off"
              enterKeyHint="send"
              aria-keyshortcuts="/"
              placeholder={placeholderFor(libraryIsEmpty, isPhone)}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setRecalled(null);
              }}
              onFocus={openIfConversation}
              onClick={openIfConversation}
              onKeyDown={onInputKeyDown}
            />
            <BarSlot status={status} canSend={draft.trim() !== ""} wordsHidden={open || isPhone} />
          </form>
          {hasConversation && (
            <Conversation open={open} onHide={foldToBar} onStartNewManual={startNewManual} />
          )}
          {!hasConversation && draft === "" && (
            <Suggestions className="cue-dropdown" libraryIsEmpty={libraryIsEmpty} onChoose={fillDraft} />
          )}
        </div>
      </div>
      <Readout
        covered={open}
        exchangeCount={asks.length}
        unread={unread}
        draft={draft}
        starterPrompt={STARTER_PROMPT}
        libraryIsEmpty={libraryIsEmpty}
        onSuggest={fillDraft}
        onShow={showConversation}
      />
    </>
  );
}

interface BarSlotProps {
  status: AgentStatus;
  canSend: boolean;
  wordsHidden: boolean;
}

function BarSlot({ status, canSend, wordsHidden }: BarSlotProps) {
  if (status !== "idle") {
    return (
      <span className="cue-slot cue-busy">
        <StatusRing status="writing" />
        <span className={wordsHidden ? "visually-hidden" : undefined}>
          {status === "thinking" ? "Thinking…" : "Replying…"}
        </span>
      </span>
    );
  }
  return (
    <span className="cue-slot">
      <kbd className="keycap cue-keycap" aria-hidden="true">
        /
      </kbd>
      <button type="submit" className="text-button cue-send" disabled={!canSend}>
        Send
      </button>
    </span>
  );
}

function placeholderFor(libraryIsEmpty: boolean, isPhone: boolean): string {
  if (libraryIsEmpty) {
    return isPhone
      ? "What should your first manual teach?"
      : "Tell the librarian what your first manual should teach…";
  }
  return isPhone ? "Ask the librarian…" : "Ask the librarian — open, start or remove a manual…";
}

function useUnreadReply(status: AgentStatus, open: boolean): boolean {
  const [unread, setUnread] = useState(false);
  const previousStatus = useRef(status);

  useEffect(() => {
    if (open) setUnread(false);
    else if (previousStatus.current !== "idle" && status === "idle") setUnread(true);
    previousStatus.current = status;
  }, [status, open]);

  return unread;
}

function useIsStuck(sentinel: RefObject<HTMLElement | null>): boolean {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [sentinel]);

  return stuck;
}
