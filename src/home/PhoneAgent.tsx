import { useLayoutEffect, useRef, useState } from "react";
import { Sheet } from "../ui";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { LibrarianHead, Separator, StatusDetail } from "./LibrarianHead";
import { NewestButton } from "./NewestButton";
import type { AgentSideProps } from "./agentSide";
import { useStickToBottom } from "./useStickToBottom";
import "./phone-agent.css";

type OpenedBy = "load" | "send" | "toggle";

interface PhoneAgentProps extends AgentSideProps {
  openOnMount: boolean;
}

export function PhoneAgent({ agent, manuals, composer, onJump, onHover, onCue, openOnMount }: PhoneAgentProps) {
  const stick = useStickToBottom();
  const scopeRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(openOnMount);
  const openedBy = useRef<OpenedBy>("load");
  const libraryScroll = useRef<number | null>(null);
  const busy = agent.status !== "idle";

  useLayoutEffect(() => {
    if (open || libraryScroll.current === null) return;
    window.scrollTo(0, libraryScroll.current);
    libraryScroll.current = null;
  }, [open]);

  function openBy(reason: OpenedBy) {
    openedBy.current = reason;
    libraryScroll.current = window.scrollY;
    setOpen(true);
  }

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function send() {
    if (!composer.onSend()) return;
    stick.scrollToBottom();
    if (!open) openBy("send");
  }

  function jump(id: string) {
    setOpen(false);
    requestAnimationFrame(() => onJump(id));
  }

  function focusOnOpen(): HTMLElement | null {
    if (openedBy.current === "send") return composer.fieldRef.current;
    if (openedBy.current === "toggle") return stick.scrollRef.current;
    return focusWhereItIs();
  }

  return (
    <div className="phone-agent" ref={scopeRef}>
      <Sheet
        id="conversation-sheet"
        className="conversation-sheet"
        role="region"
        aria-labelledby="librarian-title"
        open={open}
        onClose={close}
        focusScope={scopeRef}
        focusOnOpen={focusOnOpen}
      >
        <LibrarianHead
          messageCount={agent.messages.length}
          status={agent.status}
          edge={stick.scrolledFromTop}
        />
        <Conversation
          messages={agent.messages}
          status={agent.status}
          manuals={manuals}
          stick={stick}
          onJump={jump}
          onHover={onHover}
          onCue={onCue}
        />
        {stick.scrolledUp && (
          <NewestButton replying={busy} onJump={stick.scrollToBottom} className="sheet-newest" />
        )}
      </Sheet>
      <div className="dock">
        <button
          ref={toggleRef}
          type="button"
          className="dock-toggle"
          aria-expanded={open}
          aria-controls="conversation-sheet"
          onClick={() => (open ? close() : openBy("toggle"))}
        >
          {open ? (
            <span className="dock-label" aria-hidden="true">
              <span className="dock-name">Library</span>
              <Separator />
              {describeManuals(manuals.length)}
            </span>
          ) : (
            <span className="dock-label">
              <span className="dock-name">Librarian</span>
              <StatusDetail messageCount={agent.messages.length} status={agent.status} />
            </span>
          )}
          <span className="dock-action">{open ? "Hide ↓" : "Show ↑"}</span>
        </button>
        <Composer layout="dock" {...composer} onSend={send} busy={busy} />
      </div>
    </div>
  );
}

/** The automatic open at load moves nothing: focus stays where the page left it. */
function focusWhereItIs(): HTMLElement {
  return document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
}

function describeManuals(count: number): string {
  if (count === 0) return "No manuals";
  return count === 1 ? "1 manual" : `${count} manuals`;
}
