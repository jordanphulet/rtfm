import { useLayoutEffect, useRef, useState } from "react";
import type { AgentStatus } from "../../agent";
import { Sheet, StatusRing } from "../../ui";
import { Composer } from "./Composer";
import { Conversation } from "./Conversation";
import { NewestButton } from "./NewestButton";
import type { AgentSideProps } from "./agentSide";
import { useStickToBottom } from "./useStickToBottom";
import "./phone-agent.css";

type OpenedBy = "load" | "send" | "toggle";

export function PhoneAgent({ agent, manuals, composer, onJump, onHover, onCue }: AgentSideProps) {
  const stick = useStickToBottom();
  const scopeRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(agent.messages.length > 0);
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
        aria-label="Conversation with the librarian"
        open={open}
        onClose={close}
        focusScope={scopeRef}
        focusOnOpen={focusOnOpen}
      >
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
          <DockStatus messageCount={agent.messages.length} status={agent.status} />
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

function DockStatus({ messageCount, status }: { messageCount: number; status: AgentStatus }) {
  if (status !== "idle") {
    return (
      <span className="dock-status" data-live="">
        <StatusRing status="writing" />
        {status === "thinking" ? "Thinking…" : "Replying…"}
      </span>
    );
  }
  return (
    <span className="dock-status">
      <span className="dock-name">Librarian</span> ·{" "}
      {messageCount === 0 ? "Try asking" : `${messageCount} messages`}
    </span>
  );
}
