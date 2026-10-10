import { useEffect, useLayoutEffect, type KeyboardEvent, type RefObject } from "react";
import type { AgentStatus } from "../../agent";
import { StatusRing } from "../../ui";
import { jumpToLibrary } from "./jump";
import { Suggestions } from "./Suggestions";
import type { Prompt } from "./usePrompt";
import "./dock.css";

export const AGENT_INPUT_ID = "agent-input";

interface DockProps {
  dockRef: RefObject<HTMLDivElement | null>;
  prompt: Prompt;
  status: AgentStatus;
  send: (text: string) => void;
  onSuggestion: (text: string) => void;
  conversationEmpty: boolean;
  libraryInView: boolean;
}

export function Dock({ dockRef, prompt, status, send, onSuggestion, conversationEmpty, libraryInView }: DockProps) {
  const { draft, setDraft, inputRef, startNewManual } = prompt;
  const idle = status === "idle";
  const canSend = idle && draft.trim() !== "";
  useHeightToFit(inputRef, draft);

  function submit() {
    if (!canSend) return;
    send(draft);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape") event.currentTarget.blur();
  }

  return (
    <div className="dock" ref={dockRef}>
      <div className="page-grid">
        <div className="dock-body">
          <form
            className="well"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <span className="speaker dock-speaker" aria-hidden="true">
              You
            </span>
            <textarea
              id={AGENT_INPUT_ID}
              ref={inputRef}
              className="well-input"
              data-shot="agent-input"
              aria-label="Message the librarian"
              placeholder="Ask the librarian…"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <kbd className="keycap" aria-hidden="true">
              /
            </kbd>
            <button type="submit" className="send" disabled={!canSend}>
              Send
            </button>
          </form>
          <div className="dock-meta">
            <button
              type="button"
              className="text-button library-up"
              data-hidden={libraryInView || undefined}
              onClick={jumpToLibrary}
            >
              Library ↑
            </button>
            {conversationEmpty && draft === "" ? (
              <Suggestions placement="dock" onSend={onSuggestion} onStartNew={startNewManual} />
            ) : (
              <p className="key-hints">Enter to send · Shift+Enter for a new line</p>
            )}
            {!idle && (
              <p className="readout">
                <StatusRing status="writing" />
                Replying…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function useHeightToFit(input: RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const element = input.current;
    if (element) fitHeight(element);
  }, [input, text]);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fitHeight(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [input]);
}

function fitHeight(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}
